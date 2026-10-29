/**
 * Offline smoke test for dsh-ui-hide's Session-row rename action.
 *
 * Loads lib/client.js the way the browser module loader does (a fake
 * `window.__ModuleLoader__` plus a stand-in `react`), so the assertions run on
 * the real bundle instead of a rewrite. No DSH, no browser, no network.
 *
 * Run: node test\row-rename.mjs   (from the plugin folder)
 */
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const CLIENT = new URL('../lib/client.js', import.meta.url)
const ROW_ACTION_SLOT = 'sidebar.workspaces.session.row.action'

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log(`PASS  ${name}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

/** A React stand-in that records what the bundle renders. */
function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
  }
}

/** The MutationObserver stand-in: the test fires its callback by hand. */
class FakeObserver {
  constructor(callback) {
    this.callback = callback
    this.disconnected = false
    FakeObserver.last = this
  }
  observe() {}
  disconnect() {
    this.disconnected = true
  }
}

/** Load the bundle into a fresh sandbox and hand back everything the test drives. */
async function loadBundle() {
  const code = await readFile(CLIENT, 'utf8')
  let definition = null
  const head = []
  const timers = []
  const document = {
    body: {},
    head: { appendChild: (node) => head.push(node) },
    createElement: (tag) => ({
      tagName: String(tag).toUpperCase(),
      id: '',
      textContent: '',
      remove() {},
    }),
    getElementById: (id) => head.find((node) => node.id === id) ?? null,
    querySelector: () => null,
  }
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(next) {
          definition = next
        },
      },
    },
    document,
    MutationObserver: FakeObserver,
    setTimeout: (fn) => {
      timers.push(fn)
      return timers.length
    },
    clearTimeout: () => {},
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  if (definition === null) throw new Error('bundle did not call __ModuleLoader__.load')
  const exports = definition.factory(() => fakeReact())
  return { exports, document, timers }
}

/** Apply the plugin and collect every slot registration it makes. */
function applyWithSlots(exports) {
  const registrations = []
  const slots = {
    inject: (_name, callback) => callback(),
    register: (options, component) => {
      registrations.push({ options, component })
      return () => {}
    },
  }
  const ctx = {
    effect: (fn) => fn(),
    inject: (_deps, fn) => fn({ get: () => slots, effect: (fn2) => fn2() }),
  }
  exports.apply(ctx)
  return registrations
}

/** A fake button exposing exactly what openRename reads: className + ARIA attributes. */
function makeButton({ className = '', ariaLabel = null, hasPopup = null, onClick = () => {} } = {}) {
  return {
    className,
    getAttribute(name) {
      if (name === 'aria-label') return ariaLabel
      if (name === 'aria-haspopup') return hasPopup
      return null
    },
    click: onClick,
  }
}

/**
 * A Session row exposing querySelectorAll("button"), the real DOM surface
 * openRename now uses to locate the "..." trigger.
 */
function makeRow(buttons) {
  const list = (buttons || []).filter(Boolean)
  return {
    querySelectorAll: (selector) => (selector === 'button' ? list : []),
  }
}

// ---------------------------------------------------------------- registration

{
  const { exports } = await loadBundle()
  const registrations = applyWithSlots(exports)
  const rowAction = registrations.find((entry) => entry.options.name === ROW_ACTION_SLOT)
  check('注册到会话行动作插槽', rowAction !== undefined)
  check(
    '注册 id 非空且 order 为数字',
    rowAction !== undefined &&
      typeof rowAction.options.id === 'string' &&
      rowAction.options.id !== '' &&
      Number.isFinite(rowAction.options.order),
    rowAction === undefined ? '' : JSON.stringify(rowAction.options),
  )

  if (rowAction !== undefined) {
    const element = rowAction.component({ sessionId: 'session-test', displayTitle: '示例' })
    check('组件渲染 button', element.type === 'button', String(element.type))
    check('按钮带中文无障碍名', element.props['aria-label'] === '重命名会话', JSON.stringify(element.props))
    check(
      '按钮内是主题图标而非文字',
      element.children.some((child) => child !== null && child !== undefined && child.type === 'svg'),
    )
    check('点击处理是函数', typeof element.props.onClick === 'function')
  }
}

// ---------------------------------------------------------------- openRename

{
  const { exports, document } = await loadBundle()
  const { openRename } = exports.__test__ ?? {}
  check('导出 openRename', typeof openRename === 'function')
  if (typeof openRename === 'function') {
    let triggerClicked = false
    const trigger = makeButton({ hasPopup: 'true', onClick: () => { triggerClicked = true } })
    const row = makeRow([trigger])
    const item = { clicked: false, click: () => { item.clicked = true } }
    document.querySelector = (selector) => (selector.includes('aria-keyshortcuts') ? item : null)

    const settled = openRename(row)
    check('先点开该行的「…」菜单', triggerClicked)
    FakeObserver.last.callback()
    check('菜单项出现后立刻点它（同一帧内，菜单不闪）', (await settled) === true && item.clicked === true)
    check('完成后观察器已断开', FakeObserver.last.disconnected === true)
  }
}

// 防回归：重命名按钮（.ui-hide-rowAction）渲染在最前时，绝不能自己点自己
// （否则同步无限递归 → RangeError 崩掉整列表）；必须跳过它选中真正的触发器。
{
  const { exports, document } = await loadBundle()
  const { openRename } = exports.__test__ ?? {}
  if (typeof openRename === 'function') {
    let selfClicked = false
    const renameButton = makeButton({ className: 'ui-hide-rowAction', ariaLabel: '重命名会话', onClick: () => { selfClicked = true } })
    let triggerClicked = false
    const trigger = makeButton({ hasPopup: 'true', onClick: () => { triggerClicked = true } })
    const row = makeRow([renameButton, trigger]) // 重命名按钮排在最前
    const item = { clicked: false, click: () => { item.clicked = true } }
    document.querySelector = (selector) => (selector.includes('aria-keyshortcuts') ? item : null)

    const settled = openRename(row)
    check('重命名按钮在最前时不会自己点自己（防 RangeError）', selfClicked === false)
    check('重命名按钮在最前时仍能点开真正的「…」菜单', triggerClicked === true)
    FakeObserver.last.callback()
    check('随后仍能触发内置重命名项', (await settled) === true && item.clicked === true)
  }
}

{
  const { exports } = await loadBundle()
  const { openRename } = exports.__test__ ?? {}
  if (typeof openRename === 'function') {
    check('没有「…」按钮时直接返回 false', (await openRename(makeRow([]))) === false)
  }
}

{
  const { exports, timers } = await loadBundle()
  const { openRename } = exports.__test__ ?? {}
  if (typeof openRename === 'function') {
    const settled = openRename(makeRow([makeButton({ hasPopup: 'true' })]))
    const timerCallback = timers[timers.length - 1]
    check('设置了等待上限', typeof timerCallback === 'function')
    timerCallback()
    check('菜单迟迟不出现时返回 false', (await settled) === false && FakeObserver.last.disconnected === true)
  }
}

// ---------------------------------------------------------------- click wiring

{
  const { exports, document } = await loadBundle()
  const registrations = applyWithSlots(exports)
  const rowAction = registrations.find((entry) => entry.options.name === ROW_ACTION_SLOT)
  if (rowAction === undefined) {
    check('点击接线（缺少注册，跳过）', false)
  } else {
    const element = rowAction.component({ sessionId: 'session-test', displayTitle: '示例' })

    let triggerClicked = false
    const row = makeRow([makeButton({ hasPopup: 'true', onClick: () => { triggerClicked = true } })])
    const item = { clicked: false, click: () => { item.clicked = true } }
    document.querySelector = (selector) => (selector.includes('aria-keyshortcuts') ? item : null)

    let prevented = false
    let stopped = false
    const event = {
      currentTarget: { closest: () => row },
      preventDefault: () => { prevented = true },
      stopPropagation: () => { stopped = true },
    }
    element.props.onClick(event)
    check('点击不冒泡到整行（不会误开会话）', prevented === true && stopped === true)
    check('点击先打开「…」菜单', triggerClicked === true)
    FakeObserver.last.callback()
    check('随后触发内置重命名项', item.clicked === true)
  }
}

console.log(failures === 0 ? '\n所有检查通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
