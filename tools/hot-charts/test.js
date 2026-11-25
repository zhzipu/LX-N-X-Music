const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../../src/screens/Home/Views/Hot/settings.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const context = { exports: {} }
vm.runInNewContext(compiled, context)
const { readHotBoards } = context.exports
const plain = value => JSON.parse(JSON.stringify(value))
assert.deepEqual(plain(readHotBoards('')).map(item => item.id), ['kw__93', 'kw__16', 'kw__17'])
assert.deepEqual(plain(readHotBoards('broken')), plain(readHotBoards('')))
assert.deepEqual(plain(readHotBoards('{}')), plain(readHotBoards('')))
assert.deepEqual(plain(readHotBoards('[]')), []) // An explicit empty selection must survive restart.
const chosen = [
  { id: 'kw__17', name: '新歌榜', source: 'kw' },
  { id: 'wy__19723756', name: '飙升榜', source: 'wy' },
]
assert.deepEqual(plain(readHotBoards(JSON.stringify(chosen))), chosen)
assert.deepEqual(plain(readHotBoards(JSON.stringify([null, {}, chosen[0], chosen[0], { ...chosen[1], source: 'kw' }]))), [chosen[0]])
console.log('Hot charts: defaults, corrupt settings, explicit empty selection, ordering, cross-source selection and duplicate validation passed.')
