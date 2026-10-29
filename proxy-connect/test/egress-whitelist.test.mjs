/**
 * 「实时名单」的行为契约。
 *
 * 背景：模型那条路原本在装载时读一次名单，改完 JSON 必须重载插件才生效，
 * 很容易忘（忘了就以为 key 填错了）。这里改成后台监听 + 内存判定：
 * 请求路径上只查内存集合，文件变了由监听刷新。
 *
 * 两条硬要求：
 *   1. 名单写坏/暂时消失时**保留上一份好名单**——否则解析失败等于空名单，
 *      openai 会突然掉回直连；
 *   2. 合法的空数组是**真更新**（使用者真把名单清空，就该全部直连）。
 */
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createLiveWhitelist, readWhitelistStrict } from '../lib/egress-whitelist.js'

/** 一个可控的假读取器：按顺序吐出准备好的结果，用完后重复最后一个。 */
function scriptedRead(results) {
  let index = 0
  const read = async () => {
    const value = results[Math.min(index, results.length - 1)]
    index += 1
    return value
  }
  return { read, calls: () => index }
}

/** 假监听：记下回调，测试里手动触发；close 被调用时记录。 */
function fakeWatch() {
  const state = { listener: undefined, closed: false, paths: [] }
  const watch = (path, listener) => {
    state.paths.push(path)
    state.listener = listener
    return {
      close: () => {
        state.closed = true
      },
    }
  }
  return { watch, state }
}

test('初始名单生效：名单内走代理、名单外直连', async () => {
  const { read } = scriptedRead([{ ok: true, hosts: new Set(['api.openai.com']) }])
  const { watch } = fakeWatch()
  const routes = createLiveWhitelist({ filePath: 'x', read, watch })

  await routes.refresh()

  assert.equal(routes.shouldProxy('https://api.openai.com/v1/models'), true)
  assert.equal(routes.shouldProxy('https://api.deepseek.com/v1/models'), false)
  assert.equal(routes.shouldProxy('http://127.0.0.1:7897'), false)
  routes.dispose()
})

test('文件不存在时不报错，等同空名单', async () => {
  const { read } = scriptedRead([{ ok: false, reason: 'missing' }])
  const { watch } = fakeWatch()
  const routes = createLiveWhitelist({ filePath: 'x', read, watch })

  await routes.refresh()

  assert.equal(routes.shouldProxy('https://api.openai.com/v1/models'), false)
  routes.dispose()
})

test('文件写坏时保留上一份好名单', async () => {
  const { read } = scriptedRead([
    { ok: true, hosts: new Set(['api.openai.com']) },
    { ok: false, reason: 'invalid' },
  ])
  const { watch } = fakeWatch()
  const routes = createLiveWhitelist({ filePath: 'x', read, watch })

  await routes.refresh()
  await routes.refresh()

  assert.equal(routes.shouldProxy('https://api.openai.com/v1/models'), true)
  routes.dispose()
})

test('启动首读就损坏时（没有上一份名单可保留），打印含路径与原因的醒目警告', async () => {
  const { read } = scriptedRead([{ ok: false, reason: 'invalid' }])
  const { watch } = fakeWatch()
  const lines = []
  const original = console.warn
  console.warn = (...args) => {
    lines.push(args.join(' '))
  }
  try {
    const routes = createLiveWhitelist({ filePath: 'C:/x/whitelist.json', read, watch })
    await routes.refresh()
    routes.dispose()
  } finally {
    console.warn = original
  }
  const text = lines.join('\n')
  assert.ok(text.includes('C:/x/whitelist.json'), `警告里应含文件路径，实际：${text}`)
  assert.match(text, /损坏/)
})

test('合法的空数组是真更新（清空名单就全部直连）', async () => {
  const { read } = scriptedRead([
    { ok: true, hosts: new Set(['api.openai.com']) },
    { ok: true, hosts: new Set() },
  ])
  const { watch } = fakeWatch()
  const routes = createLiveWhitelist({ filePath: 'x', read, watch })

  await routes.refresh()
  await routes.refresh()

  assert.equal(routes.shouldProxy('https://api.openai.com/v1/models'), false)
  routes.dispose()
})

test('文件变化会触发刷新，决策随之改变', async () => {
  const { read } = scriptedRead([
    { ok: true, hosts: new Set() },
    { ok: true, hosts: new Set(['anthropic.com']) },
  ])
  const { watch, state } = fakeWatch()
  const routes = createLiveWhitelist({ filePath: 'C:/x/whitelist.json', read, watch, debounceMs: 0 })

  await routes.refresh()
  assert.equal(routes.shouldProxy('https://api.anthropic.com/v1/messages'), false)

  state.listener('change', 'whitelist.json')
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.equal(routes.shouldProxy('https://api.anthropic.com/v1/messages'), true)
  // 监听的是名单所在的目录（按文件名过滤），不是文件本身。
  assert.deepEqual(state.paths, ['C:/x'])
  routes.dispose()
})

test('重复变化只刷新一次（防抖），且刷新失败不抛错', async () => {
  const { read, calls } = scriptedRead([{ ok: true, hosts: new Set() }])
  const { watch, state } = fakeWatch()
  const routes = createLiveWhitelist({ filePath: 'x', read, watch, debounceMs: 5 })

  await routes.refresh()
  const afterInitial = calls()

  state.listener('change')
  state.listener('change')
  state.listener('change')
  await new Promise((resolve) => setTimeout(resolve, 40))

  assert.equal(calls() - afterInitial, 1)
  routes.dispose()
})

test('dispose 会关掉监听', async () => {
  const { read } = scriptedRead([{ ok: true, hosts: new Set() }])
  const { watch, state } = fakeWatch()
  const routes = createLiveWhitelist({ filePath: 'x', read, watch })

  routes.dispose()

  assert.equal(state.closed, true)
})

test('严格读取：合法数组归一化、空数组合法、写坏报 invalid', async () => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'egress-whitelist-'))
  try {
    const file = join(dir, 'whitelist.json')

    await writeFile(file, JSON.stringify(['API.OpenAI.com', '.Anthropic.com']), 'utf8')
    const good = await readWhitelistStrict(file)
    assert.equal(good.ok, true)
    assert.deepEqual([...good.hosts].sort(), ['anthropic.com', 'api.openai.com'])

    await writeFile(file, '[]', 'utf8')
    const empty = await readWhitelistStrict(file)
    assert.equal(empty.ok, true)
    assert.equal(empty.hosts.size, 0)

    await writeFile(file, '{ 写坏了', 'utf8')
    const broken = await readWhitelistStrict(file)
    assert.equal(broken.ok, false)

    const missing = await readWhitelistStrict(join(dir, '不存在.json'))
    assert.equal(missing.ok, false)
    assert.equal(missing.reason, 'missing')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// ───────── 名单文件缺失 / 监听重建（M2） ─────────

/** 可控的假监听：每次调用 watch 记一条；可让前 n 次抛错。 */
function flakyWatch({ failTimes = 0 } = {}) {
  const state = { calls: 0, listeners: [], closed: 0 }
  const watch = (path, listener) => {
    state.calls += 1
    if (state.calls <= failTimes) throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
    state.listeners.push(listener)
    return {
      on() {},
      close: () => {
        state.closed += 1
      },
    }
  }
  return { watch, state }
}

test('监听建失败时按指数退避重试，且同一轮失败只上报一次（不再每秒刷一行）', async () => {
  // 用 mock 计时器逐步推进：断言的是确切的退避间隔（10、20、40、40ms），
  // 不依赖真实时钟，机器再忙也不会漂。
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { watch, state } = flakyWatch({ failTimes: 4 })
    const errors = []
    const { read } = scriptedRead([{ ok: false, reason: 'missing' }])
    const routes = createLiveWhitelist({
      filePath: 'C:/x/whitelist.json',
      read,
      watch,
      retryBaseMs: 10,
      retryMaxMs: 40,
      onError: (error) => errors.push(error),
    })

    assert.equal(state.calls, 1)
    mock.timers.tick(9)
    assert.equal(state.calls, 1, '第 1 次重试要等满 10ms')
    mock.timers.tick(1) // t=10
    assert.equal(state.calls, 2)
    mock.timers.tick(19)
    assert.equal(state.calls, 2, '第 2 次重试要等满 20ms')
    mock.timers.tick(1) // t=30
    assert.equal(state.calls, 3)
    mock.timers.tick(39)
    assert.equal(state.calls, 3, '第 3 次重试按 40ms 封顶，不是 80ms 也不是更短')
    mock.timers.tick(1) // t=70
    assert.equal(state.calls, 4)
    mock.timers.tick(40) // t=110：第 5 次成功
    assert.equal(state.calls, 5)
    mock.timers.tick(400)
    assert.equal(state.calls, 5, '第 5 次成功，之后不再重试')
    assert.equal(errors.length, 1, '连续失败只记一条')
    routes.dispose()
  } finally {
    mock.timers.reset()
  }
})

test('监听重建成功后补读一次名单（监听失效期间文件已经建出来/改过）', async () => {
  const { watch } = flakyWatch({ failTimes: 1 })
  const { read, calls } = scriptedRead([
    { ok: false, reason: 'missing' },
    { ok: true, hosts: new Set(['api.openai.com']) },
  ])
  const routes = createLiveWhitelist({ filePath: 'x/whitelist.json', read, watch, retryBaseMs: 5, onError: () => {} })

  await routes.refresh() // 启动首读：文件还不存在
  assert.equal(routes.shouldProxy('https://api.openai.com/'), false)
  await new Promise((resolve) => setTimeout(resolve, 60))

  assert.equal(routes.shouldProxy('https://api.openai.com/'), true)
  assert.equal(calls(), 2)
  routes.dispose()
})

test('目录里别的文件变化不会触发刷新；只认名单文件名（不分大小写）', async () => {
  const { watch, state } = fakeWatch()
  const { read, calls } = scriptedRead([{ ok: true, hosts: new Set() }])
  const routes = createLiveWhitelist({ filePath: 'D:/dir/whitelist.json', read, watch, debounceMs: 0 })

  state.listener('change', 'debug.log')
  state.listener('rename', 'whitelist.json.tmp')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(calls(), 0)

  state.listener('rename', 'Whitelist.JSON')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(calls(), 1)
  routes.dispose()
})

test('dispose 之后不再重试、不再监听', async () => {
  const { watch, state } = flakyWatch({ failTimes: 100 })
  const routes = createLiveWhitelist({ filePath: 'x/w.json', read: async () => ({ ok: false, reason: 'missing' }), watch, retryBaseMs: 5, onError: () => {} })
  routes.dispose()
  const callsAtDispose = state.calls
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(state.calls, callsAtDispose)
})

test('真实文件系统：名单文件一开始不存在，之后建出来，名单自动生效', async (t) => {
  const { mkdtemp, rm, writeFile, rename } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'proxy-connect-live-'))
  const file = join(dir, 'whitelist.json')
  const errors = []
  const routes = createLiveWhitelist({ filePath: file, debounceMs: 10, onError: (e) => errors.push(e) })
  t.after(async () => {
    routes.dispose()
    await rm(dir, { recursive: true, force: true })
  })

  await routes.refresh()
  assert.equal(routes.shouldProxy('https://api.openai.com/'), false)

  await writeFile(file, JSON.stringify(['api.openai.com']), 'utf8')
  await waitFor(() => routes.shouldProxy('https://api.openai.com/'))

  // 原子替换（临时文件 + 改名）之后监听依然有效。
  await writeFile(join(dir, 'tmp.json'), JSON.stringify(['api.openai.com', 'x.ai']), 'utf8')
  await rename(join(dir, 'tmp.json'), file)
  await waitFor(() => routes.shouldProxy('https://x.ai/'))
  await writeFile(join(dir, 'tmp2.json'), JSON.stringify(['api.openai.com', 'x.ai', 'z.com']), 'utf8')
  await rename(join(dir, 'tmp2.json'), file)
  await waitFor(() => routes.shouldProxy('https://z.com/'))
  assert.equal(errors.length, 0)
})

async function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) assert.fail('等待名单生效超时')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
