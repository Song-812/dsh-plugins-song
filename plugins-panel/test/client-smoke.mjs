/**
 * dsh-plugins-panel 客户端半的离线冒烟测试（插件形状）。
 *
 * 它按浏览器模块加载器的方式加载 lib/client.js（假的 __ModuleLoader__），然后用
 * 一个极小的渲染桩**真的执行**组件树，所以断言跑在真实代码路径上，而不是重写一遍
 * 逻辑。React 的 hook 用「按下标 seed」的方式喂初值：组件里 useState / useRef 的
 * 出现顺序必须与下面的 HOOKS 表一致 —— 脚本会先核对数量，顺序变了会直接报错。
 *
 * 运行：node test\client-smoke.mjs   （在插件目录下）
 */
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const CLIENT = new URL('../lib/client.js', import.meta.url)

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log(`PASS  ${name}`)
  else { failures += 1; console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

// ---------------------------------------------------------------- 组件里的 hook 顺序
// useState: 0 servers · 1 summary · 2 synced · 3 loading · 4 notice · 5 query ·
//           6 rowState · 7 prefs · 8 bulkBusy · 9 dragId · 10 dropIndex · 11 preview
const HOOK_STATE = {
  servers: 0, summary: 1, synced: 2, loading: 3, notice: 4, query: 5, rowState: 6,
  prefs: 7, bulkBusy: 8, dragId: 9, dropIndex: 10, preview: 11,
}
// useRef: 0 alive · 1 prefsLoaded · 2 selfMadeRef · 3 dropIndexRef · 4 holdRef ·
//         5 listRefs · 6 previewRef · 7 rowRefs · 8 dyRef · 9 flipRef · 10 glideRef ·
//         11 settleTimer · 12 refreshSeq · 13 saveChain  (+ GroupGrip lifecycle)
const HOOK_REF = { alive: 0, prefsLoaded: 1, selfMadeRef: 2, listRefs: 5 }

// ---------------------------------------------------------------- 桩

let capturedDefinition = null
const windowListeners = new Map()
const timers = []
const bodyStyle = {
  removeProperty(name) {
    const camel = name.replace(/-([a-z])/g, (m, letter) => letter.toUpperCase())
    delete this[name]
    delete this[camel]
  },
}

const makeElement = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) })

/** 一行卡片元素的替身：位置由 getBoundingClientRect 给，跟着 listScroll 走。 */
let listScroll = 0
const makeCard = (index) => ({
  style: {},
  offsetHeight: 40,
  getBoundingClientRect: () => {
    const top = 100 + index * 40 - listScroll
    return { top, bottom: top + 40, height: 40 }
  },
})
const draggedCard = makeCard(0)
/** 被拖那一组的容器：里面是「没被拖的那几行」。 */
const makeList = (count) => ({
  getBoundingClientRect: () => ({ top: -listScroll, bottom: 400 - listScroll, height: 400 }),
  querySelectorAll: () => Array.from({ length: count }, (_, index) => (index === 0 ? draggedCard : makeCard(index))),
})

let hookIndex = 0
let useStateSeed = new Map()
let useRefSeed = new Map()
let useRefIndex = 0
let stateLog = []
/** 本次渲染挂上去的 effect；mount() 会真的执行它们（refresh 就在第一个里）。 */
let effectLog = []

const reactStub = {
  createElement: makeElement,
  useState: (init) => {
    const index = hookIndex
    hookIndex += 1
    const value = useStateSeed.has(index) ? useStateSeed.get(index) : (typeof init === 'function' ? init() : init)
    return [value, (next) => {
      stateLog.push({ index, value: typeof next === 'function' ? next(value) : next })
    }]
  },
  // effect 由测试决定跑不跑：render() 只收集，mount() 会真的执行一遍。
  useEffect: (fn) => { effectLog.push(fn) },
  useCallback: (fn) => fn,
  useLayoutEffect: () => {},
  useRef: (init) => {
    const index = useRefIndex
    useRefIndex += 1
    return useRefSeed.has(index) ? useRefSeed.get(index) : { current: init }
  },
}

let fetchCalls = []
const remoteCalls = []
let remoteAnswer = { ok: true, value: [] }
remoteAnswer = { ok: true, value: [] }

async function fetchStub(url, options) {
  fetchCalls.push({ url, options })
  // 按 method 区分，不能看「有没有 options」——真实 GET 也带着 { cache: "no-store" }。
  if ((options?.method ?? 'GET') === 'GET') {
    return { ok: true, status: 200, json: async () => ({ ok: true, prefs: {}, selfMade: ['dsh-zh-intro'] }) }
  }
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}

Object.assign(globalThis, {
  window: {
    __ModuleLoader__: { load: (definition) => { capturedDefinition = definition } },
    addEventListener: (type, handler) => { windowListeners.set(type, handler) },
    removeEventListener: (type) => { windowListeners.delete(type) },
    requestAnimationFrame: (fn) => { timers.push(fn); return timers.length },
    cancelAnimationFrame: (id) => { timers[id - 1] = undefined },
  },
  document: {
    body: { style: bodyStyle },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, style: {}, textContent: '' }),
    head: { appendChild() {} },
  },
  fetch: fetchStub,
  confirm: () => true,
  setTimeout: (fn) => { timers.push(fn); return timers.length },
  clearTimeout: (id) => { timers[id - 1] = undefined },
})

function flushTimers() {
  while (timers.length > 0) {
    const fn = timers.shift()
    if (typeof fn === 'function') fn()
  }
}

// ---------------------------------------------------------------- 加载

const src = await readFile(CLIENT, 'utf8')
vm.runInThisContext(src, { filename: CLIENT.pathname })
check('client.js 注册了 __ModuleLoader__ 模块', capturedDefinition !== null)
check('模块 id 正确', capturedDefinition.id === 'dsh-plugins-panel', String(capturedDefinition.id))

const stateCount = (src.match(/useState\(/g) ?? []).length
const refCount = (src.match(/useRef\(/g) ?? []).length
check('useState 数量与 seed 表一致（12）', stateCount === 12, String(stateCount))
check('useRef 数量含独立分组手柄（主面板14 + 手柄1）', refCount === 15, String(refCount))

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

/** 测试里可以换掉它，模拟「当前界面语言」。 */
let localeService
const ctx = {
  get: (name) => (name === 'locale' ? localeService : undefined),
  effect: (fn) => fn(),
  locale,
  remote: {
    pluginManager: {
      listPlugins: async () => remoteAnswer,
      setPluginEnabled: async (entryId, enabled) => {
        remoteCalls.push({ entryId, enabled })
        return { ok: true, value: { application: 'applied' } }
      },
    },
  },
  slots: {
    inject: (name, callback) => { callback() },
    register: (spec, component) => { registered.push({ spec, component }); return () => {} },
  },
}

plugin.apply(ctx)
check('注册了侧栏面板与主面板', registered.length === 2, `registered=${registered.length}`)
const sidebarEntry = registered.find((entry) => entry.spec.name === 'sidebar.panellist')
const mainEntry = registered.find((entry) => entry.spec.name === 'main')
check('侧栏入口 id / order 正确', sidebarEntry !== undefined && sidebarEntry.spec.id === 'dsh-plugins-panel' && sidebarEntry.spec.order === 0.1)
check('主面板组件已注册', mainEntry !== undefined)
check('侧栏图标带自己的标记（隐藏官方入口时靠它认人）', (() => {
  const icon = sidebarEntry.component({ size: 20, active: false })
  return icon.props['data-plp-panel'] === '1'
})())

// ---------------------------------------------------------------- 渲染桩

function expand(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  // 组件可以返回数组（React 16+，元素带 key 即可）：桩把它收进一个透明容器，方便遍历。
  if (Array.isArray(node)) return { type: '#array', props: {}, children: node.map(expand).flat() }
  if (typeof node.type === 'function') return expand(node.type({ ...node.props, children: node.children }))
  const children = Array.isArray(node.children) ? node.children : []
  return { type: node.type, props: node.props, children: children.map(expand).flat() }
}

function collect(node, predicate, found = []) {
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  for (const child of node.children) collect(child, predicate, found)
  return found
}

/** 按 class 名匹配（一个元素可能带多个 class）。 */
const byClass = (node, name) => {
  const value = node.props.className
  return typeof value === 'string' && value.split(' ').includes(name)
}

// 插件的行（插件形状：entryId / moduleName / meta.title / patchId / readOnlyReason）
const ROWS = [
  {
    id: 'p-a', entryId: 'entry-a', moduleName: 'dsh-mcp-toggle', path: 'patch-a',
    icon: 'https://example.test/icon.png',
    name: 'MCP 开关', official: 'MCP 开关', description: '侧栏 MCP 页', version: '0.2.0',
    enabled: true, fiberPhase: 'active', group: 'self',
  },
  {
    id: 'p-b', entryId: 'entry-b', moduleName: 'dsh-zh-intro', path: 'patch-b',
    name: '插件中文简介', official: '插件中文简介', description: '官方简介乙', version: '',
    enabled: false, fiberPhase: null, group: 'self',
  },
  {
    id: 'p-c', entryId: 'entry-c', moduleName: '@deepseek-ai/dsh-base', path: undefined,
    name: '基础包', official: '基础包', description: '', version: '1.0.0',
    enabled: true, fiberPhase: 'active', readOnly: 'management-required', group: 'self',
  },
  {
    id: 'p-d', entryId: 'entry-d', moduleName: 'dsh-builtin-only', path: 'patch-d',
    name: '内置的东西', official: '内置的东西', description: '不该出现在页面上', version: '',
    enabled: true, fiberPhase: 'active', group: 'builtin',
  },
]

function render(overrides = {}) {
  hookIndex = 0
  useRefIndex = 0
  stateLog = []
  effectLog = []
  fetchCalls = []
  useStateSeed = new Map([
    [HOOK_STATE.servers, overrides.servers ?? ROWS],
    [HOOK_STATE.summary, { total: 3, off: 1 }],
    [HOOK_STATE.synced, overrides.synced ?? true],
    [HOOK_STATE.loading, overrides.loading ?? false],
    [HOOK_STATE.notice, overrides.notice],
    [HOOK_STATE.query, overrides.query ?? ''],
    [HOOK_STATE.rowState, overrides.rowState ?? {}],
    [HOOK_STATE.prefs, overrides.prefs ?? { titles: {}, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} }],
    [HOOK_STATE.bulkBusy, false],
    [HOOK_STATE.dragId, overrides.dragId ?? null],
    [HOOK_STATE.dropIndex, overrides.dropIndex ?? null],
    [HOOK_STATE.preview, overrides.preview ?? null],
  ])
  useRefSeed = new Map([
    [HOOK_REF.listRefs, { current: overrides.listRefs ?? { builtin: makeList(2), self: makeList(1) } }],
    // 挂载测试里让 refresh 不要冲掉 seed 的 prefs（真实首次加载是会 setPrefs 的）。
    [HOOK_REF.prefsLoaded, { current: overrides.prefsLoaded ?? true }],
  ])
  return expand(mainEntry.component({ t: boundT, ctx }))
}

/** 官方 remote 返回的行（真形状）：refresh 负责把它们合成页面用的行。 */
const OFFICIAL_ROWS = [
  {
    entryId: 'entry-a', moduleName: 'dsh-mcp-toggle', patchId: 'patch-a',
    meta: { title: 'MCP 开关', description: '侧栏 MCP 页' }, enabled: true, fiberPhase: 'active',
  },
  {
    entryId: 'entry-b', moduleName: 'dsh-zh-intro', patchId: 'patch-b',
    // meta.title 也可能是 { zh } 这种记录，兜底要能解出来。
    meta: { title: { en: 'ZH intro (en)', zh: '插件中文简介' }, description: { en: 'EN desc', zh: '中文简介' } }, enabled: false, fiberPhase: null,
  },
  {
    entryId: 'entry-c', moduleName: '@deepseek-ai/dsh-base',
    meta: { title: '基础包' }, enabled: true, fiberPhase: 'active', readOnlyReason: 'management-required',
  },
]

/**
 * 挂载：跑一遍 effect（refresh 真的执行），再放几轮 microtask 让它跑完。
 * 上一版这里是空桩，refresh 从来没被执行过 —— 那正是「state is not defined」漏到运行时的原因。
 */
async function mount(overrides = {}) {
  const tree = render(overrides)
  for (const fn of effectLog) fn()
  for (let step = 0; step < 60; step += 1) await new Promise((resolve) => setImmediate(resolve))
  return tree
}

const cards = (tree) => collect(tree, (node) => byClass(node, 'plp-card'))
/** 某个 class 的元素里那几段文字（跳过图标一类的子节点）。 */
const texts = (tree, name) => collect(tree, (node) => byClass(node, name))
  .map((node) => node.children.filter((child) => typeof child === 'string').join(''))

// ---------------------------------------------------------------- A 渲染与分组

const tree = render()
check('搜索框有 aria-label', collect(tree, (node) => node.props && node.props['aria-label'] === '搜索插件').length >= 1)

check('渲染未抛异常且产出页面节点', tree !== null && tree.props.className === 'plp-page')
check('只渲染自制组，内置组完全不出现', JSON.stringify(texts(tree, 'plp-groupTitle')) === JSON.stringify(['自制插件']), JSON.stringify(texts(tree, 'plp-groupTitle')))
check('自制组 3 行；内置那行（p-d）不渲染', JSON.stringify(texts(tree, 'plp-count')) === JSON.stringify(['共 3 个 · 已关闭 1 个']) && cards(tree).length === 3, JSON.stringify(texts(tree, 'plp-count')))
check('共 3 行', cards(tree).length === 3, `cards=${cards(tree).length}`)
check('未折叠时自制组有一个列表', collect(tree, (node) => byClass(node, 'plp-cards')).length === 1)

check('行里显示官方简介', texts(tree, 'plp-desc').includes('侧栏 MCP 页'), JSON.stringify(texts(tree, 'plp-desc')))
check('没有简介的行显示占位文案', texts(tree, 'plp-desc').includes('（没有简介）'), JSON.stringify(texts(tree, 'plp-desc')))
check('每行仍有包名副标题',
  JSON.stringify(texts(tree, 'plp-sub')) === JSON.stringify(['dsh-mcp-toggle', 'dsh-zh-intro', '@deepseek-ai/dsh-base']),
  JSON.stringify(texts(tree, 'plp-sub')))
check('说明文字与官方那句一致', texts(tree, 'plp-intro')[0] === '安装、启用和配置插件', JSON.stringify(texts(tree, 'plp-intro')))
check('工具区同一行保留官方管理页、恢复默认与刷新',
  JSON.stringify(texts(tree, 'plp-resetBtn')) === JSON.stringify(['官方管理页', '恢复默认'])
  && collect(tree, (node) => byClass(node, 'plp-iconButton')).length === 1
  && collect(tree, (node) => byClass(node, 'plp-subhead')).length === 1,
  JSON.stringify(texts(tree, 'plp-resetBtn')))
check('底部 footer 已经去掉', collect(tree, (node) => byClass(node, 'plp-footer')).length === 0)

// 行的结构要和其他侧栏页同构：cardHead 里依次是 lead（手柄+铅笔）/ cardIcon / main / cardEnd。
const headTree = render()
check('每行一个 cardHead、一个 lead、一个 40px 图标座',
  collect(headTree, (node) => byClass(node, 'plp-cardHead')).length === 3
  && collect(headTree, (node) => byClass(node, 'plp-lead')).length === 3
  && collect(headTree, (node) => byClass(node, 'plp-cardIcon')).length === 3,
  JSON.stringify([collect(headTree, (node) => byClass(node, 'plp-cardHead')).length, collect(headTree, (node) => byClass(node, 'plp-cardIcon')).length]))

check('旧的裸图标座类名已经不用了', collect(headTree, (node) => byClass(node, 'plp-badge')).length === 0)

// 图标走官方的做法：有 meta.icon 就用 <img>，没有就用默认图形兜底。
check('带图标的行渲染成 <img>（官方做法）',
  collect(headTree, (node) => byClass(node, 'plp-cardIconImg')).length === 1,
  JSON.stringify(collect(headTree, (node) => byClass(node, 'plp-cardIconImg')).length))
check('每个图标座里都有图形（没有图标的走兜底）',
  collect(headTree, (node) => byClass(node, 'plp-cardIcon')).every((seat) => seat.children.length > 0))

// ---------------------------------------------------------------- A2 真的读一次清单
// 上一版 refresh 从没被执行过，所以「state is not defined」这类错漏到了运行时。
remoteAnswer = { ok: true, value: OFFICIAL_ROWS }
// 当前界面语言设成中文，验证标题/简介取中文那套（与官方页一致）。
localeService = { getLocale: () => ({ active: 'zh', locales: [], revision: 1 }) }
const mounted = await mount()
const serversSet = stateLog.filter((entry) => entry.index === HOOK_STATE.servers).map((entry) => entry.value).pop()
check('挂载后 refresh 跑通并填上 3 行', Array.isArray(serversSet) && serversSet.length === 3, JSON.stringify(serversSet))
check('界面语言是中文时取中文简介', Array.isArray(serversSet) && serversSet.some((row) => row.description === '中文简介'), JSON.stringify(serversSet?.map((row) => row.description)))
check('refresh 按 patchId 判可切换（基础包被锁住）',
  Array.isArray(serversSet) && serversSet.some((row) => row.moduleName === '@deepseek-ai/dsh-base' && row.readOnly === 'management-required'),
  JSON.stringify(serversSet?.map((row) => [row.moduleName, row.readOnly])))
check('refresh 认得 meta.title（含 { zh } 记录）',
  Array.isArray(serversSet) && serversSet.some((row) => row.name === 'MCP 开关') && serversSet.some((row) => row.name === '插件中文简介'),
  JSON.stringify(serversSet?.map((row) => row.name)))
check('refresh 用宿主报的 selfMade 判「自制」',
  Array.isArray(serversSet) && serversSet.some((row) => row.moduleName === 'dsh-zh-intro' && row.group === 'self'),
  JSON.stringify(serversSet?.map((row) => [row.moduleName, row.group])))
check('refresh 没有报「读取失败」',
  stateLog.filter((entry) => entry.index === HOOK_STATE.notice).every((entry) => entry.value === undefined),
  JSON.stringify(stateLog.filter((entry) => entry.index === HOOK_STATE.notice).map((entry) => entry.value)))
check('读完清单后刷新按钮不再禁用', collect(mounted, (node) => byClass(node, 'plp-iconButton'))[0].props.disabled === false)
remoteAnswer = { ok: true, value: [] }

remoteAnswer = { ok: true, value: [] }

// 显示名与包名完全一样时（自制插件常常如此）不再重复画一行。
const sameNameTree = render({ servers: [{ id: 'p-x', entryId: 'entry-x', moduleName: 'dsh-same', path: 'patch-x', name: 'dsh-same', description: '', version: '', enabled: true, fiberPhase: 'active', group: 'self' }] })
check('显示名与包名相同时不再重复画副标题', texts(sameNameTree, 'plp-sub').length === 0, JSON.stringify(texts(sameNameTree, 'plp-sub')))
const otherNameTree = render({ servers: [{ id: 'p-y', entryId: 'entry-y', moduleName: 'dsh-other', path: 'patch-y', name: '有中文名', description: '', version: '', enabled: true, fiberPhase: 'active', group: 'self' }] })
check('名字不同时副标题照常显示包名', JSON.stringify(texts(otherNameTree, 'plp-sub')) === JSON.stringify(['dsh-other']), JSON.stringify(texts(otherNameTree, 'plp-sub')))

// 显示名正好是包名去掉 @作者/ 之后的短名时，也不该再画一行完整包名。
const scopedTree = render({ servers: [{ id: 'p-z', entryId: 'entry-z', moduleName: '@machine-126/dsh-alert-sound', path: 'patch-z', name: 'dsh-alert-sound', description: '', version: '', enabled: true, fiberPhase: 'active', group: 'self' }] })
check('显示名等于包名短名时不再重复画副标题', texts(scopedTree, 'plp-sub').length === 0, JSON.stringify(texts(scopedTree, 'plp-sub')))
const scopedOtherTree = render({ servers: [{ id: 'p-w', entryId: 'entry-w', moduleName: '@machine-126/dsh-other', path: 'patch-w', name: '另一个名字', description: '', version: '', enabled: true, fiberPhase: 'active', group: 'self' }] })
check('名字不同时仍显示包名（含作者名）作为副标题', JSON.stringify(texts(scopedOtherTree, 'plp-sub')) === JSON.stringify(['@machine-126/dsh-other']), JSON.stringify(texts(scopedOtherTree, 'plp-sub')))

// ---------------------------------------------------------------- B 锁住的行

const lockedSwitches = collect(tree, (node) => node.props.role === 'switch' && node.props.disabled === true)
const rowSwitches = collect(tree, (node) => node.props.role === 'switch' && !String(node.props['aria-label'] ?? '').startsWith('一键') && !String(node.props['aria-label'] ?? '').includes('内置条目'))
check('页面上只剩自制组的行，全部可切 + 那一个不可寻址的锁住',
  rowSwitches.filter((node) => node.props.disabled === true).length === 1,
  `locked=${rowSwitches.filter((node) => node.props.disabled === true).length}/${rowSwitches.length}`)
check('锁住的行给出原因', texts(tree, 'plp-reason').some((text) => String(text).includes('不能从这里停用')), JSON.stringify(texts(tree, 'plp-reason')))

// 改过名时：副标题必须是「原本的名字」，而不是包名（用户要求，与另两页同一套做法）。
const officialCustom = render({ prefs: { titles: { 'p-a': '我的开关' }, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} } })
check('改过名后副标题给的是官方原名（不是包名）', texts(officialCustom, 'plp-sub')[0] === 'MCP 开关' && !texts(officialCustom, 'plp-sub').includes('dsh-mcp-toggle'), JSON.stringify(texts(officialCustom, 'plp-sub')))
const scopedCustom = render({ servers: [{ id: 'p-z', entryId: 'entry-z', moduleName: '@machine-126/dsh-alert-sound', path: 'patch-z', name: 'dsh-alert-sound', official: 'dsh-alert-sound', description: '', version: '', enabled: true, fiberPhase: 'active', group: 'self' }], prefs: { titles: { 'p-z': '提示音' }, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} } })
check('改过名 + 官方给了名字：主标题自定义名、副标题原名', texts(scopedCustom, 'plp-name').includes('提示音') && JSON.stringify(texts(scopedCustom, 'plp-sub')) === JSON.stringify(['dsh-alert-sound']), JSON.stringify([texts(scopedCustom, 'plp-name'), texts(scopedCustom, 'plp-sub')]))
const scopedNoOfficial = render({ servers: [{ id: 'p-y2', entryId: 'entry-y2', moduleName: '@machine-126/dsh-other', path: 'patch-y2', name: '@machine-126/dsh-other', description: '', version: '', enabled: true, fiberPhase: 'active', group: 'self' }], prefs: { titles: { 'p-y2': '我爱叫它啥' }, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} } })
check('改过名 + 官方没给名字：副标题用去掉作者名的短名', JSON.stringify(texts(scopedNoOfficial, 'plp-sub')) === JSON.stringify(['dsh-other']), JSON.stringify(texts(scopedNoOfficial, 'plp-sub')))

// ---------------------------------------------------------------- C 折叠（按组）

const collapsedTree = render({ prefs: { titles: {}, desc: {}, groupTitles: {}, order: {}, collapsed: { self: true }, bulk: {} } })
check('折叠唯一那组后没有列表（折叠状态按组记）', collect(collapsedTree, (node) => byClass(node, 'plp-cards')).length === 0)
check('折叠按钮文字变成「展开」', texts(collapsedTree, 'plp-collapseBtn').includes('展开'), JSON.stringify(texts(collapsedTree, 'plp-collapseBtn')))

// 点折叠：把状态按组写回（key 是组 id）
const toggleTree = render()
collect(toggleTree, (node) => byClass(node, 'plp-collapseBtn'))[0].props.onClick()
await new Promise((resolve) => setImmediate(resolve))
const toggleBody = JSON.parse(fetchCalls[fetchCalls.length - 1].options.body)
check('点折叠把状态写进 collapsed.self', toggleBody.prefs.collapsed.self === true, JSON.stringify(toggleBody.prefs))

// ---------------------------------------------------------------- D 旋钮（按组 + 锁存）

const knobOf = (tree) => collect(tree, (node) => node.props.role === 'switch'
  && typeof node.props['aria-label'] === 'string' && node.props['aria-label'].startsWith('一键'))
/** 内置组的旋钮：只读，aria-label 是「内置条目…」而不是「一键…」。 */
const builtinKnobOf = (tree) => collect(tree, (node) => node.props.role === 'switch'
  && typeof node.props['aria-label'] === 'string' && node.props['aria-label'].includes('内置条目'))
const realTree = render()
const knobs = knobOf(realTree)
check('页面上只有一个旋钮（自制组），按真实状态显示（未全开 → 关）',
  knobs.length === 1 && knobs[0].props.disabled !== true && knobs[0].props['aria-checked'] === false,
  JSON.stringify(knobs.map((k) => [k.props.disabled, k.props['aria-checked']])))
check('内置组的旋钮根本不存在（整组不显示）', builtinKnobOf(realTree).length === 0)
const latchedTree = render({ prefs: { titles: {}, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: { self: true } } })
check('旋钮方向按组锁存（自制组记忆为开 → 显示开）', knobOf(latchedTree)[0].props['aria-checked'] === true)

remoteCalls.length = 0
const bulkTree = render()
// 内置组现在整组只读，所以拿自制组的旋钮试：自制组只有 p-b（未开），
// 点一下就是「整组开」——应该只动 p-b 这一行。
const bulkKnob = knobOf(bulkTree)[0]
check('这个旋钮可点', typeof bulkKnob.props.onClick === 'function')
bulkKnob.props.onClick()
for (let step = 0; step < 200; step += 1) {
  await new Promise((resolve) => setImmediate(resolve))
  flushTimers()
}
check('一键旋钮只碰能切换的行（内置组的不动）',
  remoteCalls.length === 1 && remoteCalls[0].entryId === 'entry-b' && remoteCalls[0].enabled === true,
  JSON.stringify(remoteCalls))
const bulkPost = fetchCalls.filter((call) => String(call.options?.body ?? '').includes('"prefs"')).pop()
check('旋钮方向立刻落盘（按组）', bulkPost !== undefined && JSON.parse(bulkPost.options.body).prefs.bulk.self === true, bulkPost === undefined ? '没有保存请求' : bulkPost.options.body)

// ---------------------------------------------------------------- E 改名

const renamedTree = render({ prefs: { titles: { 'p-a': '我的开关' }, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} } })
check('改过名的显示自定义名，官方原名退到副标题', texts(renamedTree, 'plp-name')[0] === '我的开关' && texts(renamedTree, 'plp-sub')[0] === 'MCP 开关', JSON.stringify([texts(renamedTree, 'plp-name'), texts(renamedTree, 'plp-sub')]))

// ---------------------------------------------------------------- F 改简介

const ownDescTree = render({ prefs: { titles: {}, desc: { 'p-b': '我写的简介' }, groupTitles: {}, order: {}, collapsed: {}, bulk: {} } })
check('自写简介覆盖官方那句', texts(ownDescTree, 'plp-desc').includes('我写的简介') && !texts(ownDescTree, 'plp-desc').includes('官方简介乙'), JSON.stringify(texts(ownDescTree, 'plp-desc')))

// ---------------------------------------------------------------- G 搜索

const searchTree = (query) => render({ query })
check('按显示名搜到', cards(searchTree('插件中文简介')).length === 1)
check('按包名搜到', cards(searchTree('dsh-mcp-toggle')).length === 1)
check('按官方简介搜到', cards(searchTree('侧栏 MCP 页')).length === 1)
check('按版本行搜到', cards(searchTree('v0.2.0')).length === 1, JSON.stringify(cards(searchTree('v0.2.0')).length))
const namedSearch = render({ query: '我的开关', prefs: { titles: { 'p-a': '我的开关' }, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} } })
check('按自定义名搜到', cards(namedSearch).length === 1)
const ownSearch = render({ query: '我写的简介', prefs: { titles: {}, desc: { 'p-b': '我写的简介' }, groupTitles: {}, order: {}, collapsed: {}, bulk: {} } })
check('按自写简介搜到', cards(ownSearch).length === 1)
const noMatch = searchTree('不存在的词')
check('搜不到时显示计数提示', cards(noMatch).length === 0 && collect(noMatch, (node) => byClass(node, 'plp-empty')).length === 1, JSON.stringify(texts(noMatch, 'plp-empty')))
check('搜索时计数保持整组数量', JSON.stringify(texts(searchTree('侧栏 MCP 页'), 'plp-count')) === JSON.stringify(['共 3 个 · 已关闭 1 个']), JSON.stringify(texts(searchTree('侧栏 MCP 页'), 'plp-count')))

// ---------------------------------------------------------------- H 拖动（只在同组内）

const dragPrefs = { titles: {}, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} }
const dragTree = render({ prefs: dragPrefs, servers: [ROWS[0], ROWS[2]], listRefs: { self: makeList(2) } })
const dragCards = cards(dragTree)
// 把被拖那一行(p-a)的元素登记进 rowRefs，落点判定要用它把被拖行从候选里剔掉。
dragCards[0].props.ref(draggedCard)
const grip = collect(dragCards[0], (node) => byClass(node, 'plp-grip'))[0]
const mouse = {
  button: 0,
  pointerId: 9,
  pointerType: 'mouse',
  clientX: 10,
  clientY: 5,
  preventDefault() {},
  currentTarget: { setPointerCapture() {} },
}
grip.props.onPointerDown(mouse, 'p-a')
check('鼠标按下手柄即刻进入拖动', bodyStyle.cursor === 'grabbing' && windowListeners.has('pointermove'))
// 内置组两行：p-a 元素在 100，p-c 元素在 140 → 指针放到 180（越过 140+20 的中线）→ 落点在后。
windowListeners.get('pointermove')({ pointerId: 9, clientX: 10, clientY: 180, preventDefault() {} })
const liftedTree = render({ dragId: 'p-a' })
check('被拖的行进入「浮起」状态（且只有它）',
  cards(liftedTree).filter((card) => card.props['data-lifted'] === '1').length === 1,
  JSON.stringify(cards(liftedTree).map((card) => card.props['data-lifted'])))
// 落点只在被拖那一组里出现：内置组的 p-c 拿到标记，自制组的 p-b 一定没有。
const dropTree = render({ dragId: 'p-a', preview: ['p-c', 'p-a'], dropIndex: 0 })
const dropped = cards(dropTree).filter((card) => card.props['data-drop'] === 'into')
check('落点标记只出现在被拖那一组',
  dropped.length === 1 && texts(dropped[0], 'plp-sub').includes('@deepseek-ai/dsh-base'),
  JSON.stringify(dropped.map((card) => texts(card, 'plp-sub'))))
windowListeners.get('pointerup')({ pointerId: 9, type: 'pointerup' })
await new Promise((resolve) => setImmediate(resolve))
const dragPost = fetchCalls.filter((call) => String(call.options?.body ?? '').includes('"prefs"')).pop()
const dragOrder = dragPost === undefined ? undefined : JSON.parse(dragPost.options.body).prefs.order
check('同组换位后按组保存顺序', dragPost !== undefined && JSON.stringify(dragOrder.self) === JSON.stringify(['p-c', 'p-a']), JSON.stringify(dragOrder))
check('没被拖的组不写进 order', dragOrder !== undefined && dragOrder.builtin === undefined, JSON.stringify(dragOrder))

// 快拖：一次拖动里连续移动多次（甚至先往回、再到底），落点必须取最后一次的位置。
fetchCalls = []
const fastTree = render({ prefs: { titles: {}, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} }, servers: [ROWS[0], ROWS[2]], listRefs: { self: makeList(2) } })
const fastCards = cards(fastTree)
fastCards[0].props.ref(draggedCard)
collect(fastCards[0], (node) => byClass(node, "plp-grip"))[0].props.onPointerDown(mouse, "p-a")
windowListeners.get("pointermove")({ pointerId: 9, clientX: 10, clientY: 5, preventDefault() {} })
windowListeners.get("pointermove")({ pointerId: 9, clientX: 10, clientY: 400, preventDefault() {} })
windowListeners.get("pointermove")({ pointerId: 9, clientX: 10, clientY: 180, preventDefault() {} })
windowListeners.get("pointerup")({ pointerId: 9, type: "pointerup" })
await new Promise((resolve) => setImmediate(resolve))
const fastPost = fetchCalls.filter((call) => String(call.options?.body ?? "").includes('"prefs"')).pop()
const fastOrder = fastPost === undefined ? undefined : JSON.parse(fastPost.options.body).prefs.order
check("快拖连续移动后，落点取最后一次的位置", fastPost !== undefined && JSON.stringify(fastOrder.self) === JSON.stringify(["p-c", "p-a"]), JSON.stringify(fastOrder))

// ---------------------------------------------------------------- I 恢复默认

const resetTree = render()
// 工具区第一个 plp-resetBtn 现在是「官方管理页」，要按文字找「恢复默认」那个。
collect(resetTree, (node) => byClass(node, 'plp-resetBtn') && node.children.includes('恢复默认'))[0].props.onClick()
await new Promise((resolve) => setImmediate(resolve))
const resetBody = JSON.parse(fetchCalls[fetchCalls.length - 1].options.body).prefs
check('「恢复默认」把五个偏好表都清空',
  JSON.stringify(resetBody) === JSON.stringify({ titles: {}, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} }),
  JSON.stringify(resetBody))

// ---------------------------------------------------------------- 结论

if (failures === 0) console.log('\n全部通过')
else { console.log(`\n${failures} 项未通过`); process.exitCode = 1 }
