/**
 * 全局规则 · 界面半边回归测试
 *
 * 覆盖：设置页标题、无顶部路径说明、「恢复默认」确认流程、保存/失败提示。
 * 这个测试用假 window / 假 react / 假 fetch 把 lib/client.js 真跑一遍，
 * 断言渲染出来的东西和发出去的请求，而不是断言源码里有没有某个字符串。
 *
 * 跑法：node test/client-smoke.mjs [客户端半边路径]
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import {
	createRenderer,
	byClass,
	buttonByText,
	findAll,
	textOf,
	settle,
	spyLongTimers,
} from './_harness.mjs'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const clientPath = process.argv[2]
	? path.resolve(process.argv[2])
	: path.resolve(here, '..', 'lib', 'client.js')
const packagePath = path.resolve(here, '..', 'package.json')

const toast = { text:'', question:'', labels:null, resolve:null, activate(){}, cancel(){}, show(_owner,_kind,text){this.text=text}, confirm(_owner,text,labels){this.question=text;this.labels=labels;return new Promise(resolve=>{this.resolve=resolve})} };
let failures = 0
const check = (label, ok, extra = '') => {
	if (ok) {
		console.log(`  [通过] ${label}`)
	} else {
		failures += 1
		console.log(`  [失败] ${label} ${extra}`)
	}
}
const section = (title) => console.log(`\n${title}`)

/** 只算"看得见的字"，跳过 <style> 里的 CSS。 */
function visibleText(tree) {
	const parts = []
	const visit = (node) => {
		if (typeof node === 'string') {
			parts.push(node)
			return
		}
		if (!node || typeof node !== 'object') return
		if (node.type === 'style') return
		for (const child of node.props?.children ?? []) visit(child)
	}
	visit(tree)
	return parts.join('\n') + '\n' + toast.text
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const source = fs.readFileSync(clientPath, 'utf8')

console.log('界面半边自测')
console.log('  文件：', clientPath)

// ── 1. 装载 ────────────────────────────────────────────────────────────────
section('一、装载与注册')

let captured = null
const fakeWindow = { __dshSettingsToastV1: toast, __ModuleLoader__: { load: (spec) => { captured = spec } } }
try {
	new Function('window', source)(fakeWindow)
	check('客户端半边能被执行', true)
} catch (error) {
	check('客户端半边能被执行', false, `→ ${error.message}`)
	process.exit(1)
}
check('调用了 __ModuleLoader__.load', Boolean(captured))
if (!captured) process.exit(1)
check('load 的 id 与包名逐字一致', captured.id === pkg.name, `→ load id=${captured.id} / 包名=${pkg.name}`)

const renderer = createRenderer()
let reactRef = renderer.react
let mod = null
try {
	mod = captured.factory((name) => {
		if (name === 'react') return reactRef
		throw new Error(`require 了预期外的模块：${name}`)
	})
	check('factory 能跑完', true)
} catch (error) {
	check('factory 能跑完', false, `→ ${error.message}`)
	process.exit(1)
}
check('factory 返回了模块对象', mod !== undefined && mod !== null)
if (!mod) process.exit(1)
check('模块有 apply 方法', typeof mod.apply === 'function')
check('模块 name 是 global-rules（bundle patch 的 id）', mod.name === 'global-rules', `→ ${mod.name}`)
check('模块 inject 里有 slots', Array.isArray(mod.inject) && mod.inject.includes('slots'))
check('仍然导出中英两份词典', Boolean(mod.DICTS?.zh?.label) && Boolean(mod.DICTS?.en?.label))

const registrations = []
let localeNs = null
// 真环境里 ctx.locale.bind(NS) 会返回"按 key 取词"的函数，这里照做，否则
// 导航文字、标题文字都会被测成 key 本身。
const translate = (key) => (mod?.DICTS?.zh?.[key] ?? key)
const ctx = {
	effect: (fn) => { try { fn() } catch { /* 桩环境里 boot 失败无所谓 */ } },
	locale: { register: (ns) => { localeNs = ns }, bind: () => translate },
	slots: {
		inject: (slot, callback) => callback(),
		register: (meta, component) => registrations.push({ meta, component }),
	},
}
try {
	mod.apply(ctx)
	check('apply(ctx) 能跑完', true)
} catch (error) {
	check('apply(ctx) 能跑完', false, `→ ${error.message}`)
}
check('注册了 1 个设置页', registrations.length === 1, `→ 实际 ${registrations.length} 个`)
const registration = registrations[0]
if (!registration) process.exit(1)
check('挂在 settings.section', registration.meta.name === 'settings.section', `→ ${registration.meta.name}`)
check('设置页 id 是 global-rules', registration.meta.id === 'global-rules', `→ ${registration.meta.id}`)
check('导航位置还是 order 21', registration.meta.order === 21, `→ ${registration.meta.order}`)
check('导航文字是「全局规则」', registration.meta.label() === '全局规则', `→ ${registration.meta.label()}`)
check('注册了本地化字典', localeNs === 'global-rules', `→ ${localeNs}`)

// ── 2. 假服务端 ────────────────────────────────────────────────────────────
const server = {
	content: '# 示例规则\n\n1. 回答请简洁。\n',
	exists: true,
	version: 'v1',
	fail: false,
	calls: [],
	reset: function () {
		this.content = ''
		this.exists = true
	},
}
const fetchStub = async (pathname, init) => {
	const method = (init && init.method) || 'GET'
	server.calls.push({ pathname, method, body: init && init.body })
	if (server.fail) {
		return { ok: false, status: 500, json: async () => ({}) }
	}
	if (method === 'GET') {
		return { ok: true, status: 200, json: async () => ({ exists: server.exists, content: server.content, version: server.version }) }
	}
	const body = JSON.parse(init.body)
	if (body.action === 'reset') {
		server.reset()
		return { ok: true, status: 200, json: async () => ({ ok: true, version: 'empty' }) }
	}
	// 版本不符就 409（与宿主同一套语义）：界面必须报失败、且不能写进去。
	if (typeof body.baseVersion === 'string' && body.baseVersion !== server.version) {
		return { ok: false, status: 409, json: async () => ({ ok: false, code: 'stale' }) }
	}
	server.content = body.content
	server.exists = true
	server.version = 'v' + (Number(String(server.version).replace(/\D/g, '')) + 1)
	return { ok: true, status: 200, json: async () => ({ ok: true, version: server.version }) }
}
const realFetch = globalThis.fetch
globalThis.fetch = fetchStub

const t = (key, params) => {
	let text = mod.DICTS?.zh?.[key] ?? key
	if (params) {
		for (const [name, value] of Object.entries(params)) text = text.replace(`{${name}}`, String(value))
	}
	return text
}

renderer.mount(registration.component)

const paint = async (props = { t }) => {
	renderer.render(props)
	await settle()
	return renderer.render(props)
}

const timers = spyLongTimers()

// ── 3. 首屏 ────────────────────────────────────────────────────────────────
section('二、首屏')

let tree = await paint()
let visible = visibleText(tree)

const css = findAll(tree, (node) => node.type === 'style').map(textOf).join('\n')
const titleNode = byClass(tree, 'dgr-title')[0]
check('有标题元素', Boolean(titleNode), '→ 找不到 .dgr-title')
check('标题文字是「全局规则」', titleNode ? textOf(titleNode) === '全局规则' : false, `→ ${titleNode ? textOf(titleNode) : '无'}`)
const flatCss = css.replace(/\s+/g, ' ')
check('标题字号 17px', flatCss.includes('.dgr-title { font-size: 17px;'), '→ CSS 里没有 17px 的标题规则')
// 2026-10-26 对齐其他插件页后的真实值：标题 700、卡片标题 650（见 lib/client.js 的 .dgr-title / .dgr-card-title）。
check('标题字重 700', flatCss.includes('.dgr-title { font-size: 17px; font-weight: 700;'), '→ CSS 标题规则里没有 700 字重')
check('卡片标题字重 650', flatCss.includes('.dgr-card-title { font-family: inherit; font-size: 15px; font-weight: 650;'), '→ CSS 卡片标题规则里没有 650 字重')
check('顶部说明那行没了', !visible.includes('保存后实时生效') && !visible.includes('编辑 ~/.dsh'), '→ 说明行还在')
check('顶部不再显示文件路径', !visible.includes('AGENTS.md'), '→ 还看得到路径')

const resetButton = buttonByText(tree, '恢复默认')
check('右上角有「恢复默认」', Boolean(resetButton))
// 「恢复默认」与「保存」同用玻璃壳 dgr-btn。
check(
	'「恢复默认」与「保存」同款玻璃壳按钮（dgr-btn）',
	resetButton !== undefined && buttonByText(tree, '保存') !== undefined &&
		resetButton.props.className === buttonByText(tree, '保存').props.className &&
		resetButton.props.className.split(/\s+/).includes('dgr-btn'),
	`→ ${resetButton ? resetButton.props.className : '无'}`,
)
check('「恢复默认」和标题在同一行', Boolean(byClass(tree, 'dgr-head').length) && Boolean(byClass(tree, 'dgr-actions').length))

let textarea = findAll(tree, (node) => node.type === 'textarea')[0]
check('有编辑框', Boolean(textarea))
check('编辑框载入了文件内容', textarea ? textarea.props.value === server.content : false, `→ ${textarea ? JSON.stringify(textarea.props.value) : '无'}`)

// ── 4. 保存 ────────────────────────────────────────────────────────────────
section('三、保存')

tree = await paint()
textarea = findAll(tree, (node) => node.type === 'textarea')[0]
textarea.props.onChange({ target: { value: '# 改过的规则\n' } })
tree = renderer.render()
tree = renderer.render()
buttonByText(tree, '保存').props.onClick()
tree = await paint()
check('保存发了 POST', server.calls.filter((call) => call.method === 'POST').length === 1)
const saveCall = server.calls.filter((call) => call.method === 'POST').pop()
check('保存的内容正确', saveCall ? JSON.parse(saveCall.body).content === '# 改过的规则\n' : false)
check('保存带上了 baseVersion', saveCall ? JSON.parse(saveCall.body).baseVersion === 'v1' : false, saveCall ? `→ ${saveCall.body}` : '→ 没有 POST')
check('保存后写进了假服务端', server.content === '# 改过的规则\n')
check('提示「已保存」', visibleText(tree).includes('已保存'), `→ ${visibleText(tree)}`)

server.fail = true
server.calls.length = 0
tree = await paint()
buttonByText(tree, '保存').props.onClick()
const busyTree = renderer.render()
textarea = findAll(busyTree, (node) => node.type === 'textarea')[0]
check('保存进行中编辑框只读', textarea?.props.readOnly === true, '→ 保存期间还能改，响应回来会和界面打架')
tree = await paint()
const failureText = visibleText(tree)
check('保存失败时出声', failureText.includes('保存失败'), `→ ${failureText}`)
check('失败时不泄漏技术原因', !/HTTP|500|Error/i.test(failureText), `→ ${failureText}`)
server.fail = false

// ── 5. 恢复默认 ──
section('四、恢复默认')
server.calls.length = 0
tree = await paint()
buttonByText(tree, '恢复默认').props.onClick()
check('先显示确认问题', toast.question === '确定清空全局规则？')
check('确认钮走词典（确认/取消）', Array.isArray(toast.labels) && toast.labels[0] === '确认' && toast.labels[1] === '取消', `→ ${JSON.stringify(toast.labels)}`)
check('确认前没有发请求', server.calls.length === 0)
toast.resolve(false)
await settle()
check('取消后没有发请求', server.calls.length === 0)
tree = await paint()
buttonByText(tree, '恢复默认').props.onClick()
toast.resolve(true)
tree = await paint()
const resetCall = server.calls.filter((call) => call.method === 'POST').pop()
check('确认后发出 reset', resetCall ? JSON.parse(resetCall.body).action === 'reset' : false)
check('确认后仅发一次请求', server.calls.filter((call) => call.method === 'POST').length === 1)
check('服务端规则被清空', server.content === '')
textarea = findAll(tree, (node) => node.type === 'textarea')[0]
check('编辑框跟着清空', textarea ? textarea.props.value === '' : false)
check('提示已清空', toast.text === '已清空')
server.fail = true
server.calls.length = 0
tree = await paint()
buttonByText(tree, '恢复默认').props.onClick()
toast.resolve(true)
tree = await paint()
check('清空失败时显示提示', toast.text.includes('清空失败'))
server.fail = false

// ── 6. 文件不存在 ──────────────────────────────────────────────────────────
section('五、文件不存在')

server.exists = false
server.calls.length = 0
renderer.reset() // 相当于关掉设置页再打开：重新读一次
tree = await paint()
check('提示「文件尚不存在，保存将创建它。」', visibleText(tree).includes('文件尚不存在，保存将创建它。'), `→ ${visibleText(tree)}`)

// ── 7. 还没读完 / 读失败时不许写入（否则空内容会把真规则冲掉）────────────
section('六、没读到内容时不许写入')

renderer.reset()
tree = renderer.render({ t })
check('首屏还在读时「保存」被禁用', buttonByText(tree, '保存')?.props.disabled === true, '→ 读完之前就点了保存，会用空内容覆盖 AGENTS.md')
await settle()

server.fail = true
server.calls.length = 0
renderer.reset()
tree = await paint()
check('读取失败时出声', visibleText(tree).includes('读取失败'), `→ ${visibleText(tree)}`)
check('读取失败时「保存」被禁用', buttonByText(tree, '保存')?.props.disabled === true, '→ 还能点保存，会把空内容写进 AGENTS.md')
check('读取失败时「恢复默认」被禁用', buttonByText(tree, '恢复默认')?.props.disabled === true, '→ 还能点清空')
server.fail = false

	// ── 7.5 另一个窗口改过：版本不符要拒掉 ──────────────────────────────
	section('八、另一个窗口改过时')
	server.fail = false
	renderer.reset()
	tree = await paint()
	server.version = 'v999'
	textarea = findAll(tree, (node) => node.type === 'textarea')[0]
	textarea.props.onChange({ target: { value: '# 我的旧编辑' } })
	tree = renderer.render()
	buttonByText(tree, '保存').props.onClick()
	tree = await paint()
	check('版本不符时出声失败', visibleText(tree).includes('保存失败'), `→ ${visibleText(tree)}`)
	check('409 附带词典冲突说明', visibleText(tree).includes('文件已被其他窗口修改'), `→ ${visibleText(tree)}`)
	check('旧编辑没有写进去', server.content !== '# 我的旧编辑')

	// 英文界面：确认钮与 409 后缀也应英文化
	section('九、英文界面文案')
	const tEn = (key) => (mod.DICTS.en[key] ?? key)
	renderer.reset()
	toast.question = ''
	toast.labels = null
	tree = await paint({ t: tEn })
	buttonByText(tree, 'Restore defaults').props.onClick()
	check('英文确认问题', toast.question === 'Clear all global rules?')
	check('英文确认钮', Array.isArray(toast.labels) && toast.labels[0] === 'Confirm' && toast.labels[1] === 'Cancel', `→ ${JSON.stringify(toast.labels)}`)
	toast.resolve(false)
	await settle()
	server.version = 'v-en-stale'
	textarea = findAll(tree, (node) => node.type === 'textarea')[0]
	textarea.props.onChange({ target: { value: '# stale en' } })
	tree = renderer.render({ t: tEn })
	buttonByText(tree, 'Save').props.onClick()
	tree = await paint({ t: tEn })
	check('英文 409 后缀', visibleText(tree).includes('changed in another window'), `→ ${visibleText(tree)}`)

// ── 8. 收尾 ────────────────────────────────────────────────────────────────
timers.restore()
globalThis.fetch = realFetch

console.log('')
if (failures === 0) {
	console.log('界面半边自测通过。')
	process.exit(0)
}
console.log(`界面半边自测失败 ${failures} 项。`)
process.exit(1)
