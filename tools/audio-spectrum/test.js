const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')

const source = path.resolve(__dirname, '../../src/components/player/audioSpectrum.ts')
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context)
const { createSpectrumEngine, BAND_COUNT } = context.exports
const engine = createSpectrumEngine()
const advance = (start, end, playing = true) => {
  for (let time = start; time <= end; time += 16) engine.step(0.016, playing, time)
}
advance(0, 5000)
assert.equal(Math.max(...engine.values), 0, 'playing without audio must not create movement')
engine.accept(Array(BAND_COUNT).fill(0.8), 5000)
advance(5000, 5100)
assert.ok(Math.max(...engine.values) > 0.7, 'respond quickly to real data')
advance(5116, 6200)
assert.equal(Math.max(...engine.values), 0, 'stale data must decay without repeated frames keeping it alive')
engine.accept(Array(BAND_COUNT).fill(1), 6300)
advance(6300, 6400)
advance(6416, 7400, false)
assert.ok(engine.idle && Math.max(...engine.values) === 0, 'pause must settle')
engine.accept(Array(BAND_COUNT).fill(NaN), 7500)
advance(7500, 7600)
assert.equal(Math.max(...engine.values), 0, 'reject malformed native data')
engine.accept(Array(BAND_COUNT).fill(1), 7700)
engine.clear()
advance(7700, 7800)
assert.equal(Math.max(...engine.values), 0, 'track change must clear targets')
console.log('PASS: display has no synthetic motion; handles real frames, stale data, pause, invalid input and reset')

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-audio-spectrum-'))
try {
  execFileSync('javac', ['-d', temp, path.join(__dirname, 'native/PcmSpectrum.java'), path.join(__dirname, 'PcmSpectrumTest.java')], { stdio: 'inherit' })
  execFileSync('java', ['-cp', temp, 'com.guichaguri.trackplayer.spectrum.PcmSpectrumTest'], { stdio: 'inherit' })
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

require('./test-playback-state')
