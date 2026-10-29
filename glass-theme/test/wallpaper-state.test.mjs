import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/client/state.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' })
const { WallpaperStore } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const old = { file: 'old.png', url: '/old', media: 'image', isDefault: false, updatedAt: 1 }
const fresh = { ...old, file: 'new.png', url: '/new', updatedAt: 2 }
const file = new File(['fixture'], 'new.png')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

for (const operation of ['upload', 'remove']) {
  for (const failed of [false, true]) {
    test(`旧读取${failed ? '失败' : '成功'}不能覆盖${operation}的最新状态`, async t => {
      const stale = deferred()
      t.mock.method(globalThis, 'fetch', async (_url, options) => options?.method ? Response.json(fresh) : stale.promise)
      const store = new WallpaperStore()
      const reading = store.refresh()
      await store[operation](file)
      if (failed) stale.reject(Error('old request failed'))
      else stale.resolve(Response.json(old))
      await reading
      assert.equal(store.getSnapshot().entry?.file ?? null, operation === 'upload' ? 'new.png' : null)
      assert.equal(store.getSnapshot().error, null)
      assert.equal(store.getSnapshot().busy, false)
    })
  }
}

test('后发的刷新先返回后，早发的响应不能倒退状态', async t => {
  const stale = deferred()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? stale.promise : Response.json(fresh))
  const store = new WallpaperStore()
  const first = store.refresh()
  await store.refresh()
  stale.resolve(Response.json(old))
  await first
  assert.equal(store.getSnapshot().entry.file, 'new.png')
})

test('上传中刷新不覆盖界面，上传完成后仍可正常刷新', async t => {
  const uploading = deferred()
  t.mock.method(globalThis, 'fetch', async (_url, options) => options?.method ? uploading.promise : Response.json(old))
  const store = new WallpaperStore()
  const pending = store.upload(file)
  await store.refresh()
  assert.equal(store.getSnapshot().entry, undefined)
  assert.equal(store.getSnapshot().busy, true)
  uploading.resolve(Response.json(fresh))
  await pending
  assert.equal(store.getSnapshot().entry.file, 'new.png')
  await store.refresh()
  assert.equal(store.getSnapshot().entry.file, 'old.png')
})
