const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise the actual progress components and drag hook, including the responder
// transfer that happens when the enclosing wide player recognizes a page swipe.
function fixture(file) {
  const hooks = new Map()
  const seeks = []
  let current, cursor, responder
  const react = {
    memo: component => component,
    useRef(value) { const i = cursor++; return current[i] ?? (current[i] = { current: value }) },
    useState(value) {
      const slots = current, i = cursor++
      if (!(i in slots)) slots[i] = value
      return [slots[i], value => { slots[i] = value }]
    },
    useCallback: callback => callback,
    useMemo: factory => factory(),
    useEffect: callback => { callback() },
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  }
  const deps = {
    react,
    'react-native': { View: 'View', PanResponder: { create(config) { return { panHandlers: { config } } } } },
    '@/utils/tools': { createStyle: styles => styles },
    '@/store/theme/hook': { useTheme: () => ({ isDark: true }) },
    '@/utils/pixelRatio': { scaleSizeW: n => n, scaleSizeH: n => n },
    '@/components/common/Icon': { Icon: 'Icon' },
  }
  function load(relative) {
    const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText
    const context = { exports: {}, React: react, global: { app_event: { setProgress: n => seeks.push(n) } }, require: name => {
      assert.ok(name in deps, `Unexpected dependency: ${name}`)
      return deps[name]
    } }
    vm.runInNewContext(code, context)
    return context.exports
  }
  deps['@/utils/hooks'] = load('src/utils/hooks/useDrag.ts')
  const Component = load(file).default
  function render(component, props) {
    current = hooks.get(component) ?? []
    hooks.set(component, current)
    cursor = 0
    return component(props)
  }
  function draw(progress = 0.2) {
    const tree = render(Component, { progress, duration: 200, buffered: 1 })
    const press = tree.props.children.find(child => typeof child?.type === 'function')
    const hit = render(press.type, press.props)
    responder = hit.props.config
    hit.props.onLayout({ nativeEvent: { layout: { width: 100 } } })
    return tree
  }
  draw()
  const gesture = dx => ({ dx, dy: 0, numberActiveTouches: 1 })
  const start = x => responder.onPanResponderGrant({ nativeEvent: { locationX: x } }, gesture(0))
  const move = dx => responder.onPanResponderMove({}, gesture(dx))
  const release = () => responder.onPanResponderRelease({}, gesture(0))
  const dragging = () => hooks.get(Component)[0]
  return { seeks, draw, start, move, release, dragging, get responder() { return responder } }
}

for (const file of ['src/components/player/ProgressBar.tsx', 'src/components/player/Progress.tsx']) {
  const f = fixture(file)
  f.start(20)
  f.move(50)
  // React Native defaults this decision to true when the callback is absent.
  const yieldsToPage = f.responder.onPanResponderTerminationRequest?.({}, { dx: 50, dy: 0, numberActiveTouches: 1 }) ?? true
  if (yieldsToPage) f.responder.onPanResponderTerminate?.({}, {})
  else f.release()
  assert.equal(f.seeks.length, 1, `${file}: horizontal drag must seek instead of yielding to page swipe`)
  assert.equal(f.seeks[0], 140)
  assert.equal(f.dragging(), false, 'the thumb must return to playback-driven progress')
  const updated = f.draw(0.75)
  assert.equal(f.dragging(), false, 'subsequent playback updates must not be masked by drag preview')
  assert.equal(updated.props.children[0].props.children[2].props.style.width, '75%', 'visible progress follows playback after releasing')

  f.start(35)
  f.release()
  assert.equal(f.seeks.at(-1), 70, 'tap-to-seek stays supported')
  f.start(30)
  f.move(20)
  const beforeCancel = f.seeks.length
  assert.equal(typeof f.responder.onPanResponderTerminate, 'function')
  f.responder.onPanResponderTerminate({}, {})
  assert.equal(f.dragging(), false, 'system cancellation clears dragging')
  assert.equal(f.seeks.length, beforeCancel, 'system cancellation must not seek')
  f.release()
  assert.equal(f.seeks.length, beforeCancel, 'release after cancellation must not submit a stale position')
  f.start(60)
  f.move(-90)
  f.release()
  assert.equal(f.seeks.at(-1), 0, 'backward drag clamps at the start')
  f.start(60)
  f.move(90)
  f.release()
  assert.equal(f.seeks.at(-1), 200, 'forward drag clamps at the end')
  assert.equal(f.dragging(), false)
  console.log('PASS:', file, 'drag ownership, seek, playback follow-up, tap, cancel, retry and boundaries')
}
