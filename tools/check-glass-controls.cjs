// Run the production TypeScript store with an in-memory AsyncStorage boundary.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../src/components/spotify')
const key = 'lxnx.glassControls.v1'

function harness(data = new Map(), write = async (key, value) => { data.set(key, value) }) {
  const cache = new Map()
  function load(name) {
    const file = path.resolve(root, name + '.ts')
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
    const requireLocal = dependency => dependency === '@react-native-async-storage/async-storage'
      ? { getItem: async key => data.get(key) ?? null, setItem: write }
      : load(dependency)
    vm.runInNewContext('(function(require, module, exports) {' + code + '\n})', { setTimeout, clearTimeout, console: { warn() {} } }, { filename: file })(requireLocal, module, module.exports)
    return module.exports
  }
  return { store: load('glassControlSettings'), surface: load('glassSurfaceParams').glassSurfaceParams, data }
}

async function main() {
  const data = new Map([['lxnx.glassTabsParams.v4', JSON.stringify({ containerColor: '#FF375F', tabsCount: 5, tabsSelectedIndex: 4 })]])
  const { store: s, surface } = harness(data)
  await Promise.all([s.loadGlassSettings(), s.loadGlassSettings()])
  assert.equal(s.getGlassProfile('tabs').containerColor, '#FF375F', 'migrate existing tab appearance')
  assert.equal(s.getGlassProfile('tabs').tabsSelectedIndex, 3, 'old five-tab preview stays within four slots')
  assert.equal(s.getGlassProfile('miniPlayer').containerColor, '#FFFFFF', 'tab migration must not leak into mini player')
  let notifications = 0
  const unsubscribe = s.subscribeGlassSettings(() => { notifications++ })
  const tabs = s.getGlassProfile('tabs')
  s.updateGlassProfile('header', { ...s.getGlassProfile('header'), containerColor: '#0A84FF', blurRadius: 1000 })
  s.updateGlassProfile('skip', { ...s.getGlassProfile('skip'), containerColor: '#FF375F' })
  assert.equal(s.getGlassProfile('header').blurRadius, 48, 'persist bounded shader values')
  assert.equal(s.getGlassProfile('tabs'), tabs, 'editing another group does not change tabs')
  s.resetGlassProfile('header')
  assert.equal(s.getGlassProfile('header').containerColor, '#0A0A0A')
  assert.equal(s.getGlassProfile('skip').containerColor, '#FF375F', 'reset only the chosen group')
  assert.equal(notifications, 3)
  const sourceProfile = { ...s.getGlassProfile('tabs'), containerColor: '#34C759', blurRadius: 23, tabsSelectedIndex: 2 }
  s.updateGlassProfile('tabs', sourceProfile)
  s.copyGlassProfileToTargets('tabs', ['miniPlayer', 'header', 'skip'])
  assert.deepEqual(JSON.parse(JSON.stringify(s.getGlassProfile('miniPlayer'))), JSON.parse(JSON.stringify(sourceProfile)))
  assert.deepEqual(JSON.parse(JSON.stringify(s.getGlassProfile('header'))), JSON.parse(JSON.stringify(sourceProfile)))
  assert.equal(s.getGlassProfile('modeFavorite').containerColor, '#0A0A0A', 'unchecked targets remain unchanged')
  assert.equal(s.getGlassProfile('skip').containerColor, '#34C759')
  assert.equal(s.getGlassProfile('tabs').containerColor, '#34C759', 'source remains unchanged')
  unsubscribe()
  await s.flushGlassSettings()
  const restored = harness(data).store
  await restored.loadGlassSettings()
  assert.equal(restored.getGlassProfile('skip').containerColor, '#34C759', 'restore copied values after process restart')
  assert.equal(restored.getGlassProfile('tabs').containerColor, '#34C759')
  assert.equal(restored.getGlassProfile('header').blurRadius, 23)

  const p = { ...s.getGlassProfile('skip'), blurEnabled: false, highlightEnabled: false, shadowEnabled: false, shape: 'rounded', cornerRadius: 7 }
  const mapped = surface(p, 18)
  assert.equal(mapped.blurRadius, 0)
  assert.equal(mapped.highlightAlpha, 0)
  assert.equal(mapped.shadowAlpha, 0)
  assert.equal(mapped.borderRadius, 7)
  assert.equal(surface({ ...p, shape: 'capsule' }, 18).borderRadius, 18)
  assert.equal(surface({ ...p, highlightEnabled: true, highlightWidth: 0 }, 18).highlightAlpha, 0, 'zero-width highlight is off even with native width defaults')

  let activeWrites = 0
  let maxWrites = 0
  const pending = []
  const orderedData = new Map()
  const ordered = harness(orderedData, (key, value) => new Promise(resolve => {
    maxWrites = Math.max(maxWrites, ++activeWrites)
    pending.push(() => { orderedData.set(key, value); activeWrites--; resolve() })
  })).store
  await ordered.loadGlassSettings()
  ordered.updateGlassProfile('miniPlayer', { ...ordered.getGlassProfile('miniPlayer'), containerAlpha: 0.2 })
  const first = ordered.flushGlassSettings()
  await new Promise(setImmediate)
  ordered.updateGlassProfile('miniPlayer', { ...ordered.getGlassProfile('miniPlayer'), containerAlpha: 0.8 })
  const second = ordered.flushGlassSettings()
  pending.shift()()
  await first
  await new Promise(setImmediate)
  pending.shift()()
  await second
  assert.equal(maxWrites, 1, 'writes cannot overtake each other')
  assert.equal(JSON.parse(orderedData.get(key)).miniPlayer.containerAlpha, 0.8)

  const corrupt = harness(new Map([[key, '{broken'], ['lxnx.glassTabsParams.v4', JSON.stringify({ blurRadius: 17 })]])).store
  await corrupt.loadGlassSettings()
  assert.equal(corrupt.getGlassProfile('tabs').blurRadius, 17, 'invalid new data recovers legacy tabs')
  assert.equal(corrupt.getGlassProfile('header').blurRadius, 10.3)

  const defaults = harness().store
  await defaults.loadGlassSettings()
  assert.equal(defaults.getGlassProfile('tabs').containerColor, '#0A0A0A', 'use the current tab appearance as the default')
  assert.equal(defaults.getGlassProfile('tabs').tabsAccentColor, '#FFFFFF')
  assert.equal(defaults.getGlassProfile('tabs').previewBackground, 'aurora')
  assert.equal(defaults.getGlassProfile('miniPlayer').containerColor, '#FFFFFF', 'preserve the current mini player profile')
  assert.equal(defaults.getGlassProfile('miniPlayer').containerAlpha, 0.4)
  assert.equal(defaults.getGlassProfile('header').blurRadius, 10.3)
  assert.equal(defaults.getGlassProfile('modeFavorite').highlightBlur, 2.4)
  assert.equal(defaults.getGlassProfile('skip').blurRadius, 10.2)
  assert.equal(defaults.getGlassProfile('skip').highlightBlur, 1.85)
  let attempts = 0
  const recovery = harness(new Map(), async () => { if (++attempts === 1) throw new Error('disk unavailable') }).store
  await recovery.loadGlassSettings()
  await assert.rejects(recovery.flushGlassSettings())
  await recovery.flushGlassSettings()
  assert.equal(attempts, 2, 'failed writes do not block later saves')
  console.log('PASS: legacy migration, group isolation/reset, restart, optical mapping, ordered writes and error recovery')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
