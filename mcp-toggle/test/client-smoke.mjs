/**
 * Offline smoke test for dsh-mcp-toggle's client half.
 *
 * It loads lib/client.js the way the browser module loader does (a fake
 * `window.__ModuleLoader__`), then *executes* the real component tree with a
 * tiny hand-rolled renderer and stubbed hooks, so the assertions run against
 * the real code paths instead of a re-implementation.
 *
 * Run: node test\client-smoke.mjs   (from the plugin folder)
 */
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const CLIENT = new URL('../lib/client.js', import.meta.url)

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log(`PASS  ${name}`)
  else { failures += 1; console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

// ---------------------------------------------------------------- stubs

let capturedDefinition = null
const windowListeners = new Map()
const timers = []

const makeElement = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) })

// The stand-in elements for a drag. The scrolling area is deliberately NOT the
// offsetParent, because that is how the real page is built — and it is why taking
// positions from offsetParent + offsetTop never noticed a scroll. `listScroll`
// moves the viewport rects exactly like scrolling does, while `offsetTop` stays.
let listScroll = 0
const fakeOffsetParent = { getBoundingClientRect: () => ({ top: 0, bottom: 400, height: 400 }) }
const makeListRow = (index) => ({
  style: {},
  offsetParent: fakeOffsetParent,
  offsetTop: index * 40,
  offsetHeight: 40,
  getBoundingClientRect: () => {
    const top = 100 + index * 40 - listScroll
    return { top, bottom: top + 40, height: 40 }
  },
})
// The picked-up row is the first one (mcp-b in the drag tests).
const fakeRow = makeListRow(0)
const fakeList = {
  getBoundingClientRect: () => ({ top: -listScroll, bottom: 400 - listScroll, height: 400 }),
  querySelectorAll: () => [fakeRow, makeListRow(1), makeListRow(2)],
}

let hookIndex = 0
let seed = new Map()
let refSeed = new Map()
let useRefIndex = 0

const reactStub = {
  createElement: makeElement,
  useState: (init) => {
    const index = hookIndex
    hookIndex += 1
    const value = seed.has(index) ? seed.get(index) : (typeof init === 'function' ? init() : init)
    return [value, (next) => { stateLog.push({ index, value: typeof next === 'function' ? next(value) : next }) }]
  },
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (init) => {
    const index = useRefIndex
    useRefIndex += 1
    return refSeed.has(index) ? refSeed.get(index) : { current: init }
  },
}

let fetchCalls = []
let stateLog = []
let elementFromPointCalls = []
async function fetchStub(url, options) {
  fetchCalls.push({ url, options })
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}

// A CSSStyleDeclaration acts on one property whether it is addressed as
// `userSelect` or as `user-select`; the stub has to do the same mapping.
const bodyStyle = {
  removeProperty(name) {
    const camel = name.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase())
    delete this[name]
    delete this[camel]
  },
}

Object.assign(globalThis, {
  window: {
    __ModuleLoader__: { load: (definition) => { capturedDefinition = definition } },
    addEventListener: (type, handler) => { windowListeners.set(type, handler) },
    removeEventListener: (type) => { windowListeners.delete(type) },
  },
  document: {
    body: { style: bodyStyle },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, style: {}, textContent: '' }),
    head: { appendChild() {} },
    // Over something that is not a row: the drag must fall back to row rects.
    elementFromPoint: (x, y) => { elementFromPointCalls.push([x, y]); return null },
  },
  fetch: fetchStub,
  confirm: () => true,
  // A cancelled timer must really be gone: the hold-cancel path is only provable if
  // clearTimeout behaves like the browser's.
  setTimeout: (fn) => { timers.push(fn); return timers.length },
  clearTimeout: (id) => { timers[id - 1] = undefined },
})

function flushTimers() {
  while (timers.length > 0) {
    const fn = timers.shift()
    if (typeof fn === 'function') fn()
  }
}

const text = await readFile(CLIENT, 'utf8')
vm.runInThisContext(text, { filename: CLIENT.pathname })
check('client.js 注册了 __ModuleLoader__ 模块', capturedDefinition !== null)
check('模块 id 正确', capturedDefinition.id === 'dsh-mcp-toggle', String(capturedDefinition.id))

const dictionaries = {}
const plugin = capturedDefinition.factory((name) => {
  if (name === 'react') return reactStub
  throw new Error(`unexpected require(${name})`)
})

const registered = []
let boundT = null
const locale = {
  register: (ns, dicts) => { dictionaries[ns] = dicts.zh; return () => {} },
  bind: (ns) => {
    boundT = (key, params) => {
      const template = (dictionaries[ns] ?? {})[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
    }
    return boundT
  },
}

const ctx = {
  // cordis runs the effect body immediately, which is how the dictionaries and
  // the stylesheet get installed; the harness must do the same.
  effect: (fn) => fn(),
  locale,
  slots: {
    inject: (name, callback) => { callback() },
    register: (spec, component) => { registered.push({ spec, component }); return () => {} },
  },
}

plugin.apply(ctx)
check('注册了侧栏面板与主面板', registered.length >= 2, `registered=${registered.length}`)

const mainEntry = registered.find((entry) => entry.spec.name === 'main')
check('主面板组件已注册', mainEntry !== undefined)

// ------------------------------------------------------- render harness

function expand(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (typeof node.type === 'function') return expand(node.type({ ...node.props, children: node.children }))
  return { type: node.type, props: node.props, children: node.children.map(expand) }
}

function collect(node, predicate, found = []) {
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  for (const child of node.children) collect(child, predicate, found)
  return found
}

const rows = [
  { id: 'mcp-a', entryId: 'entry-a', label: 'A 服务器原名', endpoint: 'http://a/mcp', enabled: true, fiberPhase: 'active', toolCount: 3 },
  { id: 'mcp-b', entryId: 'entry-b', label: 'B 服务器原名', endpoint: 'http://b/mcp', enabled: false, fiberPhase: null, toolCount: 0 },
  { id: 'mcp-c', entryId: 'entry-c', label: 'C 新服务器', endpoint: 'http://c/mcp', enabled: true, fiberPhase: 'active', toolCount: 1 },
]

function render(overrides = {}) {
  hookIndex = 0
  useRefIndex = 0
  seed = new Map([
    // Hook order after removing patchFiles / editing / draft states.
    [0, overrides.servers ?? rows],
    [1, { total: 3, off: 1 }],
    [2, overrides.synced ?? true],
    [3, overrides.loading ?? false],
    [4, overrides.notice],
    [5, overrides.query ?? ''],
    [6, {}],
    [7, overrides.prefs ?? { titles: { 'mcp-b': '我的自定义名' }, order: [], collapsed: false, groupTitle: '我的 MCP 组' }],
    [8, false],
    [9, overrides.dragId ?? null],
    [10, overrides.dropIndex ?? null],
  ])
  // The list a drag measures: the picked-up row first (mcp-b), then the two it never
  // drags. Tops are 100/140/180 with 40px rows, so midpoints are 120/160/200 — the
  // two that matter are 160 and 200.
  const fakeUl = fakeList
  // ulRef is the 5th useRef (0-based index 4) after editGuard was removed.
  refSeed = new Map([[4, { current: overrides.ul ?? fakeUl }]])
  fetchCalls = []
  stateLog = []
  return expand(mainEntry.component({ t: boundT, ctx }))
}

const tree = render()
check('渲染未抛异常且产出了页面节点', tree !== null && tree.props.className === 'mct-page')

const grips = collect(tree, (node) => node.props.className === 'mct-grip')
check('每行都有长按手柄（3 个）', grips.length === 3, `grips=${grips.length}`)
const pencils = collect(tree, (node) => node.props.className === 'mct-edit')

const resetButtons = collect(tree, (node) => node.props.className === 'mct-resetBtn')
check('工具栏有「恢复默认」', resetButtons.length === 1 && resetButtons[0].children[0] === '恢复默认')
const collapseButtons = collect(tree, (node) => node.props.className === 'mct-collapseBtn')
check('组头有折叠按钮', collapseButtons.length === 1 && collapseButtons[0].children.includes('折叠'))
const groupTitles = collect(tree, (node) => node.props.className === 'mct-groupTitle')
check('组头显示自定义组名', groupTitles.length === 1 && groupTitles[0].children[0] === '我的 MCP 组')
const knobs = collect(tree, (node) => node.props.role === 'switch' && node.props.className === undefined)
check('组头有一键旋钮（未全开时 aria-checked=false）', knobs.length >= 1 && knobs[0].props['aria-checked'] === false, JSON.stringify(knobs.map((k) => k.props['aria-checked'])))
const titleRows = collect(tree, (node) => node.props.className === 'mct-titleRow')
check('只有改过名的条目才画主标题位（1 个）', titleRows.length === 1, `titleRows=${titleRows.length}`)
const names = collect(tree, (node) => node.props.className === 'mct-name')
const nameTexts = names.map((node) => node.children[0])
check('改名条目显示自定义主标题', nameTexts.includes('我的自定义名'), JSON.stringify(nameTexts))
check('没改名的条目保持原来的名字样式（A 与 C）', nameTexts.includes('A 服务器原名') && nameTexts.includes('C 新服务器'), JSON.stringify(nameTexts))
const subs = collect(tree, (node) => node.props.className === 'mct-sub')
const subTexts = subs.map((node) => node.children[0]).filter((value) => typeof value === 'string')
check('改名后原名降为副标题', subTexts.includes('B 服务器原名'), JSON.stringify(subTexts))
check('每行仍有 id·地址 副标题（3 条）', subTexts.filter((text) => text.includes(' · ')).length === 3, JSON.stringify(subTexts))

// ordering: seeded order puts B before A, and C (unknown) last. With no custom
// titles the originals render in the name style, so both lines are collected.
const nameLines = (node) => [
  ...collect(node, (child) => child.props.className === 'mct-name'),
  ...collect(node, (child) => child.props.className === 'mct-sub'),
].map((child) => child.children[0]).filter((value) => typeof value === 'string' && value.includes('服务器'))
const ordered = render({ prefs: { titles: {}, order: ['mcp-b', 'mcp-a'], collapsed: false, groupTitle: '' } })
const orderedLabels = nameLines(ordered)
check('自定义排序生效，新条目追加到组尾', JSON.stringify(orderedLabels) === JSON.stringify(['B 服务器原名', 'A 服务器原名', 'C 新服务器']), JSON.stringify(orderedLabels))

// collapse hides the list
const collapsed = render({ prefs: { titles: {}, order: [], collapsed: true, groupTitle: '' } })
check('折叠后不渲染条目列表', collect(collapsed, (node) => node.props.className === 'mct-cards').length === 0)
check('折叠后按钮文字变成「展开」', collect(collapsed, (node) => node.props.className === 'mct-collapseBtn')[0].children.includes('展开'))

// reset button posts defaults
const resetTree = render()
collect(resetTree, (node) => node.props.className === 'mct-resetBtn')[0].props.onClick()
await new Promise((resolve) => setImmediate(resolve))
const resetBody = JSON.parse(fetchCalls[fetchCalls.length - 1].options.body)
check('「恢复默认」POST 空偏好', JSON.stringify(resetBody.prefs) === JSON.stringify({ titles: {}, order: [], collapsed: false, groupTitle: '' }), JSON.stringify(resetBody.prefs))

// collapse toggle posts collapsed=true
const toggleTree = render()
collect(toggleTree, (node) => node.props.className === 'mct-collapseBtn')[0].props.onClick()
await new Promise((resolve) => setImmediate(resolve))
const toggleBody = JSON.parse(fetchCalls[fetchCalls.length - 1].options.body)
check('点折叠会记住状态', toggleBody.prefs.collapsed === true, JSON.stringify(toggleBody.prefs))

// touch drag: 300ms hold, move below the last row, release
const dragTree = render({ prefs: { titles: {}, order: ['mcp-b', 'mcp-a', 'mcp-c'], collapsed: false, groupTitle: '' } })
const dragRows = collect(dragTree, (node) => node.props.className === 'mct-card')
const gripProps = collect(dragRows[0], (node) => node.props.className === 'mct-grip')[0].props
// Register the stand-in element for the picked-up row: the follow offset and the
// drop target both need it.
dragRows[0].props.ref(fakeRow)
const touchPointer = {
  button: 0,
  pointerId: 7,
  pointerType: 'touch',
  clientX: 10,
  clientY: 5,
  preventDefault() {},
  currentTarget: { setPointerCapture() {} },
}
const mousePointer = { ...touchPointer, pointerType: 'mouse', pointerId: 9 }
gripProps.onPointerDown(touchPointer, 'mcp-b')
check('触屏按下手柄还没进入拖动（要等 300ms）', timers.length === 1)
flushTimers()
check('进入拖动后给出明确视觉反馈（光标抓起 + 禁止选中）', bodyStyle.cursor === 'grabbing' && bodyStyle.userSelect === 'none', JSON.stringify(bodyStyle))
// A wheel scroll moves the list under a pointer that is not moving, so the drag has
// to hear about it or the row goes stale and appears to snap back.
check('拖动中监听滚动（滚轮翻页时行不会走丢）', windowListeners.has('scroll'), Array.from(windowListeners.keys()).join(','))
const move = windowListeners.get('pointermove')
check('window 上挂了移动监听（指针离开手柄也收得到）', typeof move === 'function')
move({ pointerId: 7, clientX: 10, clientY: 200, preventDefault() {} })
const livePreview = stateLog.filter((entry) => entry.index === 11 && Array.isArray(entry.value)).map((entry) => entry.value).pop()
check('拖动过程中列表实时跟手（预览顺序当场更新）',
  JSON.stringify(livePreview) === JSON.stringify(['mcp-a', 'mcp-c', 'mcp-b']),
  JSON.stringify(livePreview))
// The follow offset is written straight onto the element (no React render per
// pointer move), so the check reads the element's own style.
check('被拖的行跟着指针走（位移直接写在元素上）',
  /translateY\(-?\d/.test(String(fakeRow.style.transform)) && !/translateY\(0(px)?\)/.test(String(fakeRow.style.transform)),
  JSON.stringify(fakeRow.style))
const release = windowListeners.get('pointerup')
check('window 上挂了释放监听', typeof release === 'function')
release({ pointerId: 7, type: 'pointerup' })
await new Promise((resolve) => setImmediate(resolve))
// The drop: the row eases back to 0 with an ease-out transition.
check('松手后走「缓缓落位」动画（ease-out 归零）',
  String(fakeRow.style.transition).includes('ease-out') && String(fakeRow.style.transform).includes('translateY(0px)'),
  JSON.stringify(fakeRow.style))
check('松手后清掉拖动态样式与监听', bodyStyle.cursor === undefined && bodyStyle.userSelect === undefined && windowListeners.size === 0, `${JSON.stringify(bodyStyle)} listeners=${Array.from(windowListeners.keys()).join(',')}`)
const dragBody = JSON.parse(fetchCalls[fetchCalls.length - 1].options.body)
check('触屏拖动后保存了新顺序（mcp-b 移到组尾）', JSON.stringify(dragBody.prefs.order) === JSON.stringify(['mcp-a', 'mcp-c', 'mcp-b']), JSON.stringify(dragBody.prefs.order))

// Drawn in its picked-up state while a drag is in flight. This renders again, so it
// runs after every assertion that reads the log or the element of the drag above.
const liftedTree = render({ dragId: 'mcp-b' })
const liftedRow = collect(liftedTree, (node) => node.props.className === 'mct-card' && node.props['data-lifted'] === '')
check('被拖的行进入「浮起」状态', liftedRow.length === 1, JSON.stringify(liftedRow.length))

// mouse drag: the grip is an explicit affordance, so it arms at once — pressing
// and dragging straight away is exactly what a mouse user does.
timers.length = 0
fetchCalls = []
const mouseTree = render({ prefs: { titles: {}, order: ['mcp-b', 'mcp-a', 'mcp-c'], collapsed: false, groupTitle: '' } })
const mouseGrip = collect(collect(mouseTree, (node) => node.props.className === 'mct-card')[0], (node) => node.props.className === 'mct-grip')[0].props
mouseGrip.onPointerDown(mousePointer, 'mcp-b')
check('鼠标按下手柄即刻进入拖动（不再要求长按）', timers.length === 0 && bodyStyle.cursor === 'grabbing' && windowListeners.has('pointermove'), `timers=${timers.length}`)
windowListeners.get('pointermove')({ pointerId: 9, clientX: 10, clientY: 200, preventDefault() {} })
windowListeners.get('pointerup')({ pointerId: 9, type: 'pointerup' })
await new Promise((resolve) => setImmediate(resolve))
const mouseBody = JSON.parse(fetchCalls[fetchCalls.length - 1].options.body)
check('鼠标一路按下就拖也能换位并保存', JSON.stringify(mouseBody.prefs.order) === JSON.stringify(['mcp-a', 'mcp-c', 'mcp-b']), JSON.stringify(mouseBody.prefs.order))

// The drop target comes from the rows that are NOT dragged: the picked-up row
// follows the pointer, so asking "what is under the pointer" always answered "the
// dragged row itself" and the row could not be moved past itself at all.
// Midpoints of the untouched rows are 160 and 200; a pointer at 170 belongs in
// the middle slot.
timers.length = 0
fetchCalls = []
const midTree = render({ prefs: { titles: {}, order: ['mcp-b', 'mcp-a', 'mcp-c'], collapsed: false, groupTitle: '' } })
const midRows = collect(midTree, (node) => node.props.className === 'mct-card')
midRows[0].props.ref(fakeRow)
collect(midRows[0], (node) => node.props.className === 'mct-grip')[0].props.onPointerDown(mousePointer, 'mcp-b')
windowListeners.get('pointermove')({ pointerId: 9, clientX: 10, clientY: 170, preventDefault() {} })
windowListeners.get('pointerup')({ pointerId: 9, type: 'pointerup' })
await new Promise((resolve) => setImmediate(resolve))
check('落点只看没被拖的行（指针在中段就落到中间）',
  JSON.stringify(JSON.parse(fetchCalls[fetchCalls.length - 1].options.body).prefs.order) === JSON.stringify(['mcp-a', 'mcp-b', 'mcp-c']),
  fetchCalls[fetchCalls.length - 1].options.body)

// Wheel scrolling during a drag. The row follows the list (that part worked), but the
// drop target has to move with it as well: the untouched rows start at 140/180, so a
// pointer parked at 110 is above both midpoints (160/200) and lands first. After the
// list scrolls by 60 those rows sit at 80/120, their midpoints become 100/140, and
// the very same pointer now belongs in the middle slot.
timers.length = 0
fetchCalls = []
listScroll = 0
const scrollTree = render({ prefs: { titles: {}, order: ['mcp-b', 'mcp-a', 'mcp-c'], collapsed: false, groupTitle: '' } })
const scrollRows = collect(scrollTree, (node) => node.props.className === 'mct-card')
scrollRows[0].props.ref(fakeRow)
collect(scrollRows[0], (node) => node.props.className === 'mct-grip')[0].props.onPointerDown(mousePointer, 'mcp-b')
windowListeners.get('pointermove')({ pointerId: 9, clientX: 10, clientY: 110, preventDefault() {} })
listScroll = 60
check('拖动中出现了滚动监听（滚轮翻页能被听见）', typeof windowListeners.get('scroll') === 'function')
windowListeners.get('scroll')()
windowListeners.get('pointerup')({ pointerId: 9, type: 'pointerup' })
await new Promise((resolve) => setImmediate(resolve))
const scrollPost = fetchCalls.filter((call) => String(call.options === undefined ? '' : call.options.body).includes('"prefs"')).pop()
check('滚轮翻页后落点跟着列表走（判定不再停在原地）',
  scrollPost !== undefined && JSON.stringify(JSON.parse(scrollPost.options.body).prefs.order) === JSON.stringify(['mcp-a', 'mcp-b', 'mcp-c']),
  scrollPost === undefined ? '没有发出保存请求（说明落点根本没变）' : scrollPost.options.body)
listScroll = 0

// the "you are holding it" marker: an armed drag must be unmistakable
const chipTree = render({ dragId: 'mcp-b', dropIndex: 1 })
const chips = collect(chipTree, (node) => node.props.className === 'mct-dragChip')
check('拖动中会显示「拖动中…」标签', chips.length === 1 && chips[0].children[0] === '拖动中…', JSON.stringify(chips.map((chip) => chip.children[0])))

// move before the hold fires must cancel (no save)
timers.length = 0
fetchCalls = []
const cancelTree = render()
const cancelGrip = collect(collect(cancelTree, (node) => node.props.className === 'mct-card')[0], (node) => node.props.className === 'mct-grip')[0]
cancelGrip.props.onPointerDown(touchPointer, 'mcp-b')
windowListeners.get('pointermove')({ pointerId: 7, clientX: 80, clientY: 90, preventDefault() {} })
flushTimers()
check('触屏提前移动会取消长按（不进入拖动）', windowListeners.size === 0)
check('取消后没有发出保存请求', fetchCalls.length === 0, `fetch=${fetchCalls.length}`)

// group knob: bulk switch touches only the rows that need it, and reports skips
const bulkRows = [
  { id: 'mcp-a', entryId: 'entry-a', label: 'A', endpoint: '', enabled: true, fiberPhase: 'active', toolCount: 1 },
  { id: 'mcp-b', entryId: 'entry-b', label: 'B', endpoint: '', enabled: false, fiberPhase: null, toolCount: 0 },
  { id: 'mcp-absent', entryId: undefined, label: '幽灵（清单里没有）', endpoint: '', enabled: false, fiberPhase: null, toolCount: undefined, absent: true },
]
const remoteCalls = []
const enabledState = new Map([['entry-a', true], ['entry-b', false]])
ctx.remote = {
  pluginManager: {
    listPlugins: async () => ({
      ok: true,
      value: bulkRows.map((row) => ({
        entryId: row.entryId,
        patchId: row.id,
        moduleName: '@deepseek-ai/dsh-mcp-client',
        enabled: row.entryId === undefined ? false : enabledState.get(row.entryId),
        fiberPhase: row.fiberPhase,
      })),
    }),
    setPluginEnabled: async (entryId, enabled) => {
      remoteCalls.push({ entryId, enabled })
      enabledState.set(entryId, enabled)
      return { ok: true, value: { application: 'applied' } }
    },
  },
}
const bulkTree = render({ servers: bulkRows })
const knob = collect(bulkTree, (node) => node.props.role === 'switch' && node.props.className === undefined)[0]
check('未全开时旋钮是关的', knob.props['aria-checked'] === false)
// The expanded node is the fallback switch's own <button>, whose click flips
// the checked value — exactly what the panel's onChange receives.
knob.props.onClick()
for (let step = 0; step < 300; step += 1) {
  await new Promise((resolve) => setImmediate(resolve))
  flushTimers()
}
check('一键旋钮只切换需要变的行（已开的与不可寻址的都跳过）',
  remoteCalls.length === 1 && remoteCalls[0].entryId === 'entry-b' && remoteCalls[0].enabled === true,
  JSON.stringify(remoteCalls))
const bulkNotice = stateLog.map((entry) => entry.value).find((value) => value !== null && typeof value === 'object' && value.kind === 'ok')
check('批量结果会报数（含跳过的条目）', bulkNotice !== undefined && bulkNotice.text.includes('已切换 1 个') && bulkNotice.text.includes('跳过 1 个'), JSON.stringify(bulkNotice))

// The knob is a latch. A row that cannot be turned on must not snap it back: with a
// plain "is everything on?" rule the knob returned to the off position after a
// partial 全开, and there was no longer a one-click way to turn the group back off.
// The rows report whatever the stub has actually applied, so a reload models reality
// (A came on, B refused) instead of a fresh page.
const latchState = new Map([['entry-a', false], ['entry-b', false]])
const latchServers = () => [
  { id: 'mcp-a', entryId: 'entry-a', label: 'A', endpoint: '', enabled: latchState.get('entry-a'), fiberPhase: null, toolCount: 0 },
  { id: 'mcp-b', entryId: 'entry-b', label: 'B', endpoint: '', enabled: latchState.get('entry-b'), fiberPhase: null, toolCount: 0 },
]
const latchCalls = []
ctx.remote = {
  pluginManager: {
    listPlugins: async () => ({
      ok: true,
      value: latchServers().map((row) => ({
        entryId: row.entryId,
        patchId: row.id,
        moduleName: '@deepseek-ai/dsh-mcp-client',
        enabled: latchState.get(row.entryId),
        fiberPhase: null,
      })),
    }),
    setPluginEnabled: async (entryId, enabled) => {
      latchCalls.push({ entryId, enabled })
      // entry-b refuses to come on: exactly the row that used to drag the knob back.
      if (entryId === 'entry-b' && enabled === true) return { ok: false, reason: 'refused' }
      latchState.set(entryId, enabled)
      return { ok: true, value: { application: 'applied' } }
    },
  },
}
fetchCalls = []
const latchTree = render({ servers: latchServers() })
const latchKnob = collect(latchTree, (node) => node.props.role === 'switch' && node.props.className === undefined)[0]
check('没点过旋钮时按真实状态显示（未全开 → 关）', latchKnob.props['aria-checked'] === false, String(latchKnob.props['aria-checked']))
latchKnob.props.onClick()
for (let step = 0; step < 300; step += 1) {
  await new Promise((resolve) => setImmediate(resolve))
  flushTimers()
}
const latchPost = fetchCalls.filter((call) => String(call.options === undefined ? '' : call.options.body).includes('"bulkOn"')).pop()
check('一键全开时把方向记进偏好（即使中间有行失败）',
  latchPost !== undefined
    && JSON.parse(latchPost.options.body).prefs.bulkOn === true
    && latchCalls.some((call) => call.entryId === 'entry-b' && call.enabled === true),
  latchPost === undefined ? '没有写锁存' : latchPost.options.body)
const savedPrefs = latchPost === undefined ? undefined : JSON.parse(latchPost.options.body).prefs
const reloaded = render({ servers: latchServers(), prefs: savedPrefs })
const reloadedKnob = collect(reloaded, (node) => node.props.role === 'switch' && node.props.className === undefined)[0]
check('全开有行失败后旋钮不归位（刷新也保持亮着）', reloadedKnob.props['aria-checked'] === true, String(reloadedKnob.props['aria-checked']))
latchCalls.length = 0
reloadedKnob.props.onClick()
for (let step = 0; step < 300; step += 1) {
  await new Promise((resolve) => setImmediate(resolve))
  flushTimers()
}
check('接着一次点击就是「一键全关」',
  latchCalls.length === 1 && latchCalls[0].entryId === 'entry-a' && latchCalls[0].enabled === false,
  JSON.stringify(latchCalls))

// 恢复默认 has to forget the latch as well, or the knob would keep a direction the
// user just asked to be rid of.
fetchCalls = []
const latchResetTree = render({ servers: latchServers(), prefs: savedPrefs })
collect(latchResetTree, (node) => node.props.className === 'mct-resetBtn')[0].props.onClick()
await new Promise((resolve) => setImmediate(resolve))
const resetPost = fetchCalls.filter((call) => String(call.options === undefined ? '' : call.options.body).includes('"prefs"')).pop()
check('「恢复默认」会清掉旋钮锁存',
  resetPost !== undefined && JSON.parse(resetPost.options.body).prefs.bulkOn === undefined,
  resetPost === undefined ? '没有发出保存请求' : resetPost.options.body)

// ---------------------------------------------------------------- search box

const cardsOf = (tree) => collect(tree, (node) => node.props.className === 'mct-card')
const titleOf = (card) => {
  const lines = collect(card, (node) => node.props.className === 'mct-name' || node.props.className === 'mct-sub')
  return lines.length === 0 ? '' : lines[0].children[0]
}

// The box matches the custom title, the original name and the id / endpoint — the
// same rule the skills page uses, with id/endpoint added because "MCP 多了" is
// exactly when someone searches for them.
check('搜索命中自定义名（原名仍在副标题上）',
  cardsOf(render({ query: '我的自定义名' })).length === 1
    && titleOf(cardsOf(render({ query: '我的自定义名' }))[0]) === '我的自定义名',
  JSON.stringify(cardsOf(render({ query: '我的自定义名' })).map(titleOf)))
check('搜索命中原名',
  cardsOf(render({ query: 'A 服务器原名' })).length === 1
    && titleOf(cardsOf(render({ query: 'A 服务器原名' }))[0]) === 'A 服务器原名',
  JSON.stringify(cardsOf(render({ query: 'A 服务器原名' })).map(titleOf)))
check('搜索命中 id / endpoint',
  cardsOf(render({ query: 'http://c/' })).length === 1
    && titleOf(cardsOf(render({ query: 'http://c/' }))[0]) === 'C 新服务器',
  JSON.stringify(cardsOf(render({ query: 'http://c/' })).map(titleOf)))
const searchBox = collect(tree, (node) => node.props.className === 'mct-search')[0]
check('搜索框有 aria-label', searchBox !== undefined && (searchBox.children?.[0]?.props?.['aria-label'] === '搜索 MCP 服务器' || searchBox.props?.['aria-label'] === '搜索 MCP 服务器'), JSON.stringify(searchBox && (searchBox.props || searchBox.children?.[0]?.props)))

const searchMiss = render({ query: 'zzz-没有这个' })
check('搜不到时给出空状态（含总数）',
  cardsOf(searchMiss).length === 0
    && collect(searchMiss, (node) => node.props.className === 'mct-empty')[0].children[0] === '没有匹配的 MCP 服务器（本页共 3 个）',
  JSON.stringify(collect(searchMiss, (node) => node.props.className === 'mct-empty').map((node) => node.children[0])))
check('分组计数保持整组数量', collect(render({ query: 'http://c/' }), (node) => node.props.className === 'mct-count')[0].children[0] === '共 3 个 · 已关闭 1 个')

// Dragging while a filter is on must merge back into the FULL order, or the hidden
// rows would be pushed to the end every time.
timers.length = 0
fetchCalls = []
const filteredUl = {
  getBoundingClientRect: () => ({ top: 0, bottom: 400, height: 400 }),
  querySelectorAll: () => [
    { style: {}, offsetParent: null, offsetTop: 0, offsetHeight: 40, getBoundingClientRect: () => ({ top: 100, bottom: 140, height: 40 }) },
    { style: {}, offsetParent: null, offsetTop: 40, offsetHeight: 40, getBoundingClientRect: () => ({ top: 140, bottom: 180, height: 40 }) },
  ],
}
const filteredTree = render({
  ul: filteredUl,
  query: '服务器原名',
  prefs: { titles: {}, order: ['mcp-c', 'mcp-a', 'mcp-b'], collapsed: false, groupTitle: '' },
})
const filteredCards = cardsOf(filteredTree)
check('搜索只留下匹配的行（同一列表里还有一个被藏起来的）',
  filteredCards.length === 2 && collect(filteredTree, (node) => node.props.className === 'mct-count')[0].children[0] === '共 3 个 · 已关闭 1 个',
  `cards=${filteredCards.length}`)
filteredCards[0].props.ref(filteredUl.querySelectorAll()[0])
collect(filteredCards[0], (node) => node.props.className === 'mct-grip')[0].props.onPointerDown(mousePointer, 'mcp-a')
windowListeners.get('pointermove')({ pointerId: 9, clientX: 10, clientY: 200, preventDefault() {} })
windowListeners.get('pointerup')({ pointerId: 9, type: 'pointerup' })
await new Promise((resolve) => setImmediate(resolve))
const filteredPost = fetchCalls.filter((call) => String(call.options === undefined ? '' : call.options.body).includes('"order"')).pop()
check('搜索过滤时拖动排序，被藏起来的行保持原位',
  filteredPost !== undefined && JSON.stringify(JSON.parse(filteredPost.options.body).prefs.order) === JSON.stringify(['mcp-c', 'mcp-b', 'mcp-a']),
  filteredPost === undefined ? '没有发出保存请求' : filteredPost.options.body)


const hiddenConfigTree = render()
const visibleText = (node) => node == null ? '' : typeof node !== 'object' ? String(node) : (node.children ?? []).map(visibleText).join(' ')
check('页面不再显示配置文件路径或孤立标签', !visibleText(hiddenConfigTree).includes('cordis.patch.yml') && !visibleText(hiddenConfigTree).includes('配置文件:'))
check('MCP 条目的连接地址仍保留', visibleText(hiddenConfigTree).includes('http://b/mcp'))

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
