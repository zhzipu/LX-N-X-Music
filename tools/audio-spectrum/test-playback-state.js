const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise the production service with controlled native events, including the lost-event race.
const State = { None: 0, Ready: 1, Playing: 3, Paused: 2, Stopped: 4, Buffering: 6, Connecting: 8 }
const events = new Map()
const emitted = []
const playerStore = { musicInfo: { id: 'song' } }
let track = { id: 'song__//real', musicId: 'song' }
let state = State.Playing
const native = {
  addEventListener: (event, fn) => events.set(event, fn),
  registerPlaybackService: () => {},
  getState: async () => state,
}
const context = {
  exports: {},
  console,
  global: {
    lx: { playerStatus: {}, gettingUrlId: 'pending-url', playerTrackId: 'song__//default' },
    app_event: new Proxy({}, { get: (_, name) => () => emitted.push(name) }),
  },
  require: name => {
    if (name === 'react-native-track-player') return { __esModule: true, default: native, State, Event: new Proxy({}, { get: (_, key) => key }) }
    if (name === 'react-native') return { AppState: { addEventListener: () => {} } }
    if (name === './utils') return { isTempId: id => !id || id.endsWith('//default'), isEmpty: () => false }
    if (name === './playList') return { getCurrentTrack: async () => track, getCurrentTrackId: async () => track?.id }
    if (name === '@/store/player/state') return { __esModule: true, default: playerStore }
    if (name === '@/utils/nativeModules/musicWidget') return { onWidgetPlayPause: () => {}, onWidgetPrev: () => {}, onWidgetNext: () => {} }
    return { __esModule: true, default: {} }
  },
}
const file = path.resolve(__dirname, '../../src/plugins/player/service.ts')
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, context)
context.exports.default()
const flush = () => new Promise(resolve => setImmediate(resolve))
;(async () => {
  events.get('PlaybackState')({ state: State.Playing })
  await flush()
  assert.deepEqual(emitted, ['playerPlaying', 'play'], 'real playback must survive a stale URL flag and placeholder track ID')
  emitted.length = 0
  track = { id: 'old__//real', musicId: 'old' }
  events.get('PlaybackState')({ state: State.Playing })
  await flush()
  assert.equal(emitted.length, 0, 'ignore a previous song that is still finishing')
  track = { id: 'song__//default', musicId: 'song' }
  events.get('PlaybackState')({ state: State.Playing })
  await flush()
  assert.equal(emitted.length, 0, 'ignore placeholder audio')
  track = { id: 'song__//real', musicId: 'song' }
  state = State.Paused
  events.get('PlaybackState')({ state: State.Playing })
  await flush()
  assert.deepEqual(emitted, ['playerPause', 'pause'], 'use the current native state, not an old queued playing event')
  console.log('PASS: playback-state race, placeholder filtering, track identity and queued stale events')
})().catch(error => { console.error(error); process.exitCode = 1 })
