// Keep the native integration reproducible after npm install; fail on incompatible upstream changes.
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../../node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer')
const replacements = [
  ['service/MusicManager.java', 'DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(service);',
    `DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(service) {
            @Override
            protected androidx.media3.exoplayer.audio.AudioSink buildAudioSink(
                    android.content.Context context, boolean floatOutput, boolean playbackParams) {
                return new com.guichaguri.trackplayer.spectrum.SpectrumAudioSink(
                        super.buildAudioSink(context, floatOutput, playbackParams));
            }
        };`],
  ['service/MusicManager.java', 'player.setTrackSelectionParameters(trackSelectionParameters);',
    'player.setTrackSelectionParameters(trackSelectionParameters);\n        com.guichaguri.trackplayer.spectrum.SpectrumBridge.attach(player);'],
  ['service/MusicManager.java', 'if(playback != null) playback.destroy();',
    'com.guichaguri.trackplayer.spectrum.SpectrumBridge.detach();\n        if(playback != null) playback.destroy();'],
  ['module/MusicModule.java', 'public void onCatalystInstanceDestroy() {',
    `public void onCatalystInstanceDestroy() {
        if (binder != null) binder.post(() -> com.guichaguri.trackplayer.spectrum.SpectrumBridge.setEnabled(false));`],
  ['module/MusicModule.java', '    @ReactMethod\n    public void getRate(final Promise callback) {',
    `    @ReactMethod
    public void setAudioSpectrumEnabled(final boolean enabled, final Promise callback) {
        waitForConnection(() -> {
            com.guichaguri.trackplayer.spectrum.SpectrumBridge.setEnabled(enabled);
            callback.resolve(null);
        });
    }

    @ReactMethod
    public void getAudioSpectrum(final Promise callback) {
        waitForConnection(() -> callback.resolve(com.guichaguri.trackplayer.spectrum.SpectrumBridge.read()));
    }

    @ReactMethod
    public void getRate(final Promise callback) {`],
]
const files = new Map()
for (const [relative, before, after] of replacements) {
  const file = path.join(root, relative)
  let content = files.get(file) ?? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  if (!content.includes(after)) {
    if (content.split(before).length !== 2) throw new Error(`Audio spectrum patch anchor mismatch: ${relative}`)
    content = content.replace(before, after)
  }
  files.set(file, content)
}
for (const [file, content] of files) fs.writeFileSync(file, content)
fs.mkdirSync(path.join(root, 'spectrum'), { recursive: true })
for (const file of fs.readdirSync(path.join(__dirname, 'native'))) {
  if (file.endsWith('.java')) fs.copyFileSync(path.join(__dirname, 'native', file), path.join(root, 'spectrum', file))
}
console.log('TrackPlayer PCM spectrum integration applied.')
