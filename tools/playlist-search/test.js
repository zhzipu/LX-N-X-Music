const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')
function load(name) {
  const source = fs.readFileSync(path.join(__dirname, '../../src/screens/Home/Views/Music', name + '.ts'), 'utf8')
  const context = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  return context.exports
}
const { filterPlaylistSongs } = load('playlistSearchMatch')
const song = { id: 'song', name: '茶花开了', singer: '王睿卓', meta: { albumName: 'Camellia' } }
const entries = ['love', 'list1'].map(listId => ({ listId, listName: listId, music: song }))
entries.push({ listId: 'list2', listName: 'Camellia', music: { id: 'other', name: 'Other', singer: 'Artist' } })
assert.equal(filterPlaylistSongs(entries, '').length, 0)
assert.equal(filterPlaylistSongs(entries, '   ').length, 0)
assert.equal(filterPlaylistSongs(entries, '茶花').length, 2)
assert.equal(filterPlaylistSongs(entries, '王睿卓 CAMELLIA').length, 2)
assert.equal(filterPlaylistSongs(entries, 'Camellia')[1].listId, 'list1')
assert.equal(filterPlaylistSongs(entries, 'missing').length, 0)
assert.equal(filterPlaylistSongs(entries, 'other')[0].music.id, 'other')
const { clearSearchHighlight, subscribeSearchInteraction } = load('searchInteraction')
let clears = 0
const unsubscribe = subscribeSearchInteraction(() => { clears++ })
assert.equal(clears, 0, 'highlight persists until interaction')
clearSearchHighlight()
assert.equal(clears, 1)
unsubscribe()
clearSearchHighlight()
assert.equal(clears, 1, 'unmounted detail stops listening')
console.log('Playlist search: title/singer/album, whitespace, case, duplicate playlists, empty/missing results, interaction cleanup passed.')
