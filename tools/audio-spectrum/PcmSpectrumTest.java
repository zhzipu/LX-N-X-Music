package com.guichaguri.trackplayer.spectrum;

public final class PcmSpectrumTest {
    private static void check(boolean pass, String message) {
        if (!pass) throw new AssertionError(message);
    }

    private static void feed(PcmSpectrum spectrum, int rate, double frequency, double amplitude, int channels,
                             boolean antiphase, long startUs) {
        double[] sample = new double[channels];
        for (int i = 0; i < rate / 3; i++) {
            double value = amplitude * Math.sin(2 * Math.PI * frequency * i / rate);
            for (int ch = 0; ch < channels; ch++) sample[ch] = antiphase && ch % 2 == 1 ? -value : value;
            spectrum.add(sample, startUs + i * 1000000L / rate);
        }
    }

    private static float[] signal(int rate, double hz, double amplitude, int channels, boolean antiphase) {
        PcmSpectrum spectrum = new PcmSpectrum();
        spectrum.configure(rate, channels);
        feed(spectrum, rate, hz, amplitude, channels, antiphase, 0);
        PcmSpectrum.Frame frame = spectrum.takeAt(1000000);
        check(frame != null, "must produce FFT frames");
        for (float value : frame.bands) check(Float.isFinite(value) && value >= 0 && value <= 1, "bounded finite data");
        return frame.bands;
    }

    private static int peak(float[] bands) {
        int peak = 0;
        for (int i = 1; i < bands.length; i++) if (bands[i] > bands[peak]) peak = i;
        return peak;
    }

    public static void main(String[] args) {
        for (int rate : new int[] {44100, 48000, 96000}) {
            float[] silent = signal(rate, 440, 0, 2, false);
            for (float value : silent) check(value == 0, "silence must be exactly zero");
            float[] low = signal(rate, 100, 0.5, 2, false);
            float[] high = signal(rate, 4000, 0.5, 2, false);
            check(peak(low) < 22 && peak(high) > 65, "frequency peaks must move from bass to treble");
            float[] loud = signal(rate, 1000, 0.5, 2, false);
            float[] quiet = signal(rate, 1000, 0.05, 2, false);
            check(loud[peak(loud)] - quiet[peak(loud)] > 0.25, "20 dB amplitude change must remain visible");
            float[] opposite = signal(rate, 1000, 0.5, 2, true);
            for (int i = 0; i < loud.length; i++) check(Math.abs(loud[i] - opposite[i]) < 1e-6, "antiphase stereo must not cancel");
        }

        PcmSpectrum spectrum = new PcmSpectrum();
        spectrum.configure(48000, 1);
        feed(spectrum, 48000, 1000, 0.5, 1, false, 2000000);
        check(spectrum.takeAt(1999999) == null, "decoded audio must not be displayed before playback reaches it");
        PcmSpectrum.Frame first = spectrum.takeAt(2100000);
        check(first != null && first.timeUs <= 2100000, "select frame at playback head");
        check(spectrum.takeAt(2100000) == null, "one frame must not be published twice");
        feed(spectrum, 48000, 100, 0.5, 1, false, 0);
        PcmSpectrum.Frame afterSeek = spectrum.takeAt(1000000);
        check(afterSeek != null && peak(afterSeek.bands) < 22, "backward seek discards queued old frequency");
        spectrum.clear();
        check(spectrum.takeAt(Long.MAX_VALUE) == null, "flush must empty frame queue");
        System.out.println("PASS: PCM silence, frequency, amplitude, sample rates, antiphase stereo, playback timing and seek reset");
    }
}
