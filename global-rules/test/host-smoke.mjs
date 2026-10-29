/**
 * 全局规则 · 宿主半边回归测试
 *
 * 覆盖：读文件、写文件、恢复默认（先备份再清空）、备份只留最近一份、
 * 备份目录可被环境变量指走（测试不碰真实目录）、请求体校验。
 *
 * 跑法：node test/host-smoke.mjs
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import url from 'node:url'
import { pathToFileURL } from 'node:url'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const hostPath = path.resolve(here, '..', 'lib', 'index.js')

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

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-global-rules-test-'))
const home = path.join(root, 'home')
const backupDir = path.join(root, 'backups')
const rulesFile = path.join(home, 'AGENTS.md')
await fs.mkdir(home, { recursive: true })
process.env.DSH_HOME = home
process.env.DSH_GLOBAL_RULES_BACKUP_DIR = backupDir

const mod = await import(pathToFileURL(hostPath).href)

console.log('宿主半边自测')
console.log('  文件：', hostPath)
console.log('  沙盒：', root)

section('一、导出与注册')

check('导出 name = global-rules（bundle patch 的 id）', mod.name === 'global-rules', `→ ${mod.name}`)
check('导出 apply', typeof mod.apply === 'function')

let route = null
try {
	mod.apply({
		inject: (dependencies, callback) => {
			const faces = { connection: { fetch: { register: (spec) => { route = spec } } } }
			callback(faces)
		},
	})
	check('apply 能跑完', true)
} catch (error) {
	check('apply 能跑完', false, `→ ${error.message}`)
}
check('注册了 /api/global-rules', route?.path === '/api/global-rules', `→ ${route?.path}`)
check('同时接 GET 和 POST', Array.isArray(route?.methods) && route.methods.includes('GET') && route.methods.includes('POST'), `→ ${JSON.stringify(route?.methods)}`)
check('请求体走 buffered', route?.requestBody === 'buffered', `→ ${route?.requestBody}`)
if (!route) {
	await fs.rm(root, { recursive: true, force: true })
	process.exit(1)
}

const call = (init) => route.fetch(new Request('http://127.0.0.1/api/global-rules', init))
const postJson = (payload) =>
	call({
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
	})
const listBackups = async () => {
	try {
		return (await fs.readdir(backupDir)).filter((name) => /^AGENTS-\d{8}-\d{6}-\d{3}\.md$/.test(name))
	} catch {
		return []
	}
}

section('二、读取')

await fs.rm(rulesFile, { force: true })
let response = await call()
let body = await response.json()
check('文件不存在时返回 exists=false', response.status === 200 && body.exists === false, `→ ${JSON.stringify(body)}`)
check('不存在时内容为空串', body.content === '', `→ ${JSON.stringify(body.content)}`)
check('不再把路径塞给界面', body.path === undefined, `→ ${JSON.stringify(body)}`)

section('三、保存')

response = await postJson({ content: '# 示例规则\n\n1. 回答请简洁。\n' })
body = await response.json()
check('保存返回 ok', response.status === 200 && body.ok === true, `→ ${JSON.stringify(body)}`)
check('文件写进去了', (await fs.readFile(rulesFile, 'utf8')) === '# 示例规则\n\n1. 回答请简洁。\n')

response = await call()
body = await response.json()
check('再读能读到', body.exists === true && body.content === '# 示例规则\n\n1. 回答请简洁。\n', `→ ${JSON.stringify(body)}`)

section('四、恢复默认')

// 备份目录里混入一个"不是本插件格式"的文件，清空时不该被误删
await fs.mkdir(backupDir, { recursive: true })
const foreignFile = path.join(backupDir, 'AGENTS-别删我.md')
await fs.writeFile(foreignFile, '别人的东西', 'utf8')

response = await postJson({ action: 'reset' })
body = await response.json()
check('恢复默认返回 ok', response.status === 200 && body.ok === true, `→ ${JSON.stringify(body)}`)
check('AGENTS.md 被清成 0 字节', (await fs.stat(rulesFile)).size === 0)
let backups = await listBackups()
check('旧规则备份了 1 份', backups.length === 1, `→ ${JSON.stringify(backups)}`)
check('备份内容是清空前的规则', backups.length === 1 ? (await fs.readFile(path.join(backupDir, backups[0]), 'utf8')) === '# 示例规则\n\n1. 回答请简洁。\n' : false)
check('备份文件名带时间戳前缀（含毫秒）', backups.length === 1 && /^AGENTS-\d{8}-\d{6}-\d{3}\.md$/.test(backups[0]), `→ ${backups[0]}`)

response = await postJson({ action: 'reset' })
body = await response.json()
check('空文件再清一次也返回 ok', response.status === 200 && body.ok === true, `→ ${JSON.stringify(body)}`)
backups = await listBackups()
check('仍然只留最近一份', backups.length === 1, `→ ${JSON.stringify(backups)}`)
check('空文件不会把有内容的备份冲掉', backups.length === 1 ? (await fs.readFile(path.join(backupDir, backups[0]), 'utf8')) === '# 示例规则\n\n1. 回答请简洁。\n' : false)
const readMaybe = async (file) => {
	try {
		return await fs.readFile(file, 'utf8')
	} catch {
		return null
	}
}
check('备份目录里别的文件没被误删', (await readMaybe(foreignFile)) === '别人的东西')

section('五、恢复默认能重新写入内容')

await postJson({ content: '第二条规则\n' })
await postJson({ action: 'reset' })
backups = await listBackups()
check('又一次备份、仍然只有一份', backups.length === 1, `→ ${JSON.stringify(backups)}`)
check('备份换成了较新的那份', backups.length === 1 ? (await fs.readFile(path.join(backupDir, backups[0]), 'utf8')) === '第二条规则\n' : false)
check('AGENTS.md 又变回 0 字节', (await fs.stat(rulesFile)).size === 0)

section('六、请求体校验')

response = await call({ method: 'POST', body: 'not json' })
check('非 JSON 回 400', response.status === 400, `→ ${response.status}`)

response = await postJson({ content: 123 })
check('content 不是字符串回 400', response.status === 400, `→ ${response.status}`)

response = await call({ method: 'POST', body: JSON.stringify({ content: 'x'.repeat(300 * 1024) }) })
check('超过 256 KiB 回 413', response.status === 413, `→ ${response.status}`)
check('超限请求没有写文件', (await fs.stat(rulesFile)).size === 0)

section('七、写入不留残骸、目录不存在也能落地')

response = await postJson({ content: '整洁测试\n' })
check('保存成功', response.status === 200, `→ ${response.status}`)
const homeEntries = await fs.readdir(home)
check('目录里没有临时文件残留', homeEntries.every((name) => !name.includes('.tmp-')), `→ ${JSON.stringify(homeEntries)}`)
check('内容完整', (await fs.readFile(rulesFile, 'utf8')) === '整洁测试\n')

await fs.rm(home, { recursive: true, force: true })
response = await postJson({ content: '目录重建\n' })
check('父目录被删掉后保存仍成功', response.status === 200, `→ ${response.status}`)
check('文件被重新创建', (await fs.readFile(rulesFile, 'utf8')) === '目录重建\n')

section('九、别的窗口改过就拒绝覆盖')

await postJson({ content: '窗口一存的\n' })
response = await call()
body = await response.json()
check('GET 会回传版本号', typeof body.version === 'string' && body.version.length > 0, `→ ${JSON.stringify(body.version)}`)
const staleVersion = body.version

await postJson({ content: '窗口一先存的新内容\n' })
response = await postJson({ content: '窗口二的旧编辑\n', baseVersion: staleVersion })
check('版本不符时回 409', response.status === 409, `→ ${response.status}`)
check('旧编辑没有覆盖掉别人的内容', (await fs.readFile(rulesFile, 'utf8')) === '窗口一先存的新内容\n')

response = await postJson({ content: '窗口二刷过版本后的保存\n', baseVersion: (await (await call()).json()).version })
check('版本一致时正常保存', response.status === 200, `→ ${response.status}`)
check('内容已更新', (await fs.readFile(rulesFile, 'utf8')) === '窗口二刷过版本后的保存\n')
	section('十、并发写同一个版本')

	await postJson({ content: '并发前的内容\n' })
	const beforeConcurrent = (await (await call()).json()).version
	const [first, second] = await Promise.all([
		postJson({ content: '并发 A\n', baseVersion: beforeConcurrent }),
		postJson({ content: '并发 B\n', baseVersion: beforeConcurrent }),
	])
	const codes = [first.status, second.status].sort((a, b) => a - b)
	check('并发同版本只有一个成功', codes[0] === 200 && codes[1] === 409, `→ ${codes.join(',')}`)
	const afterConcurrent = await fs.readFile(rulesFile, 'utf8')
	check('文件里只有赢家的内容', afterConcurrent === '并发 A\n' || afterConcurrent === '并发 B\n', `→ ${JSON.stringify(afterConcurrent)}`)


section('十一、符号链接保存不破坏链接')

const realTarget = path.join(home, 'AGENTS.real.md')
await fs.writeFile(realTarget, '链接前的内容\n', 'utf8')
await fs.rm(rulesFile, { force: true })
let symlinkOk = false
try {
	await fs.symlink(realTarget, rulesFile)
	symlinkOk = true
} catch (error) {
	check('符号链接测试跳过（当前环境无权限）', error && (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EINVAL'), `→ ${error && error.code}`)
}
if (symlinkOk) {
	response = await postJson({ content: '写进链接目标\n' })
	check('经符号链接保存返回 ok', response.status === 200, `→ ${response.status}`)
	const linkStat = await fs.lstat(rulesFile)
	check('保存后 AGENTS.md 仍是符号链接', linkStat.isSymbolicLink(), `→ mode=${linkStat.mode}`)
	check('内容写在真实目标里', (await fs.readFile(realTarget, 'utf8')) === '写进链接目标\n')
	await fs.rm(rulesFile, { force: true })
	await fs.writeFile(rulesFile, '恢复普通文件\n', 'utf8')
}

section('十二、备份目录 ~ 展开与默认路径')

const tildeName = `dsh-gr-tilde-backups-${Date.now()}`
const tildeDir = path.join(os.homedir(), tildeName)
process.env.DSH_GLOBAL_RULES_BACKUP_DIR = `~/${tildeName}`
await postJson({ content: 'tilde 备份内容\n' })
response = await postJson({ action: 'reset' })
check('~ 备份目录 reset 成功', response.status === 200, `→ ${response.status}`)
let tildeBackups = []
try {
	tildeBackups = (await fs.readdir(tildeDir)).filter((name) => /^AGENTS-\d{8}-\d{6}-\d{3}\.md$/.test(name))
} catch {}
check('~ 展开后备份落到家目录', tildeBackups.length === 1, `→ ${JSON.stringify(tildeBackups)} dir=${tildeDir}`)
await fs.rm(tildeDir, { recursive: true, force: true })

delete process.env.DSH_GLOBAL_RULES_BACKUP_DIR
await postJson({ content: '默认备份目录内容\n' })
response = await postJson({ action: 'reset' })
check('未设环境变量时 reset 成功', response.status === 200, `→ ${response.status}`)
const defaultBackupDir = path.join(home, 'global-rules-backups')
let defaultBackups = []
try {
	defaultBackups = (await fs.readdir(defaultBackupDir)).filter((name) => /^AGENTS-\d{8}-\d{6}-\d{3}\.md$/.test(name))
} catch {}
check('默认备份目录在 <DSH_HOME>/global-rules-backups', defaultBackups.length === 1, `→ ${JSON.stringify(defaultBackups)}`)
// 恢复测试用备份目录，避免后续残留干扰（本节已是收尾前）
process.env.DSH_GLOBAL_RULES_BACKUP_DIR = backupDir

section('八、不碰真规则文件')

check('整个测试没写真实规则文件', path.resolve(rulesFile) !== path.resolve(os.homedir(), '.dsh', 'AGENTS.md'))

await fs.rm(root, { recursive: true, force: true })

console.log('')
if (failures === 0) {
	console.log('宿主半边自测通过。')
	process.exit(0)
}
console.log(`宿主半边自测失败 ${failures} 项。`)
process.exit(1)
