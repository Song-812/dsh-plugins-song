// sessionTokenUsage 必须试 sessionId 两种写法，与磁盘命名跨版本兼容。
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const scratch = join(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp', `dsh-session-delete-token-${process.pid}`)
await mkdir(scratch, { recursive: true })
process.env.DSH_HOME = join(scratch, 'home')

const { __test__ } = await import('../lib/index.js')
const { sessionTokenUsage } = __test__

test.after(async () => {
  await rm(scratch, { recursive: true, force: true })
})

function cacheDoc(totals) {
  return JSON.stringify({
    record: { rows: { tokenUsage: { val: { totals } } } },
  })
}

test('投影缓存是裸 uuid 时，传入 session- 前缀也能读到 token', async () => {
  const home = join(scratch, 'home-prefixed')
  process.env.DSH_HOME = home
  const bare = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const dir = join(home, 'storages', 'session_projcache', 'sessions')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${bare}.json`), cacheDoc({
    uncachedInputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }), 'utf8')

  const usage = await sessionTokenUsage(home, `session-${bare}`)
  assert.equal(usage.total, 1500)
  assert.equal(usage.label, '1.5K')
})

test('投影缓存是 session- 前缀时，传入裸 uuid 也能读到 token', async () => {
  const home = join(scratch, 'home-bare')
  process.env.DSH_HOME = home
  const bare = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'
  const dir = join(home, 'storages', 'session_projcache', 'sessions')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `session-${bare}.json`), cacheDoc({
    uncachedInputTokens: 2000,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }), 'utf8')

  const usage = await sessionTokenUsage(home, bare)
  assert.equal(usage.total, 2000)
  assert.equal(usage.label, '2K')
})

test('两种写法都没有缓存时返回空标签', async () => {
  const home = join(scratch, 'home-miss')
  process.env.DSH_HOME = home
  await mkdir(home, { recursive: true })
  const usage = await sessionTokenUsage(home, 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee')
  assert.equal(usage.total, null)
  assert.equal(usage.label, '')
})
