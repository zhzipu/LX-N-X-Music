const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, deps, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const context = { exports: {}, console: { warn() {} }, require(name) {
    assert.ok(name in deps, `Unexpected import ${name}`)
    return deps[name]
  }, ...globals }
  vm.runInNewContext(code, context)
  return context.exports
}
const flush = () => new Promise(resolve => setImmediate(resolve))

async function testNavigation() {
  const frames = []
  const screens = { componentIds: [{ name: 'home', id: 'home-id' }] }
  const player = { musicInfo: { pic: 'cover' } }
  let size = { width: 393, height: 852 }
  let pushes = 0
  let pushedOptions
  let showLyrics = 0
  let settle
  let reject
  const api = load('src/navigation/navigation.ts', {
    'react-native-navigation': { Navigation: { push: (_id, layout) => {
      pushes++
      pushedOptions = layout.component.options
      return new Promise((resolve, fail) => { settle = resolve; reject = fail })
    } } },
    'react-native': { Dimensions: { get: () => size } },
    './screenNames': { PLAY_DETAIL_SCREEN: 'player-screen' },
    '@/store/theme/state': { default: { theme: { isDark: false } } },
    '@/store/player/state': { default: player },
    '@/store/common/state': { default: screens },
    '@/config/constant': { COMPONENT_IDS: { playDetail: 'player' }, NAV_SHEAR_NATIVE_IDS: {} },
    './utils': { getStatusBarStyle: () => 'light' },
    '@/utils/windowSizeTools': { windowSizeTools: { getSize: () => size } },
    '@/utils/hooks/useWideLayout': { isWideWindow: (w, h) => w > h || Math.min(w, h) >= 600 },
  }, { requestAnimationFrame: callback => frames.push(callback), global: { app_event: { setWidePlayerLyrics: () => showLyrics++ } } })
  api.pushPlayDetailScreen('home-id')
  api.pushPlayDetailScreen('home-id')
  assert.equal(frames.length, 1, 'double tap must reserve only one native push')
  frames.shift()()
  const animation = pushedOptions.animations.push
  assert.equal(animation.sharedElementTransitions.length, 1, 'keep the original cover transition')
  assert.equal(animation.elementTransitions.length, 2, 'keep the original header/control transitions')
  assert.equal(pushedOptions.animations.pop.sharedElementTransitions.length, 1, 'return the cover to the mini-player')
  assert.equal(pushedOptions.animations.pop.elementTransitions.length, 2)
  api.pushPlayDetailScreen('home-id')
  assert.equal(pushes, 1)
  assert.equal(frames.length, 0, 'pending transition stays protected')
  screens.componentIds.push({ name: 'player', id: 'player-id' })
  settle('player-id')
  await flush()
  api.pushPlayDetailScreen('player-id')
  assert.equal(frames.length, 0, 'already-open player must not be pushed again')
  screens.componentIds.pop()
  api.pushPlayDetailScreen('home-id')
  frames.shift()()
  reject(new Error('native push failed'))
  await flush()
  api.pushPlayDetailScreen('home-id')
  assert.equal(frames.length, 1, 'failed navigation must unlock retry')
  frames.shift()()
  settle('player-id')
  await flush()
  api.pushPlayDetailScreen(undefined)
  assert.equal(frames.length, 0)
  player.musicInfo.pic = null
  api.pushPlayDetailScreen('home-id')
  frames.shift()()
  assert.equal(pushedOptions.animations.push.content.translationX.from, size.width)
  assert.equal(pushedOptions.animations.pop.content.translationX.to, size.width)
  settle('player-id')
  await flush()
  size = { width: 852, height: 393 }
  api.pushPlayDetailScreen('home-id')
  assert.equal(showLyrics, 1)
  assert.equal(frames.length, 0, 'wide mode changes panes instead of pushing')
}

async function testCollection() {
  const songs = new Map()
  const operations = []
  const player = { playMusicInfo: { musicInfo: { id: 'A' } } }
  let failRead = false
  const api = load('src/components/player/PlayerBar/collection.ts', {
    '@/core/list': {
      getListMusics: async () => {
        await flush()
        if (failRead) { failRead = false; throw new Error('storage failure') }
        return [...songs.values()]
      },
      addListMusics: async (list, items) => {
        assert.equal(list, 'love')
        for (const item of items) { operations.push('add:' + item.id); songs.set(item.id, item) }
      },
      removeListMusics: async (list, ids) => {
        assert.equal(list, 'love')
        for (const id of ids) { operations.push('remove:' + id); songs.delete(id) }
      },
    },
    '@/config/constant': { LIST_IDS: { LOVE: 'love' } },
    '@/store/player/state': { default: player },
    '@/utils/tools': { toast() {} },
  }, { global: { i18n: { t: key => key } } })
  const a = api.setCurrentMusicCollected(true)
  const duplicate = api.setCurrentMusicCollected(true)
  const remove = api.setCurrentMusicCollected(false)
  player.playMusicInfo.musicInfo = { progress: 0, metadata: { musicInfo: { id: 'B' } } }
  const b = api.setCurrentMusicCollected(true)
  await Promise.all([a, duplicate, remove, b])
  assert.deepEqual(operations, ['add:A', 'remove:A', 'add:B'])
  assert.deepEqual([...songs.keys()], ['B'])
  failRead = true
  await assert.rejects(api.setCurrentMusicCollected(false), /storage failure/)
  await api.setCurrentMusicCollected(false)
  assert.equal(songs.size, 0)
  player.playMusicInfo.musicInfo = null
  await api.setCurrentMusicCollected(true)
  assert.equal(songs.size, 0)
}

Promise.resolve().then(testNavigation).then(testCollection).then(() => {
  console.log('Mini-player: rapid taps, pending/visible player, rejection recovery, wide navigation, ordered/idempotent collection, song snapshots and empty playback passed.')
}).catch(error => { console.error(error); process.exitCode = 1 })
