import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

async function loadHost(t) {
  const sandbox = await fs.mkdtemp(join(tmpdir(), 'glass-host-fixes-'))
  t.after(() => fs.rm(sandbox, { recursive: true, force: true }))
  const artifact = join(sandbox, 'lib', 'index.mjs')
  await build({
    entryPoints: [fileURLToPath(new URL('../src/host/index.ts', import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: artifact,
  })
  const host = await import(pathToFileURL(artifact).href)
  const routes = new Map()
  host.apply({
    inject: (_deps, fn) => fn({ connection: { fetch: { register: (route) => routes.set(route.path, route.fetch) } } }),
  })
  return { host, routes, sandbox }
}

test('AVIF 上传按 image 通过，不再 400', async (t) => {
  const { routes, sandbox } = await loadHost(t)
  const avif = Uint8Array.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0])
  const response = await routes.get('/api/glass-theme/wallpaper')(
    new Request('http://fixture/api/glass-theme/wallpaper', {
      method: 'POST',
      headers: { 'x-ext': '.avif', 'content-length': String(avif.byteLength) },
      body: avif,
    }),
  )
  assert.equal(response.status, 200, await response.clone().text())
  const body = await response.json()
  assert.equal(body.media, 'image')
  assert.match(body.file, /\.avif$/)
  assert.equal(await fs.stat(join(sandbox, '壁纸', body.file)).then((s) => s.size), avif.byteLength)
})

test('reveal 不回绝对 path', async (t) => {
  const { routes } = await loadHost(t)
  const response = await routes.get('/api/glass-theme/reveal')(
    new Request('http://fixture/api/glass-theme/reveal', { method: 'POST' }),
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.path, undefined)
})

test('queueWrite 同目录串行、异目录并行', async (t) => {
  const { host } = await loadHost(t)
  const { queueWrite } = host.__test__
  const order = []
  await Promise.all([
    queueWrite(async () => {
      order.push('a1')
      await new Promise((r) => setTimeout(r, 20))
      order.push('a2')
    }),
    queueWrite(async () => {
      order.push('b1')
    }),
  ])
  assert.deepEqual(order, ['a1', 'a2', 'b1'])
})

test('超大 Content-Length 早拒 413', async (t) => {
  const { routes } = await loadHost(t)
  const response = await routes.get('/api/glass-theme/wallpaper')(
    new Request('http://fixture/api/glass-theme/wallpaper', {
      method: 'POST',
      headers: { 'x-ext': '.png', 'content-length': String(51 * 1024 * 1024) },
      body: Uint8Array.from([137, 80, 78, 71]),
    }),
  )
  assert.equal(response.status, 413)
})
