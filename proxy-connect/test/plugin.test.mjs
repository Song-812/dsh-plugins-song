import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { install } from '../lib/plugin.js'
import { PROVIDER_ID } from '../lib/provider.js'
import { BUILTIN_PROVIDER_ID } from '../lib/config.js'

const DEPS = {
  whitelistPath: 'C:/tmp/whitelist.json',
  loadTransports: async () => ({
    direct: { request: async () => { throw new Error('unused') }, close: async () => {} },
    proxy: { request: async () => { throw new Error('unused') }, close: async () => {} },
  }),
}

/** 一份最小 profile：web 那段指向本插件，另有一条禁用标记。 */
const PROFILE_TEXT = `- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: deepseek-official
    fetchProvider: proxy-connect
- id: dsh-proxy-connect
  disabled: false
`

async function tempPatchFile(t, text = PROFILE_TEXT) {
  const dir = await mkdtemp(join(tmpdir(), 'proxy-connect-plugin-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'cordis.patch.yml')
  await writeFile(file, text, 'utf8')
  return file
}

test('停用时把配置交还给内置抓取器，写的是 profile 文件而不是 configEditor', async (t) => {
  const patchFilePath = await tempPatchFile(t)
  const { ctx, state } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID })

  const { ready } = install(ctx, { ...DEPS, patchFilePath, configRetryDelayMs: 0 })
  await ready
  await state.teardowns[0]()

  const text = await readFile(patchFilePath, 'utf8')
  assert.match(text, /fetchProvider: http/)
  assert.doesNotMatch(text, /fetchProvider: proxy-connect/)
  assert.match(text, /searchProvider: deepseek-official/)
  assert.match(text, /- id: dsh-proxy-connect\n {2}disabled: false/)
  // 启用那次走 configEditor；交还这一次不再经过它，所以只有一条编辑记录。
  assert.deepEqual(
    state.edits.map((item) => item.fetchProvider),
    [PROVIDER_ID],
  )
})

test('启用时 configEditor 被 HMR 事务挡住 → 退回文件写入，配置照样指向自己', async (t) => {
  const patchFilePath = await tempPatchFile(
    t,
    PROFILE_TEXT.replace('fetchProvider: proxy-connect', 'fetchProvider: http'),
  )
  const entry = { id: 'include:web' }
  const records = []
  const ctx = {
    web: { registerFetchProvider: () => () => {} },
    get: (key) =>
      key === 'configEditor'
        ? {
            entries: () => [entry],
            configuration: () => [
              { entry, inherited: {}, override: { searchProvider: 'deepseek-official', fetchProvider: 'http' } },
            ],
            edit: async () => {
              throw new Error('HMR transactions cannot be nested')
            },
          }
        : undefined,
    effect: () => {},
    logger: { warn: () => {} },
  }

  const { ready } = install(ctx, {
    ...DEPS,
    patchFilePath,
    configRetryDelayMs: 0,
    diagnose: (record) => records.push(record),
  })
  await ready

  assert.match(await readFile(patchFilePath, 'utf8'), /fetchProvider: proxy-connect/)
  assert.ok(
    records.some((record) => record.step === 'claim-via-file'),
    '应当记下退回文件写入',
  )
  assert.ok(records.some((record) => record.step === 'claim-via-config-editor-failed'))
})

test('接管也会确认一次：延迟后再写一遍，两次都记进诊断', async (t) => {
  const patchFilePath = await tempPatchFile(
    t,
    PROFILE_TEXT.replace('fetchProvider: proxy-connect', 'fetchProvider: http'),
  )
  const entry = { id: 'include:web' }
  const records = []
  const ctx = {
    web: { registerFetchProvider: () => () => {} },
    get: (key) =>
      key === 'configEditor'
        ? {
            entries: () => [entry],
            configuration: () => [
              { entry, inherited: {}, override: { searchProvider: 'deepseek-official', fetchProvider: 'http' } },
            ],
            edit: async () => {
              throw new Error('HMR transactions cannot be nested')
            },
          }
        : undefined,
    effect: () => {},
    logger: { warn: () => {} },
  }

  await install(ctx, {
    ...DEPS,
    patchFilePath,
    configRetryDelayMs: 10,
    diagnose: (record) => records.push(record),
  }).ready

  const steps = records.filter((record) => record.step.startsWith('claim-via-file')).map((r) => r.step)
  assert.deepEqual(steps, ['claim-via-file', 'claim-via-file-confirmed'])
  assert.equal(records.find((r) => r.step === 'claim-via-file').changed, true)
  assert.equal(records.find((r) => r.step === 'claim-via-file-confirmed').changed, false)
  assert.match(await readFile(patchFilePath, 'utf8'), /fetchProvider: proxy-connect/)
})

test('停用交还失败（文件读不到且原因不是「不存在」）会被记进诊断，不会静默吞掉', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'proxy-connect-plugin-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  // 配置路径被一个同名目录占住：读会以 EISDIR 失败（不是「文件不存在」）。
  const patchFilePath = join(dir, 'cordis.patch.yml')
  await mkdir(patchFilePath)
  const records = []
  const { ctx, state } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID })

  await install(ctx, {
    ...DEPS,
    patchFilePath,
    configRetryDelayMs: 0,
    diagnose: (record) => records.push(record),
  }).ready
  await state.teardowns[0]()

  const failed = records.find((record) => record.step === 'hand-back-failed')
  assert.ok(failed, '应当记下 hand-back-failed 步骤')
  assert.match(String(failed.message), /EISDIR|is a directory|EPERM/i)
})

test('交还会确认一次：延迟后再写一遍，两次都记进诊断', async (t) => {
  const patchFilePath = await tempPatchFile(t)
  const records = []
  const { ctx, state } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID })

  await install(ctx, {
    ...DEPS,
    patchFilePath,
    configRetryDelayMs: 10,
    diagnose: (record) => records.push(record),
  }).ready
  await state.teardowns[0]()

  const steps = records.filter((record) => record.step.startsWith('handed-back')).map((r) => r.step)
  assert.deepEqual(steps, ['handed-back', 'handed-back-confirmed'])
  assert.equal(records.find((r) => r.step === 'handed-back').changed, true)
  assert.equal(records.find((r) => r.step === 'handed-back-confirmed').changed, false)
})

test('文件已经指向内置实现时，停用不会改文件', async (t) => {
  const already = PROFILE_TEXT.replace('fetchProvider: proxy-connect', 'fetchProvider: http')
  const patchFilePath = await tempPatchFile(t, already)
  const records = []
  const { ctx, state } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID })

  await install(ctx, {
    ...DEPS,
    patchFilePath,
    configRetryDelayMs: 0,
    diagnose: (record) => records.push(record),
  }).ready
  await state.teardowns[0]()

  assert.equal(await readFile(patchFilePath, 'utf8'), already)
  assert.equal(records.find((r) => r.step === 'handed-back').changed, false)
})

const SEARCH_PROVIDER = 'deepseek-official'

/**
 * 配置行的三种形状，都是在真实 DSH 里见过或可能见的：
 *   plain           —— { id: 'web' }
 *   loader          —— { id: 'include:web', patchId: 'web' }
 *   loaderNoPatchId —— { id: 'include:web' }（真实 DSH 就是这个：没有 patchId）
 */
const ENTRY_SHAPES = {
  plain: { id: 'web' },
  loader: { id: 'include:web', patchId: 'web' },
  loaderNoPatchId: { id: 'include:web' },
}

/**
 * 假宿主。
 *
 * configEditor 的语义（踩过坑的地方）：`edit(entry, change)` 里 change 收到和返回的
 * 都是**那一行的 config 对象本身**，不含外层 `config:` 键。2026-10-14 我按「整个
 * entry」理解，结果写出了一个嵌套的 config，配置就废了。所以这里的 current/inherited
 * 都直接是 { searchProvider, fetchProvider } 这样的形状。
 */
function fakeHost({ fetchProvider, entryShape = 'plain', currentLayerEmpty = false }) {
  const entry = ENTRY_SHAPES[entryShape]
  const inherited = { searchProvider: SEARCH_PROVIDER, fetchProvider }
  const state = {
    registered: [],
    edits: [],
    teardowns: [],
    current: currentLayerEmpty ? {} : { searchProvider: SEARCH_PROVIDER, fetchProvider },
  }
  const editor = {
    entries: () => [entry],
    configuration: () => [{ entry, inherited, override: state.current }],
    edit: async (_entry, change) => {
      state.current = change(state.current, inherited)
      state.edits.push(state.current)
    },
  }
  const ctx = {
    web: {
      registerFetchProvider: (provider) => {
        state.registered.push(provider)
        return () => {}
      },
    },
    get: (key) => (key === 'configEditor' ? editor : undefined),
    effect: (callback) => {
      state.teardowns.push(callback())
    },
    logger: { warn: () => {} },
  }
  return { ctx, state }
}

test('安装后注册抓取器，并把 web 的抓取器改成自己', async () => {
  const { ctx, state } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID })

  const { ready } = install(ctx, DEPS)
  await ready

  assert.equal(state.registered.length, 1)
  assert.equal(state.registered[0].id, PROVIDER_ID)
  assert.equal(state.edits.length, 1)
  assert.equal(state.edits[0].fetchProvider, PROVIDER_ID)
  assert.equal(state.edits[0].searchProvider, SEARCH_PROVIDER)
})

test('写回的就是 config 里的字段本身，不会再套一层 config', async () => {
  const { ctx, state } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID })

  const { ready } = install(ctx, DEPS)
  await ready

  const written = state.edits.at(-1)
  assert.equal(written.config, undefined)
  assert.deepEqual(Object.keys(written).sort(), ['fetchProvider', 'searchProvider'])
})

test('配置行形如 Loader 行（id=include:web、patchId=web）时能找到并改写', async () => {
  const { ctx, state } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID, entryShape: 'loader' })

  const { ready } = install(ctx, DEPS)
  await ready

  assert.equal(state.edits.length, 1)
  assert.equal(state.edits[0].fetchProvider, PROVIDER_ID)
})

test('配置行只有 Loader 式 id（include:web，没有 patchId）时也能找到', async () => {
  const { ctx, state } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID, entryShape: 'loaderNoPatchId' })

  const { ready } = install(ctx, DEPS)
  await ready

  assert.equal(state.edits.length, 1)
  assert.equal(state.edits[0].fetchProvider, PROVIDER_ID)
})

test('当前层还没有 config 时，写回会从继承层补齐 searchProvider', async () => {
  const { ctx, state } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID, currentLayerEmpty: true })

  const { ready } = install(ctx, DEPS)
  await ready

  assert.equal(state.edits.length, 1)
  assert.equal(state.edits[0].fetchProvider, PROVIDER_ID)
  assert.equal(state.edits[0].searchProvider, SEARCH_PROVIDER)
})

test('配置已经指向自己时不重复写', async () => {
  const { ctx, state } = fakeHost({ fetchProvider: PROVIDER_ID })

  const { ready } = install(ctx, DEPS)
  await ready

  assert.equal(state.edits.length, 0)
})

test('启用时改配置指向自己，停用时改文件交还内置', async (t) => {
  const patchFilePath = await tempPatchFile(t)
  const { ctx, state } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID })

  const { ready } = install(ctx, { ...DEPS, patchFilePath, configRetryDelayMs: 0 })
  await ready
  await state.teardowns[0]()

  assert.deepEqual(
    state.edits.map((item) => item.fetchProvider),
    [PROVIDER_ID],
  )
  assert.match(await readFile(patchFilePath, 'utf8'), /fetchProvider: http/)
})

test('诊断会记下 entries 的形状，便于在 DSH 里查证', async () => {
  const { ctx } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID, entryShape: 'loaderNoPatchId' })
  const records = []
  const deps = { ...DEPS, diagnose: (record) => records.push(record) }

  const { ready } = install(ctx, deps)
  await ready

  const entryRecord = records.find((record) => record.step === 'entry')
  const shape = { id: 'include:web', patchId: null, name: null }
  assert.equal(entryRecord.total, 1)
  assert.deepEqual(entryRecord.sample, [shape])
  assert.deepEqual(entryRecord.matched, shape)
})

test('重载场景：旧实例交还后的「400ms 确认」不会把新实例刚接管的配置改回去', async (t) => {
  const patchFilePath = await tempPatchFile(t) // 文件里现在是 fetchProvider: proxy-connect
  const oldRecords = []
  const { ctx: oldCtx, state: oldState } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID })
  await install(oldCtx, {
    ...DEPS,
    patchFilePath,
    configRetryDelayMs: 60,
    diagnose: (record) => oldRecords.push(record),
  }).ready

  // 旧实例开始停用：先把文件交还成 http，然后进入等待。
  const teardown = oldState.teardowns[0]()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.match(await readFile(patchFilePath, 'utf8'), /fetchProvider: http/)

  // 新实例此时接管（configEditor 被事务挡住，走文件写入）。
  const entry = { id: 'include:web' }
  const newCtx = {
    web: { registerFetchProvider: () => () => {} },
    get: (key) =>
      key === 'configEditor'
        ? {
            entries: () => [entry],
            configuration: () => [
              { entry, inherited: {}, override: { searchProvider: 'deepseek-official', fetchProvider: 'http' } },
            ],
            edit: async () => {
              throw new Error('HMR transactions cannot be nested')
            },
          }
        : undefined,
    effect: () => {},
    logger: { warn: () => {} },
  }
  await install(newCtx, { ...DEPS, patchFilePath, configRetryDelayMs: 0 }).ready
  assert.match(await readFile(patchFilePath, 'utf8'), /fetchProvider: proxy-connect/)

  await teardown // 旧实例的延迟确认在这里醒来

  assert.match(await readFile(patchFilePath, 'utf8'), /fetchProvider: proxy-connect/)
  assert.ok(oldRecords.some((r) => r.step === 'hand-back-confirm-skipped'))
  assert.ok(!oldRecords.some((r) => r.step === 'handed-back-confirmed'))
})

test('接管成功时诊断里的 written 步骤会被记录（以前这行在 return 之后，永远执行不到）', async (t) => {
  const patchFilePath = await tempPatchFile(
    t,
    PROFILE_TEXT.replace('fetchProvider: proxy-connect', 'fetchProvider: http'),
  )
  const records = []
  const { ctx } = fakeHost({ fetchProvider: BUILTIN_PROVIDER_ID })
  await install(ctx, { ...DEPS, patchFilePath, configRetryDelayMs: 0, diagnose: (r) => records.push(r) }).ready
  assert.ok(records.some((r) => r.step === 'written'), JSON.stringify(records.map((r) => r.step)))
})
