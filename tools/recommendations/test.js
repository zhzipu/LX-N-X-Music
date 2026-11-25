const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, dependencies, extra = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, allowJs: true } }).outputText
  const context = { exports: {}, require: name => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`)
    return dependencies[name]
  }, console: { log() {} }, ...extra }
  vm.runInNewContext(compiled, context)
  return context.exports
}

async function main() {
  let sent
  const request = load('src/utils/request.js', {
    'react-native-background-timer': { default: { setTimeout, clearTimeout } },
    './message': { requestMsg: {} }, './musicSdk/options': { bHh: 'unused' },
    pako: { deflateRaw() {} }, '@/utils/tools': {},
    '@/store/setting/state': { default: { setting: { 'common.wy_cookie': 'stored-cookie' } } },
  }, { Buffer, global: { AbortController, fetch: async (url, options) => {
    sent = options
    return { headers: { map: {} }, text: async () => '{"code":200}', status: 200, ok: true, url }
  } } })
  for (const [headers, key, expected] of [
    [{ cookie: 'new-login-cookie' }, 'cookie', 'new-login-cookie'],
    [{ Cookie: 'explicit-cookie' }, 'Cookie', 'explicit-cookie'],
    [{ cookie: '' }, 'cookie', ''],
    [{}, 'cookie', 'stored-cookie'],
  ]) {
    await request.httpFetch('https://music.163.com/weapi/nuser/account/get', { headers }).promise
    assert.equal(sent.headers[key], expected)
  }
  await request.httpFetch('https://example.org/music.163.com', { headers: {} }).promise
  assert.equal(sent.headers.cookie, undefined)

  let calls = 0
  let response = { statusCode: 200, body: { code: 200, recommend: [{ id: 123 }] } }
  let payload
  let requestUrl
  const api = load('src/utils/musicSdk/wy/dailyRec.js', {
    '../../request': { httpFetch: (url, options) => {
      calls++
      requestUrl = url
      assert.equal(options.headers.cookie, 'MUSIC_U=test; __csrf=test-token')
      return { promise: response instanceof Error ? Promise.reject(response) : Promise.resolve(response) }
    } },
    './musicDetail': { default: {} },
    './utils/crypto': { weapi: data => { payload = data; return {} } },
    '@/store/setting/state': { default: {} },
  }).default
  const cookie = 'MUSIC_U=test; __csrf=test-token'
  assert.equal((await api.getRecPlaylists(cookie))[0].id, 123)
  assert.equal(payload.csrf_token, 'test-token')
  assert.ok(requestUrl.endsWith('?csrf_token=test-token'))
  response = { statusCode: 200, body: { code: 200, recommend: [] } }
  assert.equal((await api.getRecPlaylists(cookie)).length, 0)
  calls = 0
  response = { statusCode: 403, body: { code: 403 } }
  await assert.rejects(api.getRecPlaylists(cookie), /HTTP 403/)
  assert.equal(calls, 3)
  calls = 0
  response = new Error('登录状态已过期')
  await assert.rejects(api.getRecPlaylists(cookie), /登录状态已过期/)
  assert.equal(calls, 1)
  console.log('Recommendations: explicit/default cookie, host boundary, CSRF, empty results, bounded retries and original errors passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
