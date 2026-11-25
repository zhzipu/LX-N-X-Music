const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../../src/screens/PlayDetail/index.tsx'), 'utf8')

async function check(initialPage) {
  let wide = false
  const refs = []
  const effects = []
  const cleanups = []
  const dependencies = []
  let cursor = 0
  const pops = []
  const foldPage = { current: 'home' }
  const deps = {
    react: {
      useRef(value) { const i = cursor++; return refs[i] ?? (refs[i] = { current: value }) },
      useEffect(fn, values) {
        const i = cursor++
        if (!dependencies[i] || values.some((v, j) => v !== dependencies[i][j])) {
          dependencies[i] = values
          effects.push(() => { cleanups[i]?.(); cleanups[i] = fn() })
        }
      },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native-navigation': { Navigation: { pop: async (...args) => { pops.push(args) } } },
    '@/utils/hooks': { useWideLayout: () => wide },
    './Vertical': { default: 'Vertical' },
    '@/components/PageContent': { default: 'PageContent' },
    '@/components/common/StatusBar': { default: 'StatusBar' },
    '@/core/common': { setComponentId() {} },
    '@/config/constant': { COMPONENT_IDS: { playDetail: 'player' } },
    '@/navigation/foldPage': { foldPage },
  }
  const context = { exports: {}, require(name) { assert.ok(name in deps, name); return deps[name] } }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context)
  const render = () => {
    cursor = 0
    const tree = context.exports.default({ componentId: 'player-id', initialPage })
    while (effects.length) effects.shift()()
    return tree
  }
  assert.ok(render())
  assert.equal(pops.length, 0, 'portrait keeps normal player screen')
  wide = true
  assert.ok(render(), 'source hierarchy must survive fold handoff')
  assert.equal(pops.length, 1)
  assert.equal(pops[0][1].animations.pop.enabled, false, 'fold must not animate into the removed mini-player')
  render()
  assert.equal(pops.length, 1, 're-render does not pop twice')
  cleanups.forEach(fn => fn?.())
  assert.equal(foldPage.current, initialPage === 1 ? 'lyrics' : 'player', 'Pad must retain the previous page')
}
Promise.all([check(0), check(1)]).then(() => console.log('Fold handoff: retained source, nonanimated pop, single pop, player/lyrics memory passed.')).catch(error => { console.error(error); process.exitCode = 1 })
