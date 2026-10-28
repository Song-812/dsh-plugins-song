import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundlePath = path.join(here, '..', 'lib', 'client.js')

/** 加载浏览器打包文件，只取它导出的纯函数，不渲染任何组件。 */
function loadClient() {
  let captured
  globalThis.window = { __ModuleLoader__: { load: (definition) => { captured = definition } } }
  const source = fs.readFileSync(bundlePath, 'utf8')
  new Function('window', source)(globalThis.window)
  const stubs = {
    react: {
      createElement: () => null,
      useState: (initial) => [initial, () => {}],
      useEffect: () => {},
      useSyncExternalStore: () => null,
    },
  }
  return captured.factory((id) => stubs[id])
}

/** 造一个只有 sessions.retainInfo 的假 ctx。 */
function fakeCtx(retainInfo) {
  return {
    get(name) {
      if (name !== 'sessions') return undefined
      return { retainInfo }
    },
  }
}

test('可删的判定查一次就够，不必每次悬停都问宿主', () => {
  const { canSkipCheck } = loadClient().__test__

  assert.equal(canSkipCheck({ deletable: true, reason: null }), true)
})

test('不可删的判定不许跳过重查：会话跑完了按钮要能马上变回可点', () => {
  const { canSkipCheck } = loadClient().__test__

  assert.equal(canSkipCheck({ deletable: false, reason: 'running' }), false)
  assert.equal(canSkipCheck({ deletable: false, reason: 'blank' }), false)
  assert.equal(canSkipCheck(null), false)
})

test('主视图持有、且会话界面正在展示，才算「正在聊的这条」', () => {
  const { isShownInPanel } = loadClient().__test__

  assert.equal(isShownInPanel({ panelActive: false, retainedBy: { mainView: 1 } }), true)
})

test('切到设置等全局面板时，会话界面没在展示，就不算正在聊', () => {
  const { isShownInPanel } = loadClient().__test__

  assert.equal(isShownInPanel({ panelActive: true, retainedBy: { mainView: 1 } }), false)
})

test('只被后台网关持有、主视图没持有的，不算正在聊', () => {
  const { isShownInPanel } = loadClient().__test__

  assert.equal(isShownInPanel({ panelActive: false, retainedBy: { gateway: 2 } }), false)
  assert.equal(isShownInPanel({ panelActive: false, retainedBy: undefined }), false)
  assert.equal(isShownInPanel({ panelActive: false, retainedBy: {} }), false)
})

test('当前会话不再被拦：宿主说可删就是可删', () => {
  const { rowReason } = loadClient().__test__

  assert.equal(rowReason({ deletable: true, reason: null }), null)
})

test('禁用只看宿主判定：还在跑 / 空白才拦，正在聊不再是理由', () => {
  const { rowReason } = loadClient().__test__

  assert.equal(rowReason({ deletable: false, reason: 'running' }), 'running')
  assert.equal(rowReason({ deletable: false, reason: 'blank' }), 'blank')
  assert.equal(rowReason({ deletable: false, reason: null }), null)
})

test('没问过宿主时不禁用，点了会当场问一次', () => {
  const { rowBlocked } = loadClient().__test__

  assert.equal(rowBlocked(null), false)
  assert.equal(rowBlocked({ deletable: false, reason: 'running' }), true)
})

test('删的正是当前会话、且删除成功，才需要开一个空白会话', () => {
  const { shouldStartSession } = loadClient().__test__

  assert.equal(shouldStartSession({ ok: true }, { wasCurrent: true }), true)
  assert.equal(shouldStartSession({ ok: true }, { wasCurrent: false }), false)
  assert.equal(shouldStartSession({ ok: true }, null), false)
  assert.equal(shouldStartSession({ ok: false }, { wasCurrent: true }), false)
  assert.equal(shouldStartSession(undefined, { wasCurrent: true }), false)
})

test('补空白会话以点击时的 wasCurrent 为准：删除成功后 retainInfo 可能已被广播清掉', () => {
  const { shouldStartSession } = loadClient().__test__
  // 模拟 confirm() 修复后的逻辑：wasCurrent 来自 target.wasCurrent，不再现场读 retainInfo。
  assert.equal(shouldStartSession({ ok: true }, { wasCurrent: true }), true)
  assert.equal(shouldStartSession({ ok: false }, { wasCurrent: true }), false)
  assert.equal(shouldStartSession({ ok: true }, { wasCurrent: false }), false)
})

test('状态事件：本行跑完要解锁，本行开始跑要立刻变灰，别的会话不动', () => {
  const { applyStatus } = loadClient().__test__
  const idle = { deletable: true, reason: null }

  assert.equal(applyStatus(idle, 'abc', false, 'abc'), null)
  assert.deepEqual(applyStatus(idle, 'abc', true, 'abc'), { deletable: false, reason: 'running' })
  assert.equal(applyStatus(idle, 'other', true, 'abc'), idle)
  assert.equal(applyStatus(null, 'abc', false, 'abc'), null)
})

test('确认框问句：回收站不可用时必须把「将永久删除、无法找回」说在前面', () => {
  const { questionFor, TEXT } = loadClient().__test__
  const zh = TEXT.zh
  const en = TEXT.en

  assert.equal(questionFor({ label: '812.7K', permanent: true }, zh), zh.askWithTokensPermanent('812.7K'))
  assert.equal(questionFor({ label: '', permanent: true }, zh), zh.askPermanent)
  assert.match(questionFor({ label: '812.7K', permanent: true }, zh), /永久删除/)
  assert.match(questionFor({ label: '', permanent: true }, zh), /无法找回/)
  assert.match(questionFor({ label: '', permanent: true }, en), /permanently/i)
})

test('确认框问句：回收站正常时保持原话术', () => {
  const { questionFor, TEXT } = loadClient().__test__
  const zh = TEXT.zh

  assert.equal(questionFor({ label: '812.7K' }, zh), zh.askWithTokens('812.7K'))
  assert.equal(questionFor({ label: '' }, zh), zh.ask)
  assert.equal(questionFor({ label: '', permanent: false }, zh), zh.ask)
  assert.equal(questionFor({ label: '812.7K', permanent: false }, zh), zh.askWithTokens('812.7K'))
})

test('permanent 只认宿主显式传的 true；宿主没说就当 false', () => {
  const { buildPending, TEXT } = loadClient().__test__

  assert.equal(buildPending({ sessionId: 'a' }, { label: '1K', permanent: true }, TEXT.zh).permanent, true)
  assert.equal(buildPending({ sessionId: 'a' }, { label: '1K' }, TEXT.zh).permanent, false)
  assert.equal(buildPending({ sessionId: 'a' }, {}, TEXT.zh).label, '')
  assert.equal(buildPending({ sessionId: 'a' }, { label: 123 }, TEXT.zh).label, '')
})

test('确认框问句：binStatus=suspect 时改说「回收站可能不可用：这次删除有永久丢失风险」', () => {
  const { questionFor, TEXT } = loadClient().__test__
  const zh = TEXT.zh
  const en = TEXT.en

  assert.equal(questionFor({ label: '', binStatus: 'suspect' }, zh), zh.askSuspect)
  assert.equal(questionFor({ label: '812.7K', binStatus: 'suspect' }, zh), zh.askWithTokensSuspect('812.7K'))
  assert.match(questionFor({ label: '', binStatus: 'suspect' }, zh), /永久丢失风险/)
  assert.match(questionFor({ label: '', binStatus: 'suspect' }, en), /permanent loss/i)
})

test('确认框问句：binStatus ok / unknown / 缺省都维持原话术', () => {
  const { questionFor, TEXT } = loadClient().__test__
  const zh = TEXT.zh

  assert.equal(questionFor({ label: '', binStatus: 'ok' }, zh), zh.ask)
  assert.equal(questionFor({ label: '', binStatus: 'unknown' }, zh), zh.ask)
  assert.equal(questionFor({ label: '812.7K', binStatus: 'ok' }, zh), zh.askWithTokens('812.7K'))
  assert.equal(questionFor({ label: '812.7K', binStatus: 'unknown' }, zh), zh.askWithTokens('812.7K'))
  assert.equal(questionFor({ label: '' }, zh), zh.ask)
})

test('permanent 优先级最高：permanent 与 suspect 同时在场也说「将永久删除、无法找回」', () => {
  const { questionFor, TEXT } = loadClient().__test__
  const zh = TEXT.zh

  assert.equal(questionFor({ label: '', permanent: true, binStatus: 'suspect' }, zh), zh.askPermanent)
  assert.equal(questionFor({ label: '812.7K', permanent: true, binStatus: 'suspect' }, zh), zh.askWithTokensPermanent('812.7K'))
})

test('buildPending 记下宿主的 binStatus；宿主没说就是 unknown', () => {
  const { buildPending, TEXT } = loadClient().__test__

  assert.equal(buildPending({ sessionId: 'a' }, { binStatus: 'suspect' }, TEXT.zh).binStatus, 'suspect')
  assert.equal(buildPending({ sessionId: 'a' }, { binStatus: 'ok' }, TEXT.zh).binStatus, 'ok')
  assert.equal(buildPending({ sessionId: 'a' }, { binStatus: 'unknown' }, TEXT.zh).binStatus, 'unknown')
  assert.equal(buildPending({ sessionId: 'a' }, {}, TEXT.zh).binStatus, 'unknown')
})

test('apply 注册两个插槽，且垃圾桶能真的渲染出来（不会一渲染就崩）', () => {
  const source = fs.readFileSync(bundlePath, 'utf8')
  let captured
  globalThis.window = { __ModuleLoader__: { load: (definition) => { captured = definition } } }
  new Function('window', source)(globalThis.window)

  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    // 副作用不真跑：这里只验渲染不炸，不验订阅行为。
    useEffect: () => {},
    useSyncExternalStore: () => null,
  }
  const mod = captured.factory((id) => (id === 'react' ? react : undefined))

  const registrations = []
  const slots = {
    inject: (_name, callback) => callback(),
    register: (meta, component) => registrations.push({ meta, component }),
  }
  // 模拟 Cordis：没注入的服务直接取属性会抛错（2026-10-26 垃圾桶消失就是这么来的）。
  const ctx = {
    effect: (fn) => { fn() },
    inject: (_deps, callback) => callback({
      effect: (fn) => { fn() },
      get: (name) => (name === 'slots' ? slots : undefined),
    }),
    get: (name) => (name === 'slots' ? slots : undefined),
    get remote() { throw new Error('remote 没有注入：不能直接取属性') },
  }

  assert.doesNotThrow(() => mod.apply(ctx))
  assert.equal(registrations.length, 2)

  const row = registrations.find((item) => item.meta.name === 'sidebar.workspaces.session.row.action')
  assert.ok(row, '没注册垃圾桶插槽')

  let tree
  assert.doesNotThrow(() => {
    tree = row.component({
      sessionId: 'abc',
      displayTitle: '测试会话',
      ctx,
      // 模拟内核换了 hook 形状：一调就抛。垃圾桶必须照样渲染出来。
      useSessionRetainInfo: () => { throw new Error('hook 形状变了') },
      usePanelInfo: () => { throw new Error('hook 形状变了') },
    })
  })
  // 注册的是一层包装组件（把 ctx 塞进 props），这里把包装层展开一次。
  if (typeof tree.type === 'function') tree = tree.type(tree.props)
  assert.equal(tree.type, 'button')
  assert.match(tree.props.className, /dsh-session-delete-action/)
})
