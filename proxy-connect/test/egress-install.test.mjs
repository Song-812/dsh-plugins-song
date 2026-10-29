/**
 * 模型出网那一半的装配契约：装上、让位、卸载。
 *
 * 用真的 undici（本插件自带的依赖）和最小的 ctx 替身，验的正是 DSH 里最要紧的三件事：
 * apply 之后进程出口变了没有、让位判断对不对、卸载有没有还回去。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as undici from 'undici'
import { installEgress } from '../lib/egress.js'
import { PROXY_ENV_NAMES } from '../lib/egress-routing.js'

function fakeContext() {
  const disposers = []
  return {
    disposers,
    logger: { info() {}, warn() {} },
    effect: (handler) => disposers.push(handler),
  }
}

/** 测试进程里可能带着外部环境的代理变量，先清干净再让被测代码看环境。 */
function clearProxyEnv(t) {
  const saved = new Map(PROXY_ENV_NAMES.map((name) => [name, process.env[name]]))
  for (const name of PROXY_ENV_NAMES) delete process.env[name]
  t.after(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
}

async function tempWhitelistPath(t, hosts) {
  const dir = await mkdtemp(join(tmpdir(), 'proxy-connect-egress-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'whitelist.json')
  if (hosts !== undefined) await writeFile(file, JSON.stringify(hosts), 'utf8')
  return file
}

test('装上后全局出口换成自己的 agent，卸载后还回原来那个', async (t) => {
  clearProxyEnv(t)
  const whitelistPath = await tempWhitelistPath(t, ['api.openai.com'])
  const before = undici.getGlobalDispatcher()
  const records = []
  const ctx = fakeContext()

  const { ready } = installEgress(ctx, {
    whitelistPath,
    env: {},
    diagnose: (record) => records.push(record),
  })
  const result = await ready

  assert.equal(result.kind, 'installed')
  assert.notEqual(undici.getGlobalDispatcher(), before)
  assert.deepEqual(records.find((r) => r.step === 'egress-installed').hosts, ['api.openai.com'])

  // ctx.effect 的语义：回调被调用，回调的返回值才是清理函数。
  const disposer = ctx.disposers[0]()
  assert.equal(typeof disposer, 'function')
  await disposer()

  assert.equal(undici.getGlobalDispatcher(), before)
})

test('DSH 已配置出网代理时让位，不碰全局出口', async (t) => {
  clearProxyEnv(t)
  const whitelistPath = await tempWhitelistPath(t, ['api.openai.com'])
  const before = undici.getGlobalDispatcher()
  const records = []
  const ctx = fakeContext()

  const { ready } = installEgress(ctx, {
    whitelistPath,
    env: { HTTPS_PROXY: 'http://127.0.0.1:7897' },
    diagnose: (record) => records.push(record),
  })

  assert.equal((await ready).kind, 'stand-aside')
  assert.equal(undici.getGlobalDispatcher(), before)
  assert.ok(records.some((r) => r.step === 'stand-aside'))
  assert.equal(ctx.disposers.length, 0)
})

test('名单文件不存在时按空名单装上，不报错', async (t) => {
  clearProxyEnv(t)
  const whitelistPath = await tempWhitelistPath(t)
  const before = undici.getGlobalDispatcher()
  const ctx = fakeContext()

  const { ready } = installEgress(ctx, { whitelistPath, env: {}, diagnose: () => {} })
  const result = await ready

  assert.deepEqual(result.hosts, [])
  await ctx.disposers[0]()()
  assert.equal(undici.getGlobalDispatcher(), before)
})

test('undici 加载失败：文件监听被关掉，不留后台残余', async (t) => {
  clearProxyEnv(t)
  const whitelistPath = await tempWhitelistPath(t, ['api.openai.com'])
  const before = undici.getGlobalDispatcher()
  const ctx = fakeContext()
  const watcher = { closed: 0 }
  const watch = () => ({ on() {}, close: () => (watcher.closed += 1) })

  const { ready } = installEgress(ctx, {
    whitelistPath,
    env: {},
    watch,
    loadUndici: async () => {
      throw new Error('undici 装不上')
    },
    diagnose: () => {},
  })

  await assert.rejects(ready, /undici 装不上/)
  assert.ok(watcher.closed >= 1)
  assert.equal(undici.getGlobalDispatcher(), before)
  // 清理函数也已经注册过：即便再被调用也不会出错。
  await ctx.disposers[0]()()
})

test('装配途中（等 undici 加载时）插件被停用：不会装上全局出口，监听也被关掉', async (t) => {
  clearProxyEnv(t)
  const whitelistPath = await tempWhitelistPath(t, ['api.openai.com'])
  const before = undici.getGlobalDispatcher()
  const ctx = fakeContext()
  const watcher = { closed: 0 }
  const watch = () => ({ on() {}, close: () => (watcher.closed += 1) })
  const records = []
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })

  const { ready } = installEgress(ctx, {
    whitelistPath,
    env: {},
    watch,
    loadUndici: async () => {
      await gate
      return undici
    },
    diagnose: (record) => records.push(record),
  })

  // 等装配走到「等 undici」那一步，此时清理动作必须已经注册（以前是装完才注册）。
  while (!records.some((r) => r.step === 'whitelist-loaded')) await new Promise((r) => setTimeout(r, 5))
  assert.equal(ctx.disposers.length, 1)
  await ctx.disposers[0]()()
  release()

  assert.equal((await ready).kind, 'cancelled')
  assert.equal(undici.getGlobalDispatcher(), before)
  assert.ok(watcher.closed >= 1)
  assert.ok(records.some((r) => r.step === 'egress-cancelled'))
})
