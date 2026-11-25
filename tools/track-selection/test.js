const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
function load(file, requireMock = () => ({})) {
  const exports = {}
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: requireMock })
  return exports
}
const { createSelectionStore } = load('src/components/TrackSelection/store.ts')
const store = createSelectionStore()
const owner = Symbol('list'), other = Symbol('other')
const songs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
let notifications = 0
const off = store.subscribe(() => notifications++)
assert.equal(store.start(owner, songs[0], { listId: 'favorite' }), true)
assert.equal(store.get().songs[0], songs[0], 'long-pressed song is immediately selected')
const initial = store.get()
assert.equal(store.start(owner, songs[1], {}), false)
assert.equal(store.start(other, songs[2], {}), false)
assert.equal(store.get(), initial, 'repeated long press cannot reset or steal selection')
assert.equal(notifications, 1, 'ignored long press does not trigger a render')
assert.equal(store.toggle(owner, songs[1], songs), true)
assert.equal(store.get().songs.length, 2, 'a second tap sees the synchronous current selection')
assert.equal(store.toggle(owner, songs[2], songs), true)
assert.equal(store.toggle(owner, songs[1], songs), true)
assert.equal(store.get().songs.map(s => s.id).join(','), 'a,c', 'rapid toggles preserve other choices')
store.clear(other)
assert.ok(store.get(), 'unmounting an unrelated list must preserve selection')
store.toggle(owner, songs[0], songs)
store.toggle(owner, songs[2], songs)
assert.equal(store.get().songs.length, 0)
assert.equal(store.start(owner, songs[1], {}), false, 'zero selected songs still means selection mode')
store.clear(owner)
assert.equal(store.get(), null)
assert.equal(store.start(owner, songs[2], {}), true, 'selection can start again after cancel')
off()
for (const file of ['src/components/OnlineList/ListItem.tsx', 'src/screens/Home/Views/Mylist/MusicList/ListItem.tsx']) {
  const { default: component } = load(file, name => {
    if (name === 'react') return { memo: (render, compare) => ({ render, compare }) }
    if (name === '@/utils/tools') return { createStyle: s => s }
    if (name === '@/utils/pixelRatio') return { scaleSizeH: s => s }
    if (name === '@/config/constant') return { LIST_ITEM_HEIGHT: 64 }
    return {}
  })
  const props = { item: songs[0], index: 0, activeIndex: -1, selectedList: [], onPress() {}, onLongPress() {}, onShowMenu() {} }
  assert.equal(component.compare(props, props), true)
  assert.equal(component.compare(props, { ...props, onPress() {} }), false, `${file} cannot retain a stale play callback`)
  assert.equal(component.compare(props, { ...props, selectedList: [songs[0]] }), false, `${file} must redraw highlight`)
}
console.log('PASS: synchronous selection, rapid toggles, repeated long press, empty selection, scope cleanup, row callbacks and highlight invalidation')
// Exercise the actual detail components with a large data set. Native FlatList
// owns virtualization; the screen must hand it data instead of eager song JSX.
for (const file of ['src/screens/Home/Views/Music/PlaylistDetail.tsx', 'src/screens/Home/Views/Search/DetailView.tsx']) {
  const songs = Array.from({ length: 1070 }, (_, index) => ({ id: String(index), name: `Track ${index}`, singer: 'Singer', interval: '3:00', meta: {} }))
  let lastOffset
  const sp = { colors: { text: '#fff', textTertiary: '#aaa' } }
  const jsx = (type, props) => ({ type, props })
  const component = load(file, name => {
    if (name === 'react') return { memo: fn => fn, useCallback: fn => fn, useMemo: fn => fn(), useEffect() {}, useState: value => [Array.isArray(value) ? songs : value === 0 ? 320 : value, () => {}], useRef: value => ({ current: value === null ? { scrollToOffset: options => { lastOffset = options.offset } } : value }) }
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react-native') return { FlatList: 'FlatList', View: 'View', TouchableOpacity: 'TouchableOpacity', StatusBar: {}, StyleSheet: { absoluteFillObject: {} } }
    if (name === '@/utils/tools') return { createStyle: s => s }
    if (name === '@/store/theme/hook') return { useTheme: () => ({ isDark: true }) }
    if (name === '@/store/common/hook') return { useStatusbarHeight: () => 0 }
    if (name === '@/theme/spotify/tokens') return { getSP: () => sp }
    if (name === '@/lang') return { useI18n: () => key => key }
    if (name === '@/components/TrackSelection') return { useTrackSelection: () => ({ selectedList: [songs[0]], isSelected: song => song.id === '0', press() {}, start() {} }) }
    if (name === '@/components/TrackSelection/NumberedTrackRow') return { default: 'NumberedTrackRow', NUMBERED_TRACK_HEIGHT: 70 }
    return { default: 'component' }
  }).default
  const tree = component({ listId: 'large', listName: 'Large playlist', highlightMusicId: '1000', onBack() {}, kind: 'album', item: { id: 'album' }, source: 'wy' })
  const list = tree.props.children.flat().find(child => child?.type === 'FlatList')
  assert.ok(list, `${file} must use a virtualized list`)
  assert.equal(list.props.data.length, 1070)
  assert.equal(list.props.children, undefined, 'no 1070-row eager render tree')
  assert.equal(list.props.initialNumToRender, 12)
  assert.equal(list.props.renderItem({ item: songs[0], index: 0 }).props.selected, true)
  assert.equal(list.props.renderItem({ item: songs[1], index: 1 }).props.selected, false)
  if (list.props.onContentSizeChange) {
    list.props.onContentSizeChange()
    assert.equal(lastOffset, 320 + 1000 * 70 - 80, 'offscreen search target includes measured header height')
  }
}
console.log('PASS: 1070-track details use lazy rows; selected-row props and offscreen search positioning remain correct')
