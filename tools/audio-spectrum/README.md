# Real playback spectrum

The vertical player's bars consume a 96-band FFT of ExoPlayer's decoded PCM.
There is no synthetic beat/noise fallback and no microphone/system-audio capture.

`patch-player.js` installs the Java sources in the pinned TrackPlayer dependency
and connects its `MusicManager` and React Native module. It runs in `postinstall`,
is idempotent, and fails if upstream patch anchors change. After editing native
sources here, run `node tools/audio-spectrum/patch-player.js` and rebuild the APK.
A Metro reload alone cannot add the native methods.

The forwarding audio sink reads only consumed PCM bytes and does not modify the
playback buffers. A 4096-sample Hann window, channel-power averaging and FFT yield
96 logarithmic bands from 40 Hz to min(16 kHz, Nyquist), mapped from -72 to 0 dBFS.
Channel-power averaging preserves antiphase stereo. Timestamped frames are queued
until the sink's playback head reaches them, instead of displaying decoded audio
ahead of playback. Unsupported PCM encodings or encoded passthrough produce no
frames. This is a spectrum of source audio before the player's volume gain.

Analysis runs only while the playback page is foreground. While enabled, audio
offload is disabled to ensure PCM decoding; closing/covering the page or putting
the app in the background restores the previous preference. Pause avoids native
polling and lets bars settle. Seek/flush/format changes invalidate old windows.
The bridge sends only band values (about 30 frames/sec), never raw PCM. Missing or
repeated frames expire after 180 ms. React/SVG updates are capped at about 30 fps.

## Verification

Run `npm run test:audio-spectrum` (Node and JDK required) for silence, frequency
placement, amplitude response, 44.1/48/96 kHz, antiphase stereo, playback-time queue,
seek reset and frontend stale/pause handling.

The Android test source `SpectrumInstrumentation` exercises the real Media3 sink
on a device using a generated WAV at player volume zero. It checks timed silence,
bass, treble, antiphase stereo, pause, seek and restoring audio offload. Build and
install the debug app (`com.lxnx.music.dev`) and test APK, then run:

```powershell
adb shell am instrument -w com.lxnx.music.dev.test/com.lxnx.music.spectrum.SpectrumInstrumentation
```

The test does not overwrite the release app or use its library/account data.
It creates and deletes its own cache WAV. No screen interaction is required.

### Verified on 2026-11-18

- `npm run test:audio-spectrum`: passed the Java signal/timing tests and TS display-state tests.
- `:react-native-track-player:compileDebugJavaWithJavac`: passed.
- `:app:assembleDebug :app:assembleDebugAndroidTest`: passed.
- `:app:assembleRelease` (arm64-v8a): passed; APK signature verification passed.
  Deliverable: `publish/LX-N-X-Music-v1.2.0-real-spectrum-arm64-v8a.apk`.
- Device `PLP120`, the instrumentation command above: passed actual ExoPlayer PCM,
  playback-head timing, timed silence/bass/treble, antiphase stereo, pause, seek,
  and offload restoration. Playback was muted; test packages were removed afterwards.
- Full `tsc --noEmit`: 222 existing diagnostics before and after, with byte-identical
  logs and none in the modified spectrum files.

The device test validates the native audio pipeline, not a visual inspection of the
full playback page or Bluetooth output latency. On this Windows checkout, native
CMake builds required a shorter temporary `buildStagingDirectory` because the
existing dependency build paths exceeded Windows path limits.

## Mini player background

The shared `src/components/player/AudioWave.tsx` now renders both surfaces. The mini
player measures the title bottom and progress-track top instead of assuming a font
height. Its rounded bars touch the track, stay below the title and fade from 19%
opacity at the bottom to 8% at the top. Text and controls are painted above them.
Visible surfaces share one native subscription; hidden pages do not poll, and
temporary buffering does not toggle audio offload.

The playback service now verifies the native current track and state. A stale
placeholder ID or pending URL flag can no longer drop the real song's Playing
event. Playback listeners are installed before restoring a track.

Device verification on 2026-11-18: release installed on PLP120; actual music,
lyrics, animated mini spectrum, pause/resume and full-player/back navigation
verified visually. TypeScript diagnostics remain identical to the prior 222
existing diagnostics after normalizing changed line numbers.
