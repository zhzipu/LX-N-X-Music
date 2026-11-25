package com.guichaguri.trackplayer.spectrum;

import java.util.ArrayDeque;
import java.util.Arrays;

/** Playback-thread-only FFT and timestamp queue; independent of Android for signal tests. */
public final class PcmSpectrum {
    public static final int BANDS = 96;
    private static final int SIZE = 4096;
    private final double[] window = new double[SIZE];
    private final double[] real = new double[SIZE];
    private final double[] imag = new double[SIZE];
    private final double[] power = new double[SIZE / 2 + 1];
    private final ArrayDeque<Frame> pending = new ArrayDeque<>();
    private double[][] ring;
    private int sampleRate, channels, cursor, count, hop;
    private long lastSampleUs = Long.MIN_VALUE;

    public static final class Frame {
        public final long timeUs;
        public final float[] bands;
        Frame(long timeUs, float[] bands) { this.timeUs = timeUs; this.bands = bands; }
    }

    public PcmSpectrum() {
        for (int i = 0; i < SIZE; i++) window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / SIZE);
    }

    public void configure(int sampleRate, int channels) {
        this.sampleRate = sampleRate;
        this.channels = channels;
        ring = new double[channels][SIZE];
        clear();
    }

    public void clear() {
        cursor = count = hop = 0;
        lastSampleUs = Long.MIN_VALUE;
        pending.clear();
        if (ring != null) for (double[] channel : ring) Arrays.fill(channel, 0);
    }

    public void add(double[] sample, long timeUs) {
        // Never mix windows across seeks, timestamp jumps or track transitions.
        if (lastSampleUs != Long.MIN_VALUE &&
                (timeUs < lastSampleUs || timeUs - lastSampleUs > 10000)) clear();
        lastSampleUs = timeUs;
        for (int ch = 0; ch < channels; ch++) ring[ch][cursor] = sample[ch];
        cursor = (cursor + 1) & (SIZE - 1);
        if (count < SIZE) count++;
        hop++;
        if (count < SIZE || hop < Math.max(1, sampleRate / 30)) return;
        hop = 0;
        // Center of the analysis window, in the AudioSink's media-time domain.
        pending.addLast(new Frame(timeUs - (SIZE / 2L) * 1000000L / sampleRate, transform()));
        // Bound memory even if a sink buffers unusually far ahead.
        while (pending.size() > 128) pending.removeFirst();
    }

    public Frame takeAt(long playedUs) {
        Frame frame = null;
        while (!pending.isEmpty() && pending.peekFirst().timeUs <= playedUs) frame = pending.removeFirst();
        return frame;
    }

    private float[] transform() {
        Arrays.fill(power, 0);
        for (int ch = 0; ch < channels; ch++) {
            for (int i = 0; i < SIZE; i++) {
                real[i] = ring[ch][(cursor + i) & (SIZE - 1)] * window[i];
                imag[i] = 0;
            }
            fft();
            // Average channel power instead of samples: antiphase stereo must not cancel.
            for (int i = 0; i < power.length; i++) power[i] += (real[i] * real[i] + imag[i] * imag[i]) / channels;
        }
        float[] bands = new float[BANDS];
        double upperHz = Math.min(16000, sampleRate / 2.0);
        for (int b = 0; b < BANDS; b++) {
            double low = 40 * Math.pow(upperHz / 40, b / (double) BANDS);
            double high = 40 * Math.pow(upperHz / 40, (b + 1.0) / BANDS);
            int start = Math.max(1, (int) Math.floor(low * SIZE / sampleRate));
            int end = Math.min(power.length - 1, Math.max(start, (int) Math.ceil(high * SIZE / sampleRate) - 1));
            double peak = 0;
            for (int k = start; k <= end; k++) peak = Math.max(peak, power[k]);
            // Hann coherent gain = 0.5; a full-scale bin-centered sine is 0 dBFS.
            double amplitude = Math.sqrt(peak) * 4 / SIZE;
            double db = 20 * Math.log10(Math.max(1e-9, amplitude));
            bands[b] = (float) Math.max(0, Math.min(1, (db + 72) / 72));
        }
        return bands;
    }

    private void fft() {
        for (int i = 1, j = 0; i < SIZE; i++) {
            int bit = SIZE >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                double t = real[i]; real[i] = real[j]; real[j] = t;
                t = imag[i]; imag[i] = imag[j]; imag[j] = t;
            }
        }
        for (int length = 2; length <= SIZE; length <<= 1) {
            double angle = -2 * Math.PI / length;
            double wrStep = Math.cos(angle), wiStep = Math.sin(angle);
            for (int start = 0; start < SIZE; start += length) {
                double wr = 1, wi = 0;
                for (int j = 0; j < length / 2; j++) {
                    int a = start + j, b = a + length / 2;
                    double br = real[b] * wr - imag[b] * wi;
                    double bi = real[b] * wi + imag[b] * wr;
                    real[b] = real[a] - br; imag[b] = imag[a] - bi;
                    real[a] += br; imag[a] += bi;
                    double nextWr = wr * wrStep - wi * wiStep;
                    wi = wr * wiStep + wi * wrStep; wr = nextWr;
                }
            }
        }
    }
}
