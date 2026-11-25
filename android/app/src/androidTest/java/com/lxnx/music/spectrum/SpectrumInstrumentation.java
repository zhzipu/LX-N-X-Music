package com.lxnx.music.spectrum;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.os.Bundle;
import android.os.SystemClock;
import androidx.media3.common.MediaItem;
import androidx.media3.common.TrackSelectionParameters.AudioOffloadPreferences;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.audio.AudioSink;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableMap;
import com.guichaguri.trackplayer.spectrum.SpectrumAudioSink;
import com.guichaguri.trackplayer.spectrum.SpectrumBridge;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Standalone device smoke test. Playback volume is zero; samples are generated locally. */
public final class SpectrumInstrumentation extends Instrumentation {
    private ExoPlayer player;
    private File wav;
    private volatile long position;
    private volatile double peak;
    private volatile int band;
    private volatile boolean hasFrame;
    private volatile String playbackError;

    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            wav = new File(getTargetContext().getCacheDir(), "spectrum-smoke.wav");
            writeWav(wav);
            runOnMainSync(() -> {
                Context context = getTargetContext();
                DefaultRenderersFactory factory = new DefaultRenderersFactory(context) {
                    @Override protected AudioSink buildAudioSink(Context c, boolean f, boolean p) {
                        return new SpectrumAudioSink(super.buildAudioSink(c, f, p));
                    }
                };
                player = new ExoPlayer.Builder(context, factory).build();
                player.setVolume(0); // Analyse PCM without making sound or changing system volume.
                player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                        .setAudioOffloadPreferences(new AudioOffloadPreferences.Builder()
                                .setAudioOffloadMode(AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_ENABLED).build()).build());
                SpectrumBridge.attach(player);
                SpectrumBridge.setEnabled(true);
                check(player.getTrackSelectionParameters().audioOffloadPreferences.audioOffloadMode ==
                        AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_DISABLED, "offload disabled during analysis");
                player.setMediaItem(MediaItem.fromUri(wav.toURI().toString()));
                player.prepare();
                player.play();
            });

            boolean low = false, silence = false, high = false, antiphase = false;
            long deadline = SystemClock.elapsedRealtime() + 18000;
            while (SystemClock.elapsedRealtime() < deadline) {
                sample();
                check(playbackError == null, "playback error: " + playbackError);
                if (hasFrame) {
                    if (position > 1300 && position < 2600) { check(peak > 0.6 && band < 24, "bass spectrum"); low = true; }
                    if (position > 3300 && position < 3700) { check(peak == 0, "silent segment must be zero"); silence = true; }
                    if (position > 4300 && position < 5600) { check(peak > 0.6 && band > 65, "treble spectrum"); high = true; }
                    if (position > 6300 && position < 7500) { check(peak > 0.6 && band > 45 && band < 58, "antiphase stereo spectrum"); antiphase = true; }
                }
                if (position > 7500) break;
                SystemClock.sleep(35);
            }
            check(low && silence && high && antiphase, "all timed segments observed: " + low + "," + silence + "," + high + "," + antiphase);
            runOnMainSync(() -> {
                player.pause();
                check(SpectrumBridge.read() == null, "paused playback must not return a live spectrum");
                player.seekTo(1500);
                player.play();
            });
            boolean seek = false;
            deadline = SystemClock.elapsedRealtime() + 5000;
            while (SystemClock.elapsedRealtime() < deadline) {
                sample();
                if (hasFrame && position > 1600 && position < 2500 && peak > 0.6 && band < 24) { seek = true; break; }
                SystemClock.sleep(35);
            }
            check(seek, "seek must switch from treble to bass without old queued frames");
            runOnMainSync(() -> {
                SpectrumBridge.setEnabled(false);
                check(SpectrumBridge.read() == null, "disabled analyser returns no frames");
                check(player.getTrackSelectionParameters().audioOffloadPreferences.audioOffloadMode ==
                        AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_ENABLED, "restore original offload preference");
            });
            result.putString("stream", "PASS: actual ExoPlayer PCM, playback-head timing, silence, bass/treble, antiphase, pause, seek and offload restoration\n");
        } catch (Throwable error) {
            result.putString("stream", "FAIL: " + android.util.Log.getStackTraceString(error));
            result.putString("error", error.toString());
        } finally {
            runOnMainSync(() -> {
                SpectrumBridge.setEnabled(false);
                SpectrumBridge.detach();
                if (player != null) player.release();
            });
            if (wav != null) wav.delete();
        }
        finish(result.containsKey("error") ? Activity.RESULT_CANCELED : Activity.RESULT_OK, result);
    }

    private void sample() {
        runOnMainSync(() -> {
            position = player.getCurrentPosition();
            playbackError = player.getPlayerError() == null ? null : player.getPlayerError().toString();
            WritableMap frame = SpectrumBridge.read();
            hasFrame = frame != null;
            peak = 0; band = 0;
            if (frame != null) {
                ReadableArray values = frame.getArray("bands");
                check(values != null && values.size() == 96, "96 native frequency bands");
                for (int i = 0; i < values.size(); i++) {
                    double value = values.getDouble(i);
                    check(Double.isFinite(value) && value >= 0 && value <= 1, "finite normalized native data");
                    if (value > peak) { peak = value; band = i; }
                }
            }
        });
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void writeWav(File file) throws Exception {
        int rate = 48000, frames = rate * 8, dataBytes = frames * 4;
        ByteBuffer bytes = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN);
        bytes.put(new byte[] {'R','I','F','F'}).putInt(36 + dataBytes).put(new byte[] {'W','A','V','E','f','m','t',' '});
        bytes.putInt(16).putShort((short) 1).putShort((short) 2).putInt(rate).putInt(rate * 4).putShort((short) 4).putShort((short) 16);
        bytes.put(new byte[] {'d','a','t','a'}).putInt(dataBytes);
        for (int i = 0; i < frames; i++) {
            double seconds = i / (double) rate;
            double hz = seconds < 1 ? 0 : seconds < 3 ? 100 : seconds < 4 ? 0 : seconds < 6 ? 4000 : 1000;
            short value = (short) (16000 * Math.sin(2 * Math.PI * hz * i / rate));
            bytes.putShort(value).putShort(seconds >= 6 ? (short) -value : value);
        }
        try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes.array()); }
    }
}
