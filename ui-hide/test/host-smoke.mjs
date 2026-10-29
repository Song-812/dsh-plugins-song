/**
 * Offline smoke test for dsh-ui-hide's host half.
 *
 * It imports the real lib/index.js and exercises the two functions the client
 * half depends on: normalizeConfig (the only place a config becomes trusted
 * CSS selectors) and readConfigFile (the file edge). No DSH, no network.
 *
 * Run: node test\host-smoke.mjs   (from the plugin folder)
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log(`PASS  ${name}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

const { __test__ } = await import('../lib/index.js')
const { normalizeConfig, readConfigFile } = __test__

// ---------------------------------------------------------------- normalizeConfig

const empty = normalizeConfig({})
check(
  '空配置默认开启且没有任何目标',
  empty.enabled === true && Array.isArray(empty.targets) && empty.targets.length === 0,
  JSON.stringify(empty),
)

const disabled = normalizeConfig({ enabled: false, targets: [{ id: 'a', selector: 'button.a' }] })
check('enabled:false 原样保留', disabled.enabled === false && disabled.targets.length === 1)

const kept = normalizeConfig({
  enabled: true,
  targets: [
    { id: ' more ', selector: ' nav button ', note: '  左侧栏更多  ' },
    { selector: '' },
    null,
    { id: 'inject', selector: 'div{x:y}' },
    { id: 'semi', selector: 'div;body' },
    { id: 'ok', selector: 'button[class*="viewsMore"]' },
  ],
})
check(
  '只保留合法条目并去掉首尾空白',
  kept.targets.length === 2 &&
    kept.targets[0].id === 'more' &&
    kept.targets[0].selector === 'nav button' &&
    kept.targets[0].note === '左侧栏更多' &&
    kept.targets[1].id === 'ok',
  JSON.stringify(kept),
)

const hostile = normalizeConfig({
  targets: [{ id: 'x', selector: 'a}body{display:block!important' }, { id: 'y', selector: 'a<b' }],
})
check('含花括号或尖括号的选择器全部丢弃', hostile.targets.length === 0, JSON.stringify(hostile))

const nonArray = normalizeConfig({ targets: { id: 'a', selector: 'b' } })
check('targets 不是数组时视为空', nonArray.targets.length === 0)

const overLimit = normalizeConfig({
  targets: Array.from({ length: 260 }, (_, i) => ({ id: `t${i}`, selector: `.t${i}` })),
})
check('目标数量有上限 200', overLimit.targets.length === 200, String(overLimit.targets.length))

// ---------------------------------------------------------------- readConfigFile

const dir = await mkdtemp(join(tmpdir(), 'ui-hide-test-'))
try {
  const missing = await readConfigFile(join(dir, 'nope.json'))
  check('文件不存在时回退默认配置', missing.enabled === true && missing.targets.length === 0)

  const goodPath = join(dir, 'good.json')
  await writeFile(goodPath, JSON.stringify({ enabled: false, targets: [{ id: 'a', selector: '.a' }] }), 'utf8')
  const good = await readConfigFile(goodPath)
  check('读取合法配置', good.enabled === false && good.targets.length === 1)

  const brokenPath = join(dir, 'broken.json')
  await writeFile(brokenPath, '{ not json', 'utf8')
  const broken = await readConfigFile(brokenPath)
  check('JSON 损坏时回退默认配置', broken.enabled === true && broken.targets.length === 0)
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\n所有检查通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
