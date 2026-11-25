package com.guichaguri.trackplayer.spectrum;

import android.os.SystemClock;
import androidx.media3.common.TrackSelectionParameters.AudioOffloadPreferences;
import androidx.media3.exoplayer.ExoPlayer;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

/** Player control runs on the application looper; frame publication runs on the audio thread. */
public final class SpectrumBridge {
    public static volatile boolean enabled;
    public static volatile int generation;
    private static ExoPlayer player;
    private static AudioOffloadPreferences savedOffload;
    private static float[] latest;
    private static long capturedAt, sequence;

    public static void attach(ExoPlayer value) {
        player = value;
        savedOffload = null;
        invalidate();
        if (enabled) applyOffload();
    }

    public static void detach() {
        player = null;
        savedOffload = null;
        invalidate();
    }

    public static void setEnabled(boolean value) {
        if (enabled == value) return;
        enabled = value;
        invalidate();
        applyOffload();
    }

    private static void applyOffload() {
        if (player == null) return;
        if (enabled) {
            if (savedOffload == null) savedOffload = player.getTrackSelectionParameters().audioOffloadPreferences;
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                    .setAudioOffloadPreferences(new AudioOffloadPreferences.Builder()
                            .setAudioOffloadMode(AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_DISABLED).build()).build());
        } else if (savedOffload != null) {
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                    .setAudioOffloadPreferences(savedOffload).build());
            savedOffload = null;
        }
    }

    public static synchronized void invalidate() {
        generation++;
        latest = null;
    }

    public static synchronized void publish(PcmSpectrum.Frame frame, int sourceGeneration) {
        if (!enabled || sourceGeneration != generation) return;
        latest = frame.bands;
        capturedAt = SystemClock.elapsedRealtime();
        sequence++;
    }

    public static synchronized WritableMap read() {
        if (!enabled || player == null || !player.isPlaying() || latest == null ||
                SystemClock.elapsedRealtime() - capturedAt > 180) return null;
        WritableArray values = Arguments.createArray();
        for (float value : latest) values.pushDouble(value);
        WritableMap result = Arguments.createMap();
        result.putDouble("sequence", sequence);
        result.putArray("bands", values);
        return result;
    }
}
