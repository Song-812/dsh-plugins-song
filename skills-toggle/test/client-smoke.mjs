/**
 * Offline smoke test for dsh-skills-toggle's client half.
 *
 * It loads lib/client.js the way the browser module loader does (a fake
 * `window.__ModuleLoader__`), then *executes* the real component tree with a
 * tiny hand-rolled renderer and stubbed hooks, so the assertions run against
 * the real code paths instead of a re-implementation. No browser, no DSH, no
 * build step and no file outside the plugin folder is touched.
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
/** id -> callback; `clearTimeout` really removes, so a cancelled hold is provable. */
const timers = new Map()
let nextTimer = 0

const makeElement = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) })

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
  useMemo: (fn) => fn(),
  useRef: (init) => {
    const index = useRefIndex
    useRefIndex += 1
    return refSeed.has(index) ? refSeed.get(index) : { current: init }
  },
}

let fetchCalls = []
let applyLog = []
/** Files whose write is made to fail, so the knob's latch can be tested. */
const applyFailures = new Set()
let postLog = []
let stateLog = []
let prefsStatus = 200
async function fetchStub(url, options) {
  fetchCalls.push({ url, options })
  if (options === undefined || options.method !== 'POST') {
    return { ok: true, status: 200, json: async () => ({ ok: true, ...inventoryBody }) }
  }
  postLog.push(JSON.parse(options.body))
  const body = JSON.parse(options.body)
  if (body.action === 'prefs') {
    if (prefsStatus !== 200) return { ok: false, status: prefsStatus, json: async () => ({ error: 'nope' }) }
    return { ok: true, status: 200, json: async () => ({ ok: true, prefs: body.prefs }) }
  }
  if (body.action === 'apply') {
    applyLog.push(body.changes)
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        // A file in `applyFailures` models a row that is perfectly addressable but
        // refuses to be written — the case that used to pull the knob back.
        results: body.changes.map((change) => (applyFailures.has(change.file)
          ? { file: change.file, key: change.key, status: 'error', message: 'refused' }
          : { file: change.file, key: change.key, status: 'applied' })),
        ...inventoryBody,
      }),
    }
  }
  if (body.action === 'list') return { ok: true, status: 200, json: async () => ({ ok: true, ...inventoryBody }) }
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
    // Over something that is not a row: the drag falls back to row rects.
    elementFromPoint: () => null,
  },
  fetch: fetchStub,
  confirm: () => true,
  setTimeout: (fn) => { nextTimer += 1; timers.set(nextTimer, fn); return nextTimer },
  clearTimeout: (id) => { timers.delete(id) },
})
globalThis.window.setTimeout = globalThis.setTimeout

function flushTimers() {
  while (timers.size > 0) {
    const [id, fn] = timers.entries().next().value
    timers.delete(id)
    fn()
  }
}

const text = await readFile(CLIENT, 'utf8')
vm.runInThisContext(text, { filename: CLIENT.pathname })
check('client.js 注册了 __ModuleLoader__ 模块', capturedDefinition !== null)
check('模块 id 正确', capturedDefinition.id === 'dsh-skills-toggle', String(capturedDefinition.id))

const dictionaries = {}
const plugin = capturedDefinition.factory((name) => {
  if (name === 'react') return reactStub
  throw new Error(`unexpected require(${name})`)
})

const registered = []
let boundT = null
const locale = {
  register: (ns, dicts) => { dictionaries[ns] = dicts; return () => {} },
  bind: (ns) => {
    boundT = (key, params) => {
      const template = (dictionaries[ns] ?? {}).zh[key] ?? key
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

const zh = dictionaries['skills-toggle'].zh
const en = dictionaries['skills-toggle'].en
const PARITY_KEYS = ['reorder', 'edit', 'editHint', 'collapse', 'expand', 'knobOn', 'knobOff', 'bulkDone', 'bulkDoneSkip', 'reset', 'resetConfirm', 'saveFailed', 'saveNeedsRestart']
check('中英词条都补齐了与其他插件同名的键',
  PARITY_KEYS.every((key) => typeof zh[key] === 'string') && PARITY_KEYS.every((key) => typeof en[key] === 'string'),
  JSON.stringify(PARITY_KEYS.filter((key) => typeof zh[key] !== 'string' || typeof en[key] !== 'string')))

// ------------------------------------------------------------- fixtures

const USER_ROOT = 'C:/u/skills'
const A = `${USER_ROOT}/alpha/SKILL.md`
const B = `${USER_ROOT}/beta/SKILL.md`
const G = `${USER_ROOT}/gamma/SKILL.md`
const D = `${USER_ROOT}/delta/SKILL.md`
const P = 'C:/p/.dsh/skills/proj/SKILL.md'
const E = 'C:/p/.dsh/skills/delta/SKILL.md'
const C = 'C:/a/skills/chatcut-x/SKILL.md'

function skill(file, source, name, description, modelOff, manualOff, problems, chatcut) {
  return {
    file, root: source === 'user' ? USER_ROOT : 'C:/p/.dsh/skills', source, name, description,
    loadable: problems.length === 0, problems, notes: [], edited: false,
    model: { present: modelOff, invalid: false, off: modelOff },
    manual: { present: manualOff, invalid: false, off: manualOff },
    chatcut: chatcut === true,
  }
}

// A (both on), B (model off), G (broken), D (duplicate of E), E (duplicate of D),
// P (both on), C (ChatCut, both on).
const rows = [
  skill(A, 'user', 'alpha', '描述甲', false, false, [], false),
  skill(B, 'user', 'beta', '描述乙', true, false, [], false),
  skill(G, 'user', 'gamma', '描述丙', false, false, ['缺少 frontmatter'], false),
  skill(D, 'user', 'delta', '描述丁', false, false, [], false),
  skill(P, 'project', 'proj', '描述戊', false, false, [], false),
  skill(E, 'project', 'delta', '描述庚', false, false, [], false),
  skill(C, 'project', 'cx', '描述己', false, false, [], true),
]

const inventoryBody = {
  userRoot: USER_ROOT,
  stateFile: 'skills-toggle.json' /* 测试夹具占位，非本机路径 */,
  roots: [
    { root: USER_ROOT, source: 'user', missing: false },
    { root: 'C:/p/.dsh/skills', source: 'project', missing: false },
  ],
  skills: rows,
  rejected: [],
  chatcut: { root: 'C:/a/skills', manifest: 'C:/a/skills/.chatcut-desktop-skills.json', manifestNames: 1, by: 'manifest', files: 1, count: 1 },
  prefs: { titles: {}, groupTitles: {}, order: {}, collapsed: {} },
}

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

function byClass(node, className) {
  return collect(node, (item) => item.props.className === className)
}

function textOf(node) {
  if (typeof node === 'string') return node
  if (node === null || node === undefined || typeof node !== 'object') return ''
  return node.children.map(textOf).join('')
}

function sectionOf(tree, groupId) {
  return collect(tree, (node) => node.props.className === 'dst-group' && node.props['data-group'] === groupId)[0]
}

function cardsOf(section) {
  return byClass(section, 'dst-card')
}

function descriptionsOf(section) {
  return cardsOf(section).map((card) => textOf(byClass(card, 'dst-desc')[0]))
}

function fakeUl(count) {
  return {
    querySelectorAll: () => Array.from({ length: count }, (unused, index) => ({
      getBoundingClientRect: () => ({ top: index * 40, bottom: index * 40 + 40, height: 40 }),
    })),
  }
}

// The stand-in element for the row a drag picks up, plus the list it lives in. The
// scrolling area is deliberately NOT the offsetParent, because that is how the real
// page is built — and it is why taking positions from offsetParent + offsetTop never
// noticed a scroll. `listScroll` moves the viewport rects exactly like scrolling
// does, while `offsetTop` stays put.
let listScroll = 0
const fakeOffsetParent = { getBoundingClientRect: () => ({ top: 0, bottom: 400, height: 400 }) }
const makeUserRow = (index) => ({
  style: {},
  offsetParent: fakeOffsetParent,
  offsetTop: index * 40,
  offsetHeight: 40,
  getBoundingClientRect: () => {
    const top = 100 + index * 40 - listScroll
    return { top, bottom: top + 40, height: 40 }
  },
})
const fakeRow = makeUserRow(0)
// A four-row user group: the picked-up row first, then three it never drags. Their
// tops are 100/140/180/220 with 40px rows, so the midpoints that matter are
// 160, 200 and 240 — a pointer at 170 belongs in the middle, one at 300 at the end.
const fakeUserList = {
  getBoundingClientRect: () => ({ top: -listScroll, bottom: 400 - listScroll, height: 400 }),
  querySelectorAll: () => [fakeRow, makeUserRow(1), makeUserRow(2), makeUserRow(3)],
}

const fakeGroups = {
  querySelectorAll: () => [
    { getBoundingClientRect: () => ({ top: 0, bottom: 100, height: 100 }) },
    { getBoundingClientRect: () => ({ top: 100, bottom: 200, height: 100 }) },
    { getBoundingClientRect: () => ({ top: 200, bottom: 300, height: 100 }) },
  ],
}

function render(overrides = {}) {
  hookIndex = 0
  useRefIndex = 0
  seed = new Map([
    [0, overrides.inventory ?? inventoryBody],
    [1, overrides.loading ?? false],
    [2, overrides.notice],
    [3, overrides.query ?? ''],
    [4, overrides.rowState ?? {}],
    [5, overrides.synced ?? true],
    [6, overrides.prefs ?? { titles: {}, groupTitles: {}, order: {}, collapsed: {} }],
    [7, overrides.bulkBusy],
    [8, overrides.drag ?? null],
    [9, overrides.dropIndex ?? null],
    [10, overrides.preview ?? null],
  ])
  refSeed = new Map([
    [1, { current: [] }],
    [2, { current: overrides.prefsLoaded === true }],
    [5, { current: { user: overrides.userList ?? fakeUl(4), project: fakeUl(3), chatcut: fakeUl(1) } }],
    [6, { current: overrides.groupsRef ?? fakeGroups }],
  ])
  fetchCalls = []
  applyLog = []
  postLog = []
  stateLog = []
  prefsStatus = 200
  windowListeners.clear()
  timers.clear()
  return expand(mainEntry.component({ t: boundT, ctx }))
}

async function settle(rounds = 200) {
  for (let step = 0; step < rounds; step += 1) {
    await new Promise((resolve) => setImmediate(resolve))
    flushTimers()
  }
}

function lastPrefsPost() {
  const posts = postLog.filter((body) => body.action === 'prefs')
  return posts.length === 0 ? undefined : posts[posts.length - 1]
}

function lastNotice() {
  const notices = stateLog.filter((entry) => entry.index === 2).map((entry) => entry.value)
  return notices.length === 0 ? undefined : notices[notices.length - 1]
}

// ---------------------------------------------------------------- asserts

const tree = render()

// 行内简介直接来自技能文件（description），面板偏好不再覆盖它 ——
// 因为改简介现在是写进 SKILL.md，好让 DSH 原生的 `/` 面板也看到。
check('行内简介来自技能文件本身',
  descriptionsOf(sectionOf(tree, 'user'))[0] === inventoryBody.skills[0].description,
  JSON.stringify(descriptionsOf(sectionOf(tree, 'user')).slice(0, 2)))

check('渲染未抛异常且产出了页面节点', tree !== null && tree.props.className === 'dst-page')

// 改简介铅笔的位置：行首只有改名铅笔，改简介那支在「简介那一行」的末尾（与插件页一致）。





const userSection = sectionOf(tree, 'user')
const projectSection = sectionOf(tree, 'project')
const chatcutSection = sectionOf(tree, 'chatcut')
check('三个分组都在（用户 / 项目 / ChatCut）', userSection !== undefined && projectSection !== undefined && chatcutSection !== undefined)

// 没有 ChatCut 技能时不该留一个空分组：面板上曾长期出现「ChatCut 0」这种
// 只剩一行灰字的分组，占版面又没有内容可点。
const noChatcutInventory = {
  ...inventoryBody,
  skills: rows.filter((skill) => skill.chatcut !== true),
  chatcut: { ...inventoryBody.chatcut, manifestNames: 0, files: 0, count: 0 },
}
const noChatcutTree = render({ inventory: noChatcutInventory })
check('没有 ChatCut 技能时不画 ChatCut 分组',
  sectionOf(noChatcutTree, 'chatcut') === undefined,
  `chatcut section=${sectionOf(noChatcutTree, 'chatcut') === undefined ? 'absent' : 'present'}`)

// 1. group heads: grip + title + count + pencil, knob + collapse button
const groupActions = byClass(tree, 'dst-groupActions')
check('三个分组头各有一颗旋钮与一个折叠按钮',
  groupActions.length === 3
  && groupActions.every((box) => collect(box, (node) => node.props.role === 'switch').length === 1)
  && groupActions.every((box) => byClass(box, 'dst-collapseBtn').length === 1),
  `actions=${groupActions.length}`)
const collapseTexts = byClass(tree, 'dst-collapseBtn').map(textOf)
check('折叠按钮用的是同一个「chevron＋文字」样式，三个分组统一',
  collapseTexts.length === 3 && collapseTexts.every((value) => value.includes('折叠')), JSON.stringify(collapseTexts))
const titleRows = byClass(tree, 'dst-groupHead dst-groupTitleRow')


// 2. rows: grip before pencil, at the front of the row
const userCards = cardsOf(userSection)
check('用户组渲染出 4 张卡片', userCards.length === 4, `cards=${userCards.length}`)

check('未改名的条目不画主标题（没有 dst-sub，名字仍在原位置）',
  byClass(tree, 'dst-sub').length === 0
  && userCards.every((card) => byClass(card, 'dst-name').length === 1),
  JSON.stringify(byClass(tree, 'dst-sub').length))

// 3. rename: custom title on top, original name stays in the subtitle
const renamed = render({ prefs: { titles: { [A]: '自定义甲' }, groupTitles: { user: '我的组' }, order: {}, collapsed: {} } })
const renamedCards = cardsOf(sectionOf(renamed, 'user'))
check('改名后主标题出现，且原名仍留在副标题',
  textOf(byClass(renamedCards[0], 'dst-name')[0]) === '自定义甲'
  && textOf(byClass(renamedCards[0], 'dst-sub')[0]) === 'alpha',
  JSON.stringify(renamedCards.map((card) => textOf(byClass(card, 'dst-name')[0]))))
check('其它条目仍然只有一行原名', renamedCards.slice(1).every((card) => byClass(card, 'dst-sub').length === 0))
check('分组头改名后直接替换原组名', textOf(byClass(renamed, 'dst-groupTitle')[0]) === '我的组')

// 4. in-group order, and a never-seen skill lands at the end of its group
const ordered = render({ prefs: { titles: {}, groupTitles: {}, order: { user: [B, A] }, collapsed: {} } })
check('组内排序生效，没见过的新技能追加到组尾',
  JSON.stringify(descriptionsOf(sectionOf(ordered, 'user'))) === JSON.stringify(['描述乙', '描述甲', '描述丙', '描述丁']),
  JSON.stringify(descriptionsOf(sectionOf(ordered, 'user'))))
const groupOrdered = render({ prefs: { titles: {}, groupTitles: {}, order: { __groups__: ['chatcut', 'project'] }, collapsed: {} } })
check('分组排序生效，没见过的分组排在后面',
  collect(groupOrdered, (node) => node.props.className === 'dst-group').map((node) => node.props['data-group']).join(',') === 'chatcut,project,user')

// 5. collapse hides the rows of exactly that group
const collapsed = render({ prefs: { titles: {}, groupTitles: {}, order: {}, collapsed: { user: true } } })
check('折叠后不渲染该组条目，其它组照常',
  byClass(sectionOf(collapsed, 'user'), 'dst-cards').length === 0
  && cardsOf(sectionOf(collapsed, 'user')).length === 0
  && cardsOf(sectionOf(collapsed, 'chatcut')).length === 1)
check('折叠后按钮文字变成「展开」',
  textOf(byClass(sectionOf(collapsed, 'user'), 'dst-collapseBtn')[0]).includes('展开')
  && textOf(byClass(sectionOf(collapsed, 'project'), 'dst-collapseBtn')[0]).includes('折叠'))

// 6. the three old bulk buttons are gone
const buttons = collect(tree, (node) => node.type === 'button')
const forbidden = ['全部开启', '全部关闭', '启用全部', '停用全部', '一键全开', '一键全关']
check('页级两个批量按钮与 ChatCut 的批量按钮都已消失',
  buttons.every((button) => !forbidden.some((word) => textOf(button).includes(word))),
  JSON.stringify(buttons.map(textOf).filter((value) => value !== '')))
check('那一批文案也一并从词条里删掉了',
  zh.enableAll === undefined && zh.disableAll === undefined && zh.chatcutEnableAll === undefined && zh.chatcutDisableAll === undefined)
check('工具栏仍有刷新与恢复默认',
  byClass(tree, 'dst-iconButton').length === 1 && textOf(byClass(tree, 'dst-resetBtn')[0]) === '恢复默认')

// 7. reset button: confirm, then an all-empty payload
const resetTree = render()
byClass(resetTree, 'dst-resetBtn')[0].props.onClick()
await settle(2)
check('「恢复默认」POST 一份全空的显示偏好（含清掉旋钮锁存）',
  JSON.stringify(lastPrefsPost().prefs) === JSON.stringify({ titles: {}, descs: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} }),
  JSON.stringify(lastPrefsPost()))
globalThis.confirm = () => false
const refusedTree = render()
byClass(refusedTree, 'dst-resetBtn')[0].props.onClick()
await settle(2)
check('confirm 取消时不发保存请求', lastPrefsPost() === undefined)
globalThis.confirm = () => true

// 9. collapse payload
const collapseTree = render()
byClass(sectionOf(collapseTree, 'project'), 'dst-collapseBtn')[0].props.onClick()
await settle(2)
check('点折叠会记住状态（只动那一个分组）',
  JSON.stringify(lastPrefsPost().prefs.collapsed) === JSON.stringify({ project: true }), JSON.stringify(lastPrefsPost().prefs.collapsed))
const expandTree = render({ prefs: { titles: {}, groupTitles: {}, order: {}, collapsed: { project: true } } })
byClass(sectionOf(expandTree, 'project'), 'dst-collapseBtn')[0].props.onClick()
await settle(2)
check('再点一次会展开并删掉那个键', JSON.stringify(lastPrefsPost().prefs.collapsed) === JSON.stringify({}), JSON.stringify(lastPrefsPost().prefs.collapsed))

// 10. touch drag: 300ms hold, live preview, release, payload
const dragTree = render({ userList: fakeUserList })
const dragGrip = byClass(cardsOf(sectionOf(dragTree, 'user'))[0], 'dst-grip')[0]
// Register the stand-in element for the picked-up row: the follow offset and the
// drop target both need it (the target excludes the dragged row).
cardsOf(sectionOf(dragTree, 'user'))[0].props.ref(fakeRow)
const fakePointer = {
  button: 0,
  pointerId: 7,
  pointerType: 'touch',
  clientX: 10,
  clientY: 5,
  preventDefault() {},
  currentTarget: { setPointerCapture() {} },
}
dragGrip.props.onPointerDown(fakePointer)
check('触屏按下手柄还没进入拖动（要等 300ms）', timers.size === 1, `timers=${timers.size}`)
flushTimers()
check('进入拖动后给出明确视觉反馈（光标抓起 + 禁止选中）', bodyStyle.cursor === 'grabbing' && bodyStyle.userSelect === 'none', JSON.stringify(bodyStyle))
// A wheel scroll moves the list under a pointer that is not moving, so the drag has
// to hear about it or the row goes stale and appears to snap back.
check('拖动中监听滚动（滚轮翻页时行不会走丢）', windowListeners.has('scroll'), Array.from(windowListeners.keys()).join(','))
const move = windowListeners.get('pointermove')
check('window 上挂了移动监听（指针离开手柄也收得到）', typeof move === 'function')
check('window 上挂了释放与取消监听', typeof windowListeners.get('pointerup') === 'function' && typeof windowListeners.get('pointercancel') === 'function')
// 300 is below every untouched row's midpoint (160/200/240), so the row goes last.
move({ pointerId: 7, clientX: 10, clientY: 300, preventDefault() {} })
const livePreview = stateLog
  .filter((entry) => entry.index === 10 && entry.value !== null && typeof entry.value === 'object' && Array.isArray(entry.value.ids))
  .map((entry) => entry.value.ids)
  .pop()
check('拖动过程中列表实时跟手（预览顺序当场更新）',
  JSON.stringify(livePreview) === JSON.stringify([B, G, D, A]),
  JSON.stringify(livePreview))
// The follow offset is written straight onto the element (no React render per
// pointer move), so the check reads the element's own style.
check('被拖的行跟着指针走（位移直接写在元素上）',
  /translateY\(-?\d/.test(String(fakeRow.style.transform)) && !/translateY\(0(px)?\)/.test(String(fakeRow.style.transform)),
  JSON.stringify(fakeRow.style))
const release = windowListeners.get('pointerup')
release({ pointerId: 7, type: 'pointerup' })
// The drop starts synchronously; the assertion has to read the element before the
// pending 340ms cleanup timer is flushed below.
check('松手后走「缓缓落位」动画（ease-out 归零）',
  String(fakeRow.style.transition).includes('ease-out') && String(fakeRow.style.transform).includes('translateY(0px)'),
  JSON.stringify(fakeRow.style))
await settle(2)
check('松手后清掉拖动态样式与 window 监听', bodyStyle.cursor === undefined && bodyStyle.userSelect === undefined && windowListeners.size === 0, JSON.stringify(bodyStyle))
check('拖动后保存了新顺序（alpha 落到组尾）',
  JSON.stringify(lastPrefsPost().prefs.order.user) === JSON.stringify([B, G, D, A]),
  JSON.stringify(lastPrefsPost().prefs.order))
// Drawn in its picked-up state while a drag is in flight. This renders again, so it
// runs after every assertion that reads the log of the drag above.
const liftedTree = render({ drag: { kind: 'row', group: 'user', id: A } })
const liftedCards = byClass(liftedTree, 'dst-card').filter((node) => node.props['data-lifted'] === '')
check('被拖的行进入「浮起」状态', liftedCards.length === 1, JSON.stringify(liftedCards.length))

// a mouse drag arms at once: pressing the grip and dragging straight away is
// exactly what a mouse user does, and the grip is an explicit affordance.
timers.clear()
postLog.length = 0
const mouseTree = render()
const mouseGrip = byClass(cardsOf(sectionOf(mouseTree, 'user'))[0], 'dst-grip')[0]
const mousePointer = { ...fakePointer, pointerId: 9, pointerType: 'mouse' }
mouseGrip.props.onPointerDown(mousePointer)
check('鼠标按下手柄即刻进入拖动（不再要求长按）', timers.size === 0 && bodyStyle.cursor === 'grabbing' && windowListeners.has('pointermove'), `timers=${timers.size}`)
windowListeners.get('pointermove')({ pointerId: 9, clientX: 10, clientY: 300, preventDefault() {} })
windowListeners.get('pointerup')({ pointerId: 9, type: 'pointerup' })
await settle(2)
check('鼠标一路按下就拖也能换位并保存',
  JSON.stringify(lastPrefsPost().prefs.order.user) === JSON.stringify([B, G, D, A]),
  JSON.stringify(lastPrefsPost().prefs.order))

// The drop target comes from the rows that are NOT dragged: the picked-up row
// follows the pointer, so asking "what is under the pointer" always answered "the
// dragged row itself" and it could not be moved past itself at all. Midpoints of
// the untouched rows are 160/200/240, so a pointer at 170 belongs in the middle.
timers.clear()
postLog.length = 0
const midTree = render({ userList: fakeUserList })
cardsOf(sectionOf(midTree, 'user'))[0].props.ref(fakeRow)
byClass(cardsOf(sectionOf(midTree, 'user'))[0], 'dst-grip')[0].props.onPointerDown(mousePointer)
windowListeners.get('pointermove')({ pointerId: 9, clientX: 10, clientY: 170, preventDefault() {} })
windowListeners.get('pointerup')({ pointerId: 9, type: 'pointerup' })
await settle(2)
check('落点只看没被拖的行（指针在中段就落到中间）',
  JSON.stringify(lastPrefsPost().prefs.order.user) === JSON.stringify([B, A, G, D]),
  JSON.stringify(lastPrefsPost().prefs.order))

// Wheel scrolling during a drag. The row follows the list (that part worked), but the
// drop target has to move with it as well: the untouched rows start at 140/180/220,
// so a pointer parked at 110 is above every midpoint (160/200/240) and lands first.
// After the list scrolls by 60 those rows sit at 80/120/160, their midpoints become
// 100/140/180, and the very same pointer now belongs in the middle slot.
timers.clear()
postLog.length = 0
listScroll = 0
const scrollTree = render({ userList: fakeUserList })
cardsOf(sectionOf(scrollTree, 'user'))[0].props.ref(fakeRow)
byClass(cardsOf(sectionOf(scrollTree, 'user'))[0], 'dst-grip')[0].props.onPointerDown(mousePointer)
windowListeners.get('pointermove')({ pointerId: 9, clientX: 10, clientY: 110, preventDefault() {} })
listScroll = 60
check('拖动中出现了滚动监听（滚轮翻页能被听见）', typeof windowListeners.get('scroll') === 'function')
windowListeners.get('scroll')()
windowListeners.get('pointerup')({ pointerId: 9, type: 'pointerup' })
await settle(2)
check('滚轮翻页后落点跟着列表走（判定不再停在原地）',
  postLog.some((body) => body.action === 'prefs')
    && JSON.stringify(lastPrefsPost().prefs.order.user) === JSON.stringify([B, A, G, D]),
  JSON.stringify(lastPrefsPost() === undefined ? '没有发出保存请求（说明落点根本没变）' : lastPrefsPost().prefs.order))
listScroll = 0

// the "you are holding it" marker: an armed drag must be unmistakable
const chipTree = render({ drag: { kind: 'row', group: 'user', id: A }, dropIndex: 1 })
const chips = byClass(chipTree, 'dst-dragChip')
check('拖动中会显示「拖动中…」标签', chips.length === 1 && textOf(chips[0]) === '拖动中…', JSON.stringify(chips.map((chip) => textOf(chip))))

// the drop target: the row whose place the dragged one would take
const markerTree = render({ drag: { kind: 'row', group: 'user', id: A }, dropIndex: 1 })
const markerCards = cardsOf(sectionOf(markerTree, 'user'))
check('拖动中被拖的行有标记，落点行标出「顶掉它」',
  markerCards[0].props['data-dragging'] === '' && markerCards[1].props['data-drop'] === 'into',
  JSON.stringify(markerCards.map((card) => card.props['data-drop'])))
const groupMarkerTree = render({ drag: { kind: 'group', id: 'user' }, dropIndex: 2 })
check('拖动分组头时整个分组带标记，落点分组也标出来',
  sectionOf(groupMarkerTree, 'user').props['data-dragging'] === ''
  && sectionOf(groupMarkerTree, 'chatcut').props['data-drop'] === 'into')

// a drag that would not move anything saves nothing
const noopTree = render()
const noopGrip = byClass(cardsOf(sectionOf(noopTree, 'user'))[0], 'dst-grip')[0]
noopGrip.props.onPointerDown(fakePointer)
flushTimers()
windowListeners.get('pointermove')({ pointerId: 7, clientX: 10, clientY: 5, preventDefault() {} })
windowListeners.get('pointerup')({ pointerId: 7, type: 'pointerup' })
await settle(2)
check('落在原位时视为不动，不发保存请求', lastPrefsPost() === undefined)

// releasing before the hold fires is not a drag
const earlyTree = render()
byClass(cardsOf(sectionOf(earlyTree, 'user'))[0], 'dst-grip')[0].props.onPointerDown(fakePointer)
windowListeners.get('pointerup')({ pointerId: 7, type: 'pointerup' })
flushTimers()
await settle(2)
check('提前松手取消长按（定时器已清、没有保存）', timers.size === 0 && lastPrefsPost() === undefined)

// moving more than 10px before the hold fires cancels
const cancelTree = render()
byClass(cardsOf(sectionOf(cancelTree, 'user'))[0], 'dst-grip')[0].props.onPointerDown(fakePointer)
windowListeners.get('pointermove')({ pointerId: 7, clientX: 80, clientY: 90, preventDefault() {} })
flushTimers()
await settle(2)
check('提前移动会取消长按（不进入拖动、不发保存）', windowListeners.size === 0 && timers.size === 0 && lastPrefsPost() === undefined)

// 11. dragging a group head moves the whole section
const groupDragTree = render()
const groupGrip = byClass(sectionOf(groupDragTree, 'user'), 'dst-grip')[0]
groupGrip.props.onPointerDown(fakePointer)
flushTimers()
windowListeners.get('pointermove')({ pointerId: 7, clientX: 10, clientY: 400, preventDefault() {} })
windowListeners.get('pointerup')({ pointerId: 7, type: 'pointerup' })
await settle(2)
check('拖动分组头保存整个分组的顺序',
  JSON.stringify(lastPrefsPost().prefs.order.__groups__) === JSON.stringify(['project', 'chatcut', 'user']),
  JSON.stringify(lastPrefsPost().prefs.order))

// 12. group knob: only the rows that need it, counts the skipped ones
const knobTree = render()
const userKnob = collect(byClass(sectionOf(knobTree, 'user'), 'dst-groupActions')[0], (node) => node.props.role === 'switch')[0]
check('有任一关闭时旋钮是灭的', userKnob.props['aria-checked'] === false)
userKnob.props.onClick()
await settle()
check('旋钮只切需要切的行（已开的、坏掉的、重名的都不动）',
  applyLog.length === 1
  && JSON.stringify(applyLog[0]) === JSON.stringify([{ file: B, key: 'model', enabled: true }]),
  JSON.stringify(applyLog))
check('批量结果报数（含跳过）',
  lastNotice() !== undefined && lastNotice().kind === 'ok'
  && lastNotice().text.includes('已切换 1 个') && lastNotice().text.includes('跳过 2 个'),
  JSON.stringify(lastNotice()))

const bulkTree = render()
const chatcutKnob = collect(byClass(sectionOf(bulkTree, 'chatcut'), 'dst-groupActions')[0], (node) => node.props.role === 'switch')[0]
check('全组都开时旋钮是亮的', chatcutKnob.props['aria-checked'] === true)
chatcutKnob.props.onClick()
await settle()
check('全开时点一下把两个开关一起关掉',
  applyLog.length === 1
  && JSON.stringify(applyLog[0]) === JSON.stringify([{ file: C, key: 'model', enabled: false }, { file: C, key: 'manual', enabled: false }]),
  JSON.stringify(applyLog))
check('没有跳过时只报「已切换」', lastNotice() !== undefined && lastNotice().text.includes('已切换 1 个') && !lastNotice().text.includes('跳过'), JSON.stringify(lastNotice()))
check('批量执行期间旋钮禁用', collect(byClass(sectionOf(render({ bulkBusy: { group: 'user', done: 0, total: 1, enabled: true } }), 'user'), 'dst-groupActions')[0], (node) => node.props.role === 'switch')[0].props.disabled === true)
check('ok 类型的提示用绿色样式渲染', byClass(render({ notice: { kind: 'ok', text: '已切换 1 个' } }), 'dst-ok').length === 1)

// 12b. the knob is a latch. A row that is addressable but refuses to be written must
// not pull the knob back: with a plain "is everything on?" rule the knob returned to
// the off position after a partial 全开 and there was no longer a one-click way to
// turn the section back off.
applyFailures.add(B)
timers.clear()
postLog.length = 0
applyLog.length = 0
const latchTree = render()
const latchKnob = collect(byClass(sectionOf(latchTree, 'user'), 'dst-groupActions')[0], (node) => node.props.role === 'switch')[0]
check('没点过旋钮时按真实状态显示（未全开 → 灭）', latchKnob.props['aria-checked'] === false, String(latchKnob.props['aria-checked']))
latchKnob.props.onClick()
await settle(8)
const latchSaved = postLog.filter((body) => body.action === 'prefs' && body.prefs.bulk !== undefined && body.prefs.bulk.user === true).pop()
check('一键全开时把方向记进偏好（即使中间有行写不进去）',
  latchSaved !== undefined && lastNotice() !== undefined && lastNotice().text.includes('跳过'),
  JSON.stringify(postLog.filter((body) => body.action === 'prefs')))
const latchReload = render({ prefs: latchSaved === undefined ? undefined : latchSaved.prefs })
const reloadKnob = collect(byClass(sectionOf(latchReload, 'user'), 'dst-groupActions')[0], (node) => node.props.role === 'switch')[0]
check('有行打不开时旋钮不归位（刷新也保持亮着）', reloadKnob.props['aria-checked'] === true, String(reloadKnob.props['aria-checked']))
applyLog.length = 0
reloadKnob.props.onClick()
await settle(8)
check('接着一次点击就是「一键全关」',
  applyLog.length > 0 && applyLog.every((call) => call.every((change) => change.enabled === false)),
  JSON.stringify(applyLog))
applyFailures.delete(B)

// 13. search hits both the custom title and the original name
const searchOriginal = render({ query: 'alpha' })
check('搜索命中原名',
  cardsOf(sectionOf(searchOriginal, 'user')).length === 1
  && descriptionsOf(sectionOf(searchOriginal, 'user'))[0] === '描述甲',
  JSON.stringify(descriptionsOf(sectionOf(searchOriginal, 'user'))))
const searchCustom = render({ query: '自定义甲', prefs: { titles: { [A]: '自定义甲' }, groupTitles: {}, order: {}, collapsed: {} } })
check('搜索命中自定义名（此时原名仍在副标题上）',
  cardsOf(sectionOf(searchCustom, 'user')).length === 1
  && textOf(byClass(cardsOf(sectionOf(searchCustom, 'user'))[0], 'dst-name')[0]) === '自定义甲'
  && textOf(byClass(cardsOf(sectionOf(searchCustom, 'user'))[0], 'dst-sub')[0]) === 'alpha',
  JSON.stringify(descriptionsOf(sectionOf(searchCustom, 'user'))))
check('搜索命中不到时该组为空',
  cardsOf(sectionOf(render({ query: '不存在的名字' }), 'user')).length === 0)
check('搜索命中不到时给出的是「没匹配」而不是「这组没技能」',
  byClass(sectionOf(render({ query: '不存在的名字' }), 'user'), 'dst-empty')[0].children[0].includes('没有匹配的技能'),
  JSON.stringify(byClass(sectionOf(render({ query: '不存在的名字' }), 'user'), 'dst-empty').map((node) => node.children[0])))

// 14. preferences are read from the host exactly once
const firstLoad = render({ prefsLoaded: false })
inventoryBody.prefs = { titles: { [A]: '  宿主里的名字  ' }, groupTitles: { user: ' ' }, order: { user: [B, A] }, collapsed: { user: true }, junk: 1 }
byClass(firstLoad, 'dst-iconButton')[0].props.onClick()
await settle()
const prefsWrites = stateLog.filter((entry) => entry.index === 6).map((entry) => entry.value)
check('首次加载从宿主读一次偏好并清洗',
  prefsWrites.length === 1
  && prefsWrites[0].titles[A] === '宿主里的名字'
  && prefsWrites[0].groupTitles.user === undefined
  && prefsWrites[0].collapsed.user === true
  && prefsWrites[0].junk === undefined
  && prefsWrites[0].order.user.length === 2,
  JSON.stringify(prefsWrites))
const secondLoad = render({ prefsLoaded: true })
byClass(secondLoad, 'dst-iconButton')[0].props.onClick()
await settle()
check('之后的刷新不再回读宿主偏好（本地为准）',
  stateLog.filter((entry) => entry.index === 6).length === 0)
inventoryBody.prefs = { titles: {}, groupTitles: {}, order: {}, collapsed: {} }

// 15. saving against an old host half says "restart DSH"
for (const status of [404, 405]) {
  const oldHost = render()
  prefsStatus = status
  byClass(sectionOf(oldHost, 'user'), 'dst-collapseBtn')[0].props.onClick()
  await settle(2)
  check(`保存遇到 HTTP ${status} 时提示「宿主半边还是旧版本」`,
    lastNotice() !== undefined && lastNotice().kind === 'error' && lastNotice().text.includes('宿主半边还是旧版本'),
    JSON.stringify(lastNotice()))
}

// 2026-10-17: the client filters catalog-derived roots before asking the host.
// That filter must accept the bundled `office-skills` directory, otherwise the
// official Office skills never reach the panel and cannot be switched off.
{
  const source = await readFile(CLIENT, 'utf8')
  const line = source.split('\n').find((text) => text.includes('const MANAGED_ROOT_PATTERN =')) ?? ''
  check('客户端目录白名单包含 office-skills、不再接受 .agents',
    line.includes('office-skills') && !line.includes('agents'),
    line.trim())

  // 2026-10-17: the five skills the app package registers from inside app.asar
  // are always hidden from `/`; the seven office copies follow the panel's 手动
  // switch (the plugin-registered copy ignores that switch). Both groups must be
  // declared and the hider wired into apply() + the inventory refresh.
  const alwaysHidden = ['cordis-plugin-development', 'cordis-composition-reference', 'editing-cordis-compositions', 'agent-experience', 'diagnose-windows-sandbox-acl']
  const officeHidden = ['office', 'office-docx', 'office-pptx', 'office-xlsx', 'office-render', 'office-recalculate', 'office-export-pdf']
  const alwaysBlock = source.slice(source.indexOf('const MENU_ALWAYS_HIDDEN_SKILLS'), source.indexOf('const MENU_OFFICE_SKILLS'))
  const officeBlock = source.slice(source.indexOf('const MENU_OFFICE_SKILLS'), source.indexOf('const MENU_HIDDEN_ATTR'))
  check('/ 菜单：5 个关不掉的技能永久隐藏',
    alwaysBlock.length > 0 && alwaysHidden.every((name) => alwaysBlock.includes(name)),
    String(alwaysBlock.length))
  check('/ 菜单：office 7 个跟随「手动」开关（由 syncMenuHider 决定）',
    officeBlock.length > 0 && officeHidden.every((name) => officeBlock.includes(name))
      && source.includes('function syncMenuHider(') && (source.match(/syncMenuHider\(/g) ?? []).length >= 3,
    String(officeBlock.length))
  check('/ 菜单：隐藏器接入 apply 且在清单刷新时同步',
    source.includes('installSkillMenuHider()') && source.includes('skill-menu-hider'),
    'missing wiring')

  // 2026-10-25: 侧栏「自动化任务」入口的隐藏已移交其他插件 —— 本插件
  // 只保留 / 菜单里的技能行隐藏，不再越界改侧栏。这里守住「不回头」。
  check('侧栏入口隐藏已移交（本插件不再处理）',
    !source.includes('SIDEBAR_HIDDEN_LABELS')
      && !source.includes('hideSidebarEntries')
      && !source.includes('data-dsh-hidden-sidebar'),
    '仍残留侧栏隐藏代码')
}


const hiddenPathInventory = {
  ...inventoryBody,
  roots: [...inventoryBody.roots, {root:'C:/Runtime/office-skills',source:'project',missing:false}],
}
const hiddenPathTree = render({inventory:hiddenPathInventory})
check('页面不再显示技能目录和状态文件路径', !textOf(hiddenPathTree).includes('C:/Runtime/office-skills') && !textOf(hiddenPathTree).includes('skills-toggle.json') && !textOf(hiddenPathTree).includes('C:/p/.dsh/skills'))
check('ChatCut 清单路径说明仍保留', textOf(hiddenPathTree).includes(inventoryBody.chatcut.manifest))
const unavailableRootTree = render({inventory:{...hiddenPathInventory,roots:[{root:'C:/Runtime/office-skills',source:'project',missing:true},{root:'C:/private/skill-root',source:'project',missing:false,error:'read failed: C:/private/skill-root'}]}})
check('异常目录仍提示，但不带目录路径', textOf(unavailableRootTree).includes('目录不存在') && !textOf(unavailableRootTree).includes('C:/Runtime/office-skills') && !textOf(unavailableRootTree).includes('C:/private/skill-root'))

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
