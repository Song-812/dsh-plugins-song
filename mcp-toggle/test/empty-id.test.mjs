/**
 * 回归：patch 里出现 `- id:`（冒号后没有值）的行时，宿主半的 readMcpRows 曾
 * 因 `.exec(...)[1]` 对 null 取下标抛 TypeError，导致 GET /api/mcp-toggle
 * 整页崩掉。期望：跳过该行、计入 warnings、其余行照常解析，GET 返回 200。
 *
 * Run: node test\empty-id.test.mjs   (from the plugin folder)
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log(`PASS  ${name}`)
  else { failures += 1; console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const { __test__ } = await import(new URL('../lib/index.js', import.meta.url).href)
const { readMcpRows, handle } = __test__

const PATCH = [
  '# 好行',
  '- insert:',
  '  - id: mcp-good',
  '    name: "@deepseek-ai/dsh-mcp-client"',
  '    config:',
  '      transport: streamable-http',
  '      url: https://example.com/mcp',
  '',
  '# 坏行：冒号后没有值',
  '- insert:',
  '  - id:',
  '    name: "@deepseek-ai/dsh-mcp-client"',
  '    config:',
  '      transport: stdio',
  '      command: node',
  '',
].join('\n')

// ---- 单元层：readMcpRows 不许抛，坏行跳过并计入 warnings ------------------------
const unitWarnings = []
let unitRows
try {
  unitRows = readMcpRows(PATCH, unitWarnings)
  check('readMcpRows 遇到空值 id 行不抛异常', true)
} catch (error) {
  unitRows = []
  check('readMcpRows 遇到空值 id 行不抛异常', false, String(error && error.stack))
}
check('好行照常解析', unitRows.some((row) => row.id === 'mcp-good'), JSON.stringify(unitRows.map((row) => row.id)))
check('坏行被跳过（不产出空 id 条目）', !unitRows.some((row) => row.id === '' || row.id === undefined), JSON.stringify(unitRows.map((row) => row.id)))
check('坏行计入 warnings（带行号）',
  unitWarnings.length === 1 && /id/.test(unitWarnings[0]) && /第\s*\d+\s*行/.test(unitWarnings[0]),
  JSON.stringify(unitWarnings))
check('warnings 参数可省略（不传也不抛）', Array.isArray(readMcpRows('- insert:\n  - id: x\n    name: y\n')))

// ---- 端到端：GET 整页不崩，warnings 随响应返回 ----------------------------------
const home = await mkdtemp(join(tmpdir(), 'mcp-toggle-emptyid-home-'))
const profileDir = await mkdtemp(join(tmpdir(), 'mcp-toggle-emptyid-profile-'))
const previousProfileDir = process.env.DSH_PROFILE_DIR
const previousHome = process.env.DSH_HOME
process.env.DSH_PROFILE_DIR = profileDir
process.env.DSH_HOME = home
try {
  await writeFile(join(profileDir, 'cordis.patch.yml'), PATCH, 'utf8')
  const response = await handle({ method: 'GET', headers: { get: () => null } }, home, undefined)
  check('GET 返回 200（不再整页崩）', response.status === 200, String(response.status))
  const body = await response.json()
  check('响应 ok 且列出好行', body.ok === true && (body.servers ?? []).some((row) => row.id === 'mcp-good'), JSON.stringify(body.servers))
  check('响应 warnings 里报告了坏行（带文件名）',
    Array.isArray(body.warnings) && body.warnings.length === 1 && body.warnings[0].includes('cordis.patch.yml') && /id/.test(body.warnings[0]),
    JSON.stringify(body.warnings))
} finally {
  if (previousProfileDir === undefined) delete process.env.DSH_PROFILE_DIR
  else process.env.DSH_PROFILE_DIR = previousProfileDir
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
  await rm(profileDir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
