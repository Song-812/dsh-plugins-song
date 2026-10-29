import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PROXY_URL, PROXY_URL_ENV, resolveProxyUrl } from '../lib/config.js'

const readerOf = (text) => () => text
const missing = () => {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
}

test('什么都没配时用默认的 127.0.0.1:7897，行为与以前一致', () => {
  const result = resolveProxyUrl({ env: {}, configPath: 'p.json', readFile: missing })
  assert.deepEqual(result, { url: 'http://127.0.0.1:7897', source: 'default', warnings: [] })
  assert.equal(DEFAULT_PROXY_URL, 'http://127.0.0.1:7897')
})

test('环境变量优先于 proxy.json', () => {
  const result = resolveProxyUrl({
    env: { [PROXY_URL_ENV]: 'http://127.0.0.1:7890' },
    configPath: 'p.json',
    readFile: readerOf('{"proxyUrl":"http://127.0.0.1:1111"}'),
  })
  assert.equal(result.url, 'http://127.0.0.1:7890')
  assert.equal(result.source, 'env')
})

test('proxy.json 生效（含 BOM），缺协议时补 http://，末尾斜杠去掉', () => {
  const result = resolveProxyUrl({
    env: {},
    configPath: 'p.json',
    readFile: readerOf('\uFEFF{"proxyUrl":"127.0.0.1:7890/"}'),
  })
  assert.equal(result.url, 'http://127.0.0.1:7890')
  assert.equal(result.source, 'file')
})

test('无效的值被忽略、退回默认，并给出警告', () => {
  const bad = resolveProxyUrl({ env: { [PROXY_URL_ENV]: 'socks5://127.0.0.1:1080' }, configPath: 'p.json', readFile: missing })
  assert.equal(bad.url, DEFAULT_PROXY_URL)
  assert.equal(bad.warnings.length, 1)

  const notJson = resolveProxyUrl({ env: {}, configPath: 'p.json', readFile: readerOf('{oops') })
  assert.equal(notJson.url, DEFAULT_PROXY_URL)
  assert.match(notJson.warnings[0], /JSON/)

  const noField = resolveProxyUrl({ env: {}, configPath: 'p.json', readFile: readerOf('{}') })
  assert.deepEqual(noField, { url: DEFAULT_PROXY_URL, source: 'default', warnings: [] })
})

test('环境变量无效但 proxy.json 有效：用文件，并提示环境变量被忽略', () => {
  const result = resolveProxyUrl({
    env: { [PROXY_URL_ENV]: '://' },
    configPath: 'p.json',
    readFile: readerOf('{"proxyUrl":"http://10.0.0.2:8080"}'),
  })
  assert.equal(result.url, 'http://10.0.0.2:8080')
  assert.equal(result.warnings.length, 1)
})
