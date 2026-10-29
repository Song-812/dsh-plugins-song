// 插件面板宿主半离线自测：只读源码 + 在系统临时目录里跑，不碰真实 ~/.dsh。
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sanitizePrefs, selfMadeModules, buildGet, handle, STATE_FILE_NAME, __test__ as hostTest } from '../lib/index.js'

let failures = 0
const check = (name, ok, extra = '') => {
  if (ok) console.log(`PASS ${name}`)
  else { failures += 1; console.log(`FAIL ${name}${extra === '' ? '' : `  →  ${extra}`}`) }
}

const home = mkdtempSync(path.join(os.tmpdir(), 'panel-host-'))
// 这个测试跑在 DSH 的子进程里，环境里可能带着真实的 DSH_PROFILE_DIR；
// 清掉它，免得测试去读用户的真实 profile（本测试绝不碰真实数据）。
delete process.env.DSH_PROFILE_DIR
delete process.env.DSH_PROFILE
delete process.env.DSH_HOME
const profileDir = path.join(home, 'profiles', 'desktop')
mkdirSync(profileDir, { recursive: true })
writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
  dependencies: {
    'dsh-mcp-toggle': 'link:C:/work/MCP开关',
    'dsh-local-file': 'file:../local',
    '@deepseek-ai/dsh-cordis': '^1.0.0',
    'plain-package': '2.0.0',
  },
}), 'utf8')

// 1. 偏好清洗：认识的留下、不认识（含危险结构）的丢掉
const cleaned = sanitizePrefs({
  titles: { a: '我的名字', b: '', c: 3 },
  desc: { a: '我写的简介', b: '' },
  groupTitles: { builtin: '内置', self: '自制' },
  order: { builtin: ['a', 'b'], self: ['c'], broken: 'not-an-array' },
  collapsed: { builtin: true, self: 'yes' },
  bulk: { builtin: false },
  bulkOn: true,
  junk: { nested: true },
})
check('清洗后只留认识的字段', Object.keys(cleaned).sort().join(',') === 'bulk,collapsed,desc,groupTitles,order,titles', Object.keys(cleaned).join(','))
check('空字符串与非法类型被剔除', cleaned.titles.a === '我的名字' && cleaned.titles.b === undefined && cleaned.titles.c === undefined, JSON.stringify(cleaned.titles))
check('行简介能存下，空的丢掉', cleaned.desc.a === '我写的简介' && cleaned.desc.b === undefined && cleaned.desc.c === undefined, JSON.stringify(cleaned.desc))
check('非数组顺序被丢弃', cleaned.order.builtin.join('|') === 'a|b' && cleaned.order.broken === undefined, JSON.stringify(cleaned.order))
check('非布尔折叠被丢弃', cleaned.collapsed.builtin === true && cleaned.collapsed.self === undefined, JSON.stringify(cleaned.collapsed))
check('遗留 bulkOn 被丢弃', sanitizePrefs({ bulkOn: false }).bulkOn === undefined)
check('垃圾输入返回空对象', JSON.stringify(sanitizePrefs(null)) === '{}' && JSON.stringify(sanitizePrefs([1, 2])) === '{}')

// 2. 自制/内置判定：只认 link: 与 file:
const self = selfMadeModules(profileDir)
check('只有 link:/file: 的算自制', self.join('|') === 'dsh-local-file|dsh-mcp-toggle', self.join('|'))
check('读不到 profile 时返回空表而不是抛错', selfMadeModules(path.join(home, 'nope')).length === 0)

// 3. GET 往返：刚开始没有状态文件
const get1 = await (await handle(new Request('http://x/api/plugins-panel'), home)).json()
check('首次 GET 给出空偏好与自制清单', get1.ok === true && JSON.stringify(get1.prefs) === '{}' && get1.selfMade.length === 2, JSON.stringify(get1))

// 4. POST 保存偏好 → 落盘 → GET 读回
const saved = await (await handle(new Request('http://x/api/plugins-panel', {
  method: 'POST',
  body: JSON.stringify({ action: 'prefs', prefs: { titles: { a: '改过的名字' }, desc: { a: '改过的简介' }, order: { self: ['a'] } } }),
}), home)).json()
check('POST 保存成功并回显清洗过的偏好', saved.ok === true && saved.prefs.titles.a === '改过的名字', JSON.stringify(saved))
check('行简介也能往返', saved.prefs.desc.a === '改过的简介', JSON.stringify(saved.prefs))
const onDisk = JSON.parse(readFileSync(path.join(home, STATE_FILE_NAME), 'utf8'))
check('状态文件写到了 $DSH_HOME/<state>.prefs', onDisk.prefs.titles.a === '改过的名字' && onDisk.prefs.desc.a === '改过的简介', JSON.stringify(onDisk))
const get2 = await (await handle(new Request('http://x/api/plugins-panel'), home)).json()
check('再 GET 能读回刚存的偏好', get2.prefs.titles.a === '改过的名字' && get2.prefs.desc.a === '改过的简介', JSON.stringify(get2.prefs))

// 5. 拒绝路径
const badAction = await handle(new Request('http://x/api/plugins-panel', { method: 'POST', body: JSON.stringify({ action: 'nope' }) }), home)
check('未知 action → 400', badAction.status === 400)
const badJson = await handle(new Request('http://x/api/plugins-panel', { method: 'POST', body: '{oops' }), home)
check('坏 JSON → 400', badJson.status === 400)
const badMethod = await handle(new Request('http://x/api/plugins-panel', { method: 'DELETE' }), home)
check('不支持的 method → 405', badMethod.status === 405)

// 6. 坏状态文件不能让页面打不开
writeFileSync(path.join(home, STATE_FILE_NAME), '{broken', 'utf8')
const get3 = await (await handle(new Request('http://x/api/plugins-panel'), home)).json()
check('状态文件坏掉时仍返回空偏好', get3.ok === true && JSON.stringify(get3.prefs) === '{}', JSON.stringify(get3))
check('buildGet 不再回绝对 home 路径', buildGet(home).home === undefined, JSON.stringify(buildGet(home)))
check('buildGet 带 profileSource 与 warnings', typeof buildGet(home).profileSource === 'string' && Array.isArray(buildGet(home).warnings), JSON.stringify(buildGet(home)))

// 7. POST 体长上限
const huge = 'x'.repeat(hostTest.MAX_BODY_BYTES + 8)
const tooBig = await handle(new Request('http://x/api/plugins-panel', {
  method: 'POST',
  headers: { 'content-length': String(Buffer.byteLength(huge, 'utf8')) },
  body: huge,
}), home)
check('超大 POST 体 → 413', tooBig.status === 413, String(tooBig.status))


rmSync(home, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
