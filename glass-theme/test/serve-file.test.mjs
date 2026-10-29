import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { Readable } from 'node:stream'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mod = await import('../src/host/serve-file.ts')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-serve-'))
const FILE = path.join(dir, 'sample.bin')
const BYTES = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
fs.writeFileSync(FILE, BYTES)

test.after(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

test('parseByteRange：闭区间、尾巴省略、头部省略与截断', () => {
  assert.deepEqual(mod.parseByteRange('bytes=0-1', 10), { start: 0, end: 1 })
  assert.deepEqual(mod.parseByteRange('bytes=5-', 10), { start: 5, end: 9 })
  assert.deepEqual(mod.parseByteRange('bytes=-3', 10), { start: 7, end: 9 })
  assert.deepEqual(mod.parseByteRange('bytes=-30', 10), { start: 0, end: 9 })
  assert.deepEqual(mod.parseByteRange('bytes=2-99', 10), { start: 2, end: 9 })
})

test('parseByteRange：不满足的区间与不认识的写法', () => {
  assert.equal(mod.parseByteRange('bytes=99-', 10), 'unsatisfiable')
  assert.equal(mod.parseByteRange('bytes=5-3', 10), 'unsatisfiable')
  assert.equal(mod.parseByteRange('items=0-1', 10), null)
  assert.equal(mod.parseByteRange('bytes=abc', 10), null)
  assert.equal(mod.parseByteRange('', 10), null)
  assert.equal(mod.parseByteRange('bytes=-0', 10), 'unsatisfiable')
  assert.equal(mod.parseByteRange('bytes=-3', 0), 'unsatisfiable')
  assert.equal(mod.parseByteRange('bytes=-', 10), null)
})

test('后缀请求返回文件末尾的字节，零长度后缀返回 416', async () => {
  const response = mod.streamFile(FILE, 'application/octet-stream', 'bytes=-3')
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 7-9/10')
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [7, 8, 9])
  assert.equal(mod.streamFile(FILE, 'application/octet-stream', 'bytes=-0').status, 416)
})

test('无 Range：200 整流，长度与类型正确，body 是流', async () => {
  const response = mod.streamFile(FILE, 'application/octet-stream', null)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/octet-stream')
  assert.equal(response.headers.get('content-length'), '10')
  assert.equal(response.headers.get('accept-ranges'), 'bytes')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(typeof response.body?.getReader, 'function')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), BYTES)
})

test('Range：206 切片，Content-Range 与字节区间正确', async () => {
  const response = mod.streamFile(FILE, 'application/octet-stream', 'bytes=2-5')
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10')
  assert.equal(response.headers.get('content-length'), '4')
  assert.equal(response.headers.get('accept-ranges'), 'bytes')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), BYTES.subarray(2, 6))
})

test('Range 越界：416 且带 bytes */size', async () => {
  const response = mod.streamFile(FILE, 'application/octet-stream', 'bytes=99-')
  assert.equal(response.status, 416)
  assert.equal(response.headers.get('content-range'), 'bytes */10')
})

test('文件读不到：抛错交给调用方映射 500', () => {
  assert.throws(() => mod.streamFile(path.join(dir, 'missing.bin'), 'application/octet-stream', null))
})

test('http 冒烟：真实服务器上 Range 返回 206 切片、无 Range 返回 200 整流', async () => {
  const server = http.createServer((request, res) => {
    const response = mod.streamFile(FILE, 'application/octet-stream', request.headers.range ?? null)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body === null) {
      res.end()
      return
    }
    Readable.fromWeb(response.body).pipe(res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    const full = await fetch(`http://127.0.0.1:${port}/file`)
    assert.equal(full.status, 200)
    assert.equal(full.headers.get('accept-ranges'), 'bytes')
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), BYTES)

    const part = await fetch(`http://127.0.0.1:${port}/file`, { headers: { range: 'bytes=3-6' } })
    assert.equal(part.status, 206)
    assert.equal(part.headers.get('content-range'), 'bytes 3-6/10')
    assert.equal(part.headers.get('content-length'), '4')
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), BYTES.subarray(3, 7))
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})
