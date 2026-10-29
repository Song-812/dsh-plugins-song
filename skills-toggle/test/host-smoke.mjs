/**
 * Offline round-trip test for dsh-skills-toggle's host half: POST prefs -> state
 * file -> GET prefs, the migration from the old `chatcutCollapsed` field, the
 * legacy `chatcut-collapse` action, the write race and the rejection paths. It
 * talks to the exported `handle` directly, so no DSH, HTTP server or restart is
 * involved, and it runs entirely inside a system temp directory.
 *
 * Run: node test\host-smoke.mjs   (from the plugin folder)
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log(`PASS  ${name}`)
  else { failures += 1; console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const hostUrl = new URL('../lib/index.js', import.meta.url)
const { __test__ } = await import(hostUrl.href)
const { handle, sanitizePrefs, defaultPrefs, loadState, queueWrite } = __test__

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

const EMPTY = { titles: {}, groupTitles: {}, order: {}, collapsed: {}, descs: {} }

// ---- sanitizer -------------------------------------------------------------
const clean = sanitizePrefs({
  titles: { 'C:/a/SKILL.md': '  名字  ', 'C:/b/SKILL.md': '', 'C:/c/SKILL.md': 42, 'C:/d/SKILL.md': 'x'.repeat(400) },
  groupTitles: { user: '  我的组  ', project: '   ', chatcut: 7, ['g'.repeat(400)]: '太长键' },
  order: { user: ['a', '', 7, 'b'], project: 'not-an-array', chatcut: ['c'] },
  collapsed: { user: true, project: false, chatcut: 'yes', bad: 1 },
  bulk: { user: true, project: false, chatcut: 'yes', ['g'.repeat(400)]: true },
  junk: { deep: true },
})
check('sanitizePrefs：名字去空白并保留', clean.titles['C:/a/SKILL.md'] === '名字')
check('sanitizePrefs：丢弃空值与非法类型', clean.titles['C:/b/SKILL.md'] === undefined && clean.titles['C:/c/SKILL.md'] === undefined)
check('sanitizePrefs：超长名字被截断到 200', clean.titles['C:/d/SKILL.md'].length === 200)
check('sanitizePrefs：组名去空白、非法键与非法类型被丢', clean.groupTitles.user === '我的组' && clean.groupTitles.project === undefined && clean.groupTitles.chatcut === undefined && Object.keys(clean.groupTitles).length === 1)
check('sanitizePrefs：order 只保留非空字符串数组', JSON.stringify(clean.order) === JSON.stringify({ user: ['a', 'b'], chatcut: ['c'] }), JSON.stringify(clean.order))
check('sanitizePrefs：collapsed 只认 true', JSON.stringify(clean.collapsed) === JSON.stringify({ user: true }), JSON.stringify(clean.collapsed))
check('sanitizePrefs：不认识的大字段被丢掉', clean.junk === undefined)
// The knob's latch: both booleans survive (a truthiness check would silently turn
// "remembered off" into "never clicked"), junk keys and junk values do not.
check('sanitizePrefs：旋钮锁存只认 true/false（false 也要留住）',
  clean.bulk.user === true && clean.bulk.project === false && clean.bulk.chatcut === undefined
    && clean.bulk['g'.repeat(400)] === undefined && Object.keys(clean.bulk).length === 2,
  JSON.stringify(clean.bulk))
check('sanitizePrefs：从没点过旋钮时不写 bulk 字段', !('bulk' in sanitizePrefs({ titles: {} })))
check('sanitizePrefs：完全非对象也安全', JSON.stringify(sanitizePrefs(null)) === JSON.stringify(EMPTY))
check('sanitizePrefs：数组体也安全', JSON.stringify(sanitizePrefs([1, 2])) === JSON.stringify(EMPTY))
check('sanitizePrefs：数量上限（titles ≤ 500，order ≤ 1000）', (() => {
  const many = {}
  for (let index = 0; index < 700; index += 1) many[`f${index}`] = `n${index}`
  const bounded = sanitizePrefs({ titles: many, order: { user: Array.from({ length: 1200 }, (unused, index) => `f${index}`) } })
  return Object.keys(bounded.titles).length === 500 && bounded.order.user.length === 1000
})(), JSON.stringify(Object.keys(sanitizePrefs({ titles: Object.fromEntries(Array.from({ length: 700 }, (unused, index) => [`f${index}`, `n${index}`])) }).titles).length))
check('defaultPrefs 是五张空表', JSON.stringify(defaultPrefs()) === JSON.stringify(EMPTY))

// ---- round trip ------------------------------------------------------------
const home = await mkdtemp(join(tmpdir(), 'skills-toggle-test-'))
try {
  const first = await handle(getRequest(), home)
  const firstBody = await first.json()
  check('GET 在全新 home 上返回 ok 与空 prefs', firstBody.ok === true && JSON.stringify(firstBody.prefs) === JSON.stringify(EMPTY), JSON.stringify(firstBody.prefs))
  check('GET 会带上 loadState 的 chatcutCollapsed=false', firstBody.chatcutCollapsed === false)

  const prefs = {
    titles: { 'C:/Users/x/.dsh/skills/alpha/SKILL.md': '阿尔法' },
    groupTitles: { user: '我的技能组', chatcut: '视频类' },
    order: { user: ['b.md', 'a.md'], __groups__: ['chatcut', 'user', 'project'] },
    collapsed: { user: true, chatcut: true },
  descs: {},
  }
  const saved = await handle(postRequest({ action: 'prefs', prefs }), home)
  const savedBody = await saved.json()
  check('POST prefs 返回保存后的偏好', saved.ok === true && JSON.stringify(savedBody.prefs) === JSON.stringify(prefs), JSON.stringify(savedBody.prefs))
  check('POST prefs 同时回写 chatcutCollapsed 镜像', savedBody.chatcutCollapsed === true)

  const reread = await handle(getRequest(), home)
  const rereadBody = await reread.json()
  check('GET 读回同一份偏好（跨请求持久）', JSON.stringify(rereadBody.prefs) === JSON.stringify(prefs), JSON.stringify(rereadBody.prefs))

  const state = await loadState(home)
  check('状态文件里确实落了盘', JSON.stringify(state.prefs) === JSON.stringify(prefs))
  const raw = JSON.parse(await readFile(join(home, 'skills-toggle.json'), 'utf8'))
  check('落盘内容与诊断信息共存', typeof raw.prefs === 'object' && typeof raw.diagnostics === 'object')
  check('落盘的 chatcutCollapsed 与 prefs.collapsed.chatcut 一致', raw.chatcutCollapsed === true)

  // A later GET must not wipe the preferences it just read.
  await handle(getRequest(), home)
  const after = await handle(getRequest(), home)
  const afterBody = await after.json()
  check('连续 GET 不会清掉偏好', JSON.stringify(afterBody.prefs) === JSON.stringify(prefs), JSON.stringify(afterBody.prefs))

  // The write race: a GET's diagnostics and a POST's preferences meet on the
  // same file. The serialised write chain must keep both.
  const racePrefs = { titles: { z: '并发写入' }, groupTitles: {}, order: { user: ['z'] }, collapsed: {}, descs: {} }
  await Promise.all([
    handle(getRequest(), home),
    handle(postRequest({ action: 'prefs', prefs: racePrefs }), home),
  ])
  await handle(getRequest(), home)
  const raced = await handle(getRequest(), home)
  const racedBody = await raced.json()
  check('GET 与 POST 并发时偏好不被覆盖', JSON.stringify(racedBody.prefs) === JSON.stringify(racePrefs), JSON.stringify(racedBody.prefs))

  // The same race in the other direction: a POST that lands first must not be
  // undone by a GET that was already in flight.
  const laterPrefs = { titles: { q: '后写' }, groupTitles: {}, order: {}, collapsed: { project: true }, descs: {} }
  await Promise.all([
    handle(postRequest({ action: 'prefs', prefs: laterPrefs }), home),
    handle(getRequest(), home),
    handle(postRequest({ action: 'list', roots: [] }), home),
  ])
  const settled = await (await handle(getRequest(), home)).json()
  check('POST 与 GET 交错时最后写入的偏好还在', JSON.stringify(settled.prefs) === JSON.stringify(laterPrefs), JSON.stringify(settled.prefs))

  // ---- legacy action and migration ----------------------------------------
  const legacy = await handle(postRequest({ action: 'chatcut-collapse', collapsed: true }), home)
  const legacyBody = await legacy.json()
  check('老动作 chatcut-collapse 仍然工作，并写进 prefs.collapsed.chatcut',
    legacy.ok === true && legacyBody.chatcutCollapsed === true && legacyBody.prefs.collapsed.chatcut === true, JSON.stringify(legacyBody.prefs))
  const legacyOff = await handle(postRequest({ action: 'chatcut-collapse', collapsed: false }), home)
  const legacyOffBody = await legacyOff.json()
  check('老动作关掉折叠会删掉那个键（而不是留 false）',
    legacyOffBody.prefs.collapsed.chatcut === undefined && legacyOffBody.chatcutCollapsed === false, JSON.stringify(legacyOffBody.prefs))

  // An old state file that only knew `chatcutCollapsed` keeps its value.
  const legacyHome = await mkdtemp(join(tmpdir(), 'skills-toggle-legacy-'))
  try {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(legacyHome, 'skills-toggle.json'), JSON.stringify({
      version: 1,
      files: { 'C:/x/SKILL.md': { model: { existed: false } } },
      projectRoots: [],
      chatcutCollapsed: true,
      chatcutToggle: {},
      diagnostics: {},
    }), 'utf8')
    const migrated = await (await handle(getRequest(), legacyHome)).json()
    check('老状态文件的 chatcutCollapsed 迁移到 prefs.collapsed.chatcut', migrated.prefs.collapsed.chatcut === true, JSON.stringify(migrated.prefs))
    const migratedFile = JSON.parse(await readFile(join(legacyHome, 'skills-toggle.json'), 'utf8'))
    check('迁移不丢原来的 files / projectRoots', migratedFile.files['C:/x/SKILL.md'] !== undefined && Array.isArray(migratedFile.projectRoots))
    check('迁移后老字段仍然写回（旧客户端半不丢折叠）', migratedFile.chatcutCollapsed === true)
    const savedPrefs = { titles: {}, groupTitles: {}, order: {}, collapsed: {}, descs: {} }
    const cleared = await (await handle(postRequest({ action: 'prefs', prefs: savedPrefs }), legacyHome)).json()
    check('显式保存空偏好会清掉迁移来的折叠', cleared.prefs.collapsed.chatcut === undefined && cleared.chatcutCollapsed === false)
  } finally {
    await rm(legacyHome, { recursive: true, force: true })
  }

  // ---- the write path: a key the author spelled out explicitly --------------
  // Turning "手动" ON for a skill whose file says `user-invocable: false` used to
  // paste that very line back, so the write changed nothing, the read-back still
  // said "off", and the change was rolled back as 写入后状态与预期不符.
  const skillsRoot = join(home, 'skills')
  const skillDir = join(skillsRoot, 'skill-creator')
  await mkdir(skillDir, { recursive: true })
  const skillFile = join(skillDir, 'SKILL.md')
  await writeFile(skillFile, [
    '---',
    'name: skill-creator',
    'description: |',
    '  Create or update reusable skills from validated conversations.',
    '  Do not use for ordinary editing tasks.',
    'user-invocable: false',
    '---',
    '',
    '# Skill Creator',
    '',
  ].join('\n'), 'utf8')

  const manualOn = await (await handle(postRequest({
    action: 'apply',
    roots: [skillsRoot],
    changes: [{ file: skillFile, key: 'manual', enabled: true }],
  }), home)).json()
  check('写死 user-invocable: false 的技能也能打开「手动」（不再被误判成需要回滚）',
    manualOn.results[0].status === 'applied', JSON.stringify(manualOn.results[0]))
  const manualOnText = await readFile(skillFile, 'utf8')
  check('打开手动写的是 user-invocable: true，且多行 description 原样保留',
    manualOnText.includes('user-invocable: true')
      && manualOnText.includes('description: |')
      && manualOnText.includes('  Do not use for ordinary editing tasks.'),
    manualOnText)

  const manualOff = await (await handle(postRequest({
    action: 'apply',
    roots: [skillsRoot],
    changes: [{ file: skillFile, key: 'manual', enabled: false }],
  }), home)).json()
  check('再关回去同样成功（写回 false）',
    manualOff.results[0].status === 'applied'
      && (await readFile(skillFile, 'utf8')).includes('user-invocable: false'),
    JSON.stringify(manualOff.results[0]))

  // The mirror image: the model key spells "off" the other way round.
  const modelDir = join(skillsRoot, 'model-off')
  await mkdir(modelDir, { recursive: true })
  const modelFile = join(modelDir, 'SKILL.md')
  await writeFile(modelFile, ['---', 'name: model-off', 'description: x', 'disable-model-invocation: true', '---', ''].join('\n'), 'utf8')
  const modelOn = await (await handle(postRequest({
    action: 'apply',
    roots: [skillsRoot],
    changes: [{ file: modelFile, key: 'model', enabled: true }],
  }), home)).json()
  check('写死 disable-model-invocation: true 的技能也能打开「模型」',
    modelOn.results[0].status === 'applied'
      && (await readFile(modelFile, 'utf8')).includes('disable-model-invocation: false'),
    JSON.stringify(modelOn.results[0]))

  // ---- rejection paths -----------------------------------------------------
  const unknown = await handle(postRequest({ action: 'nope' }), home)
  check('未知 action 被拒（400）', unknown.status === 400)
  const broken = await handle(postRequest('{not json'), home)
  check('坏 JSON 被拒（400）', broken.status === 400)
  const array = await handle(postRequest('[1,2]'), home)
  check('数组请求体被拒（400）', array.status === 400)
  const put = await handle({ method: 'PUT', headers: { get: () => null } }, home)
  check('PUT 被拒（405）', put.status === 405)
  const badCollapse = await handle(postRequest({ action: 'chatcut-collapse', collapsed: 'yes' }), home)
  check('chatcut-collapse 的非布尔值被拒（400）', badCollapse.status === 400)
  const noChanges = await handle(postRequest({ action: 'apply', changes: [] }), home)
  check('空 changes 被拒（400）', noChanges.status === 400)
  const badUrl = await handle(postRequest({ action: 'prefs', prefs: { titles: null, order: 7, collapsed: 'x' } }), home)
  const badUrlBody = await badUrl.json()
  check('脏 prefs 会被清洗后再落盘', badUrl.ok === true && JSON.stringify(badUrlBody.prefs) === JSON.stringify(EMPTY), JSON.stringify(badUrlBody.prefs))

  // A rejected request must not have changed anything that was already saved.
  const kept = await (await handle(getRequest(), home)).json()
  check('被拒的请求没有破坏已保存的偏好', JSON.stringify(kept.prefs) === JSON.stringify(EMPTY), JSON.stringify(kept.prefs))

  // ---- queue sanity --------------------------------------------------------
  const order = []
  await Promise.all([
    queueWrite(home, async () => { order.push('a1'); await new Promise((resolve) => setTimeout(resolve, 5)); order.push('a2') }),
    queueWrite(home, async () => { order.push('b1') }),
  ])
  check('queueWrite 按 home 严格串行', JSON.stringify(order) === JSON.stringify(['a1', 'a2', 'b1']), JSON.stringify(order))

  // 2026-10-17: `.agents/skills` is ChatCut Desktop's own skill folder. Scanning
  // it floods the model catalog with the 19 chatcut-* skills the owner keeps out
  // of DSH, so it must never become a managed root.
  const agentsRoot = join(home, '.agents', 'skills')
  const agentsSkillDir = join(agentsRoot, 'chatcut-video-gen')
  await mkdir(agentsSkillDir, { recursive: true })
  const agentsSkillFile = join(agentsSkillDir, 'SKILL.md')
  await writeFile(agentsSkillFile, ['---', 'name: video-gen', 'description: x', '---', ''].join('\n'), 'utf8')
  const agentsList = await (await handle(postRequest({ action: 'list', roots: [agentsRoot] }), home)).json()
  check('.agents/skills 不会被当成受管技能根（ChatCut 目录不再被扫）',
    agentsList.roots.every((item) => item.root !== agentsRoot)
      && agentsList.skills.every((skill) => skill.file !== agentsSkillFile),
    JSON.stringify(agentsList.roots))

  // 2026-10-17: the official bundled skills live in a real directory named
  // `office-skills` (no `skills` component). The panel must manage that root, or
  // the owner cannot switch the bundled Office skills off from the UI.
  const bundledRoot = join(home, 'resources', 'runtime', 'office-skills')
  const bundledSkillDir = join(bundledRoot, 'office-docx')
  await mkdir(bundledSkillDir, { recursive: true })
  const bundledSkillFile = join(bundledSkillDir, 'SKILL.md')
  await writeFile(bundledSkillFile, ['---', 'name: office-docx', 'description: x', '---', ''].join('\n'), 'utf8')
  const bundledList = await (await handle(postRequest({ action: 'list', roots: [bundledRoot] }), home)).json()
  check('官方自带目录（resources/runtime/office-skills）被当作受管根，面板可开关',
    bundledList.roots.some((item) => item.root === bundledRoot)
      && bundledList.skills.some((skill) => skill.file === bundledSkillFile),
    JSON.stringify(bundledList.roots))

  // Bare `office-skills` (wrong parents) must not be managed.
  const bareOffice = join(home, 'office-skills')
  await mkdir(join(bareOffice, 'office'), { recursive: true })
  await writeFile(join(bareOffice, 'office', 'SKILL.md'), ['---', 'name: office', 'description: x', '---', ''].join('\n'), 'utf8')
  const bareList = await (await handle(postRequest({ action: 'list', roots: [bareOffice] }), home)).json()
  check('任意同名 office-skills 不会被当成受管根',
    bareList.roots.every((item) => item.root !== bareOffice)
      && bareList.skills.every((skill) => !String(skill.file).startsWith(bareOffice)),
    JSON.stringify(bareList.roots))

  // Symlink skill dir must not accept writes that escape the managed root.
  const { symlink } = await import('node:fs/promises')
  const outside = join(home, 'outside-target')
  await mkdir(outside, { recursive: true })
  const outsideSkill = join(outside, 'SKILL.md')
  await writeFile(outsideSkill, ['---', 'name: escaped', 'description: x', '---', ''].join('\n'), 'utf8')
  const userSkills = join(home, 'skills')
  await mkdir(userSkills, { recursive: true })
  const linkDir = join(userSkills, 'escaped')
  let symlinkOk = false
  try {
    await symlink(outside, linkDir, 'dir')
    symlinkOk = true
  } catch (error) {
    check('symlink 探针：本环境无法建目录软链（跳过写穿断言）', true, String(error && error.message || error))
  }
  if (symlinkOk) {
    const linkFile = join(linkDir, 'SKILL.md')
    const before = await readFile(outsideSkill, 'utf8')
    const applyRes = await (await handle(postRequest({
      action: 'apply',
      changes: [{ file: linkFile, key: 'model', enabled: false }],
    }), home)).json()
    const after = await readFile(outsideSkill, 'utf8')
    const rejected = Array.isArray(applyRes.results) && applyRes.results[0] && applyRes.results[0].status === 'error'
    check('目录软链技能不可把开关写到根外', rejected && after === before, JSON.stringify(applyRes.results && applyRes.results[0]))
  }
} finally {
  await rm(home, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
