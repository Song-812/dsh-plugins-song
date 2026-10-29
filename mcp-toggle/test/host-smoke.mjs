/**
 * Offline round-trip test for dsh-mcp-toggle's host half: POST prefs -> state
 * file -> GET prefs, plus the rejection paths and the write race. It talks to
 * the exported `handle` directly, so no DSH, HTTP server or restart is involved.
 *
 * Run: node test\host-smoke.mjs   (from the plugin folder)
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log(`PASS  ${name}`)
  else { failures += 1; console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const hostUrl = new URL('../lib/index.js', import.meta.url)
const { __test__ } = await import(hostUrl.href)
const { handle, sanitizePrefs, loadState } = __test__

function postRequest(body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    method: 'POST',
    headers: { get: (name) => (name === 'content-length' ? String(Buffer.byteLength(text)) : null) },
    text: async () => text,
  }
}

function getRequest() {
  return { method: 'GET', headers: { get: () => null } }
}

// ---- sanitizer -------------------------------------------------------------
const clean = sanitizePrefs({
  titles: { a: '  名字  ', b: '', c: 42, d: 'x'.repeat(400) },
  order: ['a', '', 7, 'b'],
  collapsed: 'yes',
  groupTitle: '  组名  ',
  junk: { deep: true },
})
check('sanitizePrefs：名字去空白并保留', clean.titles.a === '名字')
check('sanitizePrefs：丢弃空值与非法类型', clean.titles.b === undefined && clean.titles.c === undefined)
check('sanitizePrefs：超长名字被截断到 200', clean.titles.d.length === 200)
check('sanitizePrefs：排序只保留非空字符串', JSON.stringify(clean.order) === JSON.stringify(['a', 'b']), JSON.stringify(clean.order))
check('sanitizePrefs：collapsed 只认 true', clean.collapsed === false)
check('sanitizePrefs：组名去空白', clean.groupTitle === '组名')
check('sanitizePrefs：不认识的大字段被丢掉', clean.junk === undefined)
// The knob's latch: only real booleans count, and `false` must not be dropped by a
// truthiness check (that would silently turn "remembered closed" into "unset").
check('sanitizePrefs：锁存只认 true/false（false 也要留住）',
  sanitizePrefs({ bulkOn: true }).bulkOn === true
    && sanitizePrefs({ bulkOn: false }).bulkOn === false
    && sanitizePrefs({ bulkOn: 'yes' }).bulkOn === undefined
    && sanitizePrefs({ bulkOn: 0 }).bulkOn === undefined,
  JSON.stringify(sanitizePrefs({ bulkOn: false })))
check('sanitizePrefs：没点过旋钮时输出里不带锁存字段', !('bulkOn' in sanitizePrefs({ titles: {} })))
check('sanitizePrefs：完全非对象也安全', JSON.stringify(sanitizePrefs(null)) === JSON.stringify({ titles: {}, order: [], collapsed: false, groupTitle: '' }))

// ---- round trip ------------------------------------------------------------
const home = await mkdtemp(join(tmpdir(), 'mcp-toggle-test-'))
try {
  const first = await handle(getRequest(), home, undefined)
  const firstBody = await first.json()
  const emptyPrefs = { titles: {}, order: [], collapsed: false, groupTitle: '' }
  check('GET 在全新 home 上返回 ok 与清洗后的空 prefs', firstBody.ok === true && JSON.stringify(firstBody.prefs) === JSON.stringify(emptyPrefs), JSON.stringify(firstBody.prefs))
  check('GET 不回绝对 patch 路径', !JSON.stringify(firstBody).includes('C:\\Users') && !(firstBody.patchFiles ?? []).some((p) => typeof p === 'string' && (p.includes(':') && p.length > 40)), JSON.stringify(firstBody.patchFiles))

  const prefs = { titles: { 'mcp-b': '我的名字' }, order: ['mcp-b', 'mcp-a'], collapsed: true, groupTitle: '我的组' }
  const saved = await handle(postRequest({ action: 'prefs', prefs }), home, undefined)
  const savedBody = await saved.json()
  check('POST prefs 返回保存后的偏好', saved.ok === true && JSON.stringify(savedBody.prefs) === JSON.stringify(prefs), JSON.stringify(savedBody))

  const reread = await handle(getRequest(), home, undefined)
  const rereadBody = await reread.json()
  check('GET 读回同一份偏好（跨请求持久）', JSON.stringify(rereadBody.prefs) === JSON.stringify(prefs), JSON.stringify(rereadBody.prefs))

  const state = await loadState(home)
  check('状态文件里确实落了盘', JSON.stringify(state.prefs) === JSON.stringify(prefs))

  const raw = JSON.parse(await readFile(join(home, 'mcp-toggle.json'), 'utf8'))
  check('落盘内容与诊断信息共存', typeof raw.loadedAt !== 'undefined' || typeof raw.prefs === 'object')

  // A later GET must not wipe the preferences it just read.
  await handle(getRequest(), home, undefined)
  const after = await handle(getRequest(), home, undefined)
  const afterBody = await after.json()
  check('连续 GET 不会清掉偏好', JSON.stringify(afterBody.prefs) === JSON.stringify(prefs), JSON.stringify(afterBody.prefs))

  // The knob's remembered direction has to survive POST -> file -> GET as a boolean,
  // in both directions. Runs after the checks above so it does not change their file.
  for (const value of [true, false]) {
    const latchSaved = await handle(postRequest({ action: 'prefs', prefs: { ...prefs, bulkOn: value } }), home, undefined)
    const latchBody = await latchSaved.json()
    const latchRead = await handle(getRequest(), home, undefined)
    const latchReadBody = await latchRead.json()
    check(`旋钮锁存 ${String(value)} 存盘并读回`,
      latchBody.prefs.bulkOn === value && latchReadBody.prefs.bulkOn === value,
      JSON.stringify(latchReadBody.prefs))
  }

  // The write race: a GET's diagnostics and a POST's preferences meet on the
  // same file. The serialised write chain must keep both.
  const racePrefs = { titles: { z: '并发写入' }, order: ['z'], collapsed: false, groupTitle: '' }
  await Promise.all([
    handle(getRequest(), home, undefined),
    handle(postRequest({ action: 'prefs', prefs: racePrefs }), home, undefined),
  ])
  await handle(getRequest(), home, undefined)
  const raced = await handle(getRequest(), home, undefined)
  const racedBody = await raced.json()
  check('GET 与 POST 并发时偏好不被覆盖', JSON.stringify(racedBody.prefs) === JSON.stringify(racePrefs), JSON.stringify(racedBody.prefs))

  // ---- rejection paths -----------------------------------------------------
  const unknown = await handle(postRequest({ action: 'nope' }), home, undefined)
  check('未知 action 被拒（400）', unknown.status === 400)
  const broken = await handle(postRequest('{not json'), home, undefined)
  check('坏 JSON 被拒（400）', broken.status === 400)
  const array = await handle(postRequest('[1,2]'), home, undefined)
  check('数组请求体被拒（400）', array.status === 400)
  const put = await handle({ method: 'PUT', headers: { get: () => null } }, home, undefined)
  check('PUT 被拒（405）', put.status === 405)

  const dirty = await handle(postRequest({ action: 'prefs', prefs: { titles: { x: '  保留  ' }, order: ['x', 9], collapsed: true, groupTitle: '  ' } }), home, undefined)
  const dirtyBody = await dirty.json()
  check('POST 会先清洗再落盘', dirtyBody.prefs.titles.x === '保留' && dirtyBody.prefs.order.length === 1 && dirtyBody.prefs.groupTitle === '', JSON.stringify(dirtyBody.prefs))
} finally {
  await rm(home, { recursive: true, force: true })
}


const { maskArg, candidatePatchFiles, profileDirFromPluginPath } = __test__
check('maskArg：Bearer 带空格脱敏', maskArg('Bearer ghp_LEAKME_ARG_ABCDEFGHIJKLMNOP') === 'Bearer <hidden>', maskArg('Bearer ghp_LEAKME_ARG_ABCDEFGHIJKLMNOP'))
check('maskArg：TOKEN= 仍脱敏', maskArg('TOKEN=abc').startsWith('TOKEN=') && maskArg('TOKEN=abc').includes('<hidden>'))
check('maskArg：普通短参数保留', maskArg('--stdio') === '--stdio')

// Dirty prefs on disk must be washed on GET.
const dirtyHome = await mkdtemp(join(tmpdir(), 'mcp-toggle-dirty-'))
try {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(dirtyHome, 'mcp-toggle.json'), JSON.stringify({
    prefs: { titles: { a: 1, b: '  ok  ' }, collapsed: 'yes', junk: true, order: [9, 'x'] },
  }), 'utf8')
  const washed = await (await handle(getRequest(), dirtyHome, undefined)).json()
  check('GET 回洗 prefs', washed.prefs.titles.a === undefined && washed.prefs.titles.b === 'ok' && washed.prefs.collapsed === false && washed.prefs.junk === undefined && JSON.stringify(washed.prefs.order) === JSON.stringify(['x']), JSON.stringify(washed.prefs))
} finally {
  await rm(dirtyHome, { recursive: true, force: true })
}

// Multi-profile: without env, plugin path not under profiles → scan; with DSH_PROFILE_DIR → only that profile.
const scanHome = await mkdtemp(join(tmpdir(), 'mcp-toggle-scan-'))
try {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const alpha = join(scanHome, 'profiles', 'alpha')
  const desk = join(scanHome, 'profiles', 'desktop')
  await mkdir(alpha, { recursive: true })
  await mkdir(desk, { recursive: true })
  const row = (id) => `- insert:\n  - id: ${id}\n    name: @deepseek-ai/dsh-mcp-client\n    config:\n      serverName: ${id}\n      transport: stdio\n      command: echo\n`
  await writeFile(join(alpha, 'cordis.patch.yml'), row('alpha-mcp'), 'utf8')
  await writeFile(join(desk, 'cordis.patch.yml'), row('desk-mcp'), 'utf8')
  const prevDir = process.env.DSH_PROFILE_DIR
  delete process.env.DSH_PROFILE_DIR
  delete process.env.DSH_PROFILE
  const all = await candidatePatchFiles(scanHome)
  check('无 profile 提示时回落扫描全部 profile', all.some((f) => f.includes('alpha')) && all.some((f) => f.includes('desktop')), JSON.stringify(all))
  process.env.DSH_PROFILE_DIR = desk
  const only = await candidatePatchFiles(scanHome)
  check('有 DSH_PROFILE_DIR 时只扫该 profile + home', only.length === 2 && only[0].includes('desktop') && !only.some((f) => f.includes('alpha')), JSON.stringify(only))
  if (prevDir === undefined) delete process.env.DSH_PROFILE_DIR
  else process.env.DSH_PROFILE_DIR = prevDir
  check('profileDirFromPluginPath 对非 profiles 路径返回 undefined', profileDirFromPluginPath() === undefined)
} finally {
  await rm(scanHome, { recursive: true, force: true })
}


console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
