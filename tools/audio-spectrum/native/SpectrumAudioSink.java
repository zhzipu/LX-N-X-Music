package com.guichaguri.trackplayer.spectrum;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.util.Util;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.ForwardingAudioSink;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Observes consumed PCM without changing its bytes, limits or playback processing. */
public final class SpectrumAudioSink extends ForwardingAudioSink {
    private final PcmSpectrum spectrum = new PcmSpectrum();
    private Format format;
    private int bytesPerFrame, generation = -1;
    private double[] sample;
    private boolean playing;
    private ByteBuffer currentBuffer;
    private int bufferStart;

    public SpectrumAudioSink(AudioSink sink) { super(sink); }

    @Override public void configure(Format format, int bufferSize, int[] outputChannels) throws ConfigurationException {
        super.configure(format, bufferSize, outputChannels);
        this.format = format;
        boolean supported = format.pcmEncoding == C.ENCODING_PCM_8BIT || format.pcmEncoding == C.ENCODING_PCM_16BIT ||
                format.pcmEncoding == C.ENCODING_PCM_24BIT || format.pcmEncoding == C.ENCODING_PCM_32BIT ||
                format.pcmEncoding == C.ENCODING_PCM_FLOAT;
        bytesPerFrame = MimeTypes.AUDIO_RAW.equals(format.sampleMimeType) && supported
                ? Util.getPcmFrameSize(format.pcmEncoding, format.channelCount) : 0;
        if (bytesPerFrame > 0) {
            spectrum.configure(format.sampleRate, format.channelCount);
            sample = new double[format.channelCount];
        }
        clear();
    }

    @Override public boolean handleBuffer(ByteBuffer buffer, long timeUs, int accessUnits)
            throws InitializationException, WriteException {
        if (currentBuffer != buffer) {
            currentBuffer = buffer;
            bufferStart = buffer.position();
        }
        ByteBuffer pcm = SpectrumBridge.enabled && bytesPerFrame > 0
                ? buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN) : null;
        boolean handled = super.handleBuffer(buffer, timeUs, accessUnits);
        if (generation != SpectrumBridge.generation) {
            spectrum.clear();
            generation = SpectrumBridge.generation;
        }
        if (pcm != null) {
            // Only the consumed slice is analysed. Retried/partially written buffers cannot duplicate samples.
            pcm.limit(buffer.position());
            while (pcm.remaining() >= bytesPerFrame) {
                long sampleUs = timeUs + (long) (pcm.position() - bufferStart) / bytesPerFrame * 1000000L / format.sampleRate;
                for (int ch = 0; ch < sample.length; ch++) sample[ch] = readSample(pcm, format.pcmEncoding);
                spectrum.add(sample, sampleUs);
            }
        }
        publishPlayed();
        if (handled) currentBuffer = null;
        return handled;
    }

    private static double readSample(ByteBuffer data, int encoding) {
        switch (encoding) {
            case C.ENCODING_PCM_8BIT: return ((data.get() & 255) - 128) / 128.0;
            case C.ENCODING_PCM_16BIT: return data.getShort() / 32768.0;
            case C.ENCODING_PCM_24BIT:
                return ((data.get() & 255) | ((data.get() & 255) << 8) | (data.get() << 16)) / 8388608.0;
            case C.ENCODING_PCM_32BIT: return data.getInt() / 2147483648.0;
            case C.ENCODING_PCM_FLOAT:
                float value = data.getFloat();
                return Float.isNaN(value) || Float.isInfinite(value) ? 0 : value;
            default: throw new IllegalArgumentException("Unsupported PCM encoding: " + encoding);
        }
    }

    private void publishPlayed() {
        if (!playing || !SpectrumBridge.enabled) return;
        long position = super.getCurrentPositionUs(false);
        if (position == AudioSink.CURRENT_POSITION_NOT_SET) return;
        PcmSpectrum.Frame frame = spectrum.takeAt(position);
        if (frame != null && position - frame.timeUs <= 180000) SpectrumBridge.publish(frame, generation);
    }

    private void clear() {
        currentBuffer = null;
        spectrum.clear();
        SpectrumBridge.invalidate();
        generation = SpectrumBridge.generation;
    }

    @Override public void play() { super.play(); playing = true; }
    @Override public void pause() { super.pause(); playing = false; }
    @Override public void playToEndOfStream() throws WriteException { super.playToEndOfStream(); publishPlayed(); }
    @Override public void handleDiscontinuity() { super.handleDiscontinuity(); clear(); }
    @Override public void flush() { super.flush(); clear(); }
    @Override public void reset() { super.reset(); clear(); }
}
