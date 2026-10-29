import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

test('同一毫秒连续上传不重名、不误删当前文件', async t => {
  const sandbox = await fs.mkdtemp(join(tmpdir(), 'glass-upload-regression-'))
  t.after(() => fs.rm(sandbox, { recursive: true }))
  const artifact = join(sandbox, 'lib', 'index.mjs')
  await build({ entryPoints: [fileURLToPath(new URL('../src/host/index.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', outfile: artifact })
  const host = await import(pathToFileURL(artifact).href)
  const routes = new Map()
  host.apply({ inject: (_deps, fn) => fn({ connection: { fetch: { register: route => routes.set(route.path, route.fetch) } } }) })
  const RealDate = Date
  t.mock.method(globalThis, 'Date', class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-27T01:02:03.004Z'])) } })
  const upload = () => routes.get('/api/glass-theme/wallpaper')(new Request('http://fixture/api/glass-theme/wallpaper', { method: 'POST', headers: { 'x-ext': '.png' }, body: Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0]) }))
  const first = await (await upload()).json()
  const fixedMtime = new Date('2026-10-27T01:02:03.004Z')
  await fs.utimes(join(sandbox, '壁纸', first.file), fixedMtime, fixedMtime)
  const read = () => routes.get('/api/glass-theme/wallpaper')(new Request('http://fixture/api/glass-theme/wallpaper'))
  const firstRead = await (await read()).json()
  const response = await upload()
  assert.equal(response.status, 200)
  const second = await response.json()
  assert.notEqual(first.file, second.file)
  await fs.utimes(join(sandbox, '壁纸', second.file), fixedMtime, fixedMtime)
  const secondRead = await (await read()).json()
  assert.notEqual(firstRead.url, secondRead.url, '修改时间相同时也必须让界面重新加载新壁纸')
  assert.equal((await fs.stat(join(sandbox, '壁纸', second.file))).size, 16)
  assert.equal(await fs.stat(join(sandbox, '壁纸', first.file)).then(() => true, () => false), false)
  const state = JSON.parse(await fs.readFile(join(sandbox, '壁纸', 'state.json'), 'utf8'))
  assert.equal(state.file, second.file)
})
