/**
 * 会话行「…」菜单触发器定位的纯逻辑测试（无 DOM、无第三方依赖）。
 *
 * 为什么抽出来：原实现 openRename 用 row.querySelector("button") 取行内第一个
 * button 当菜单触发器。一旦本插件的重命名按钮（.ui-hide-rowAction）渲染顺序排到
 * 最前面，trigger.click() 就会点到它自己 → 同步无限递归 → RangeError 崩掉整列表。
 *
 * 修法：定位改为「优先 aria-haspopup，其次 aria-label 含『操作』，显式排除
 * .ui-hide-rowAction」，用一个纯函数按按钮属性数组选出下标，找不到就返回 -1。
 * 这里只测这个纯函数的三类输入：重命名按钮在前 / 触发器在前 / 无可匹配。
 *
 * Run: node test\trigger-pick.mjs   (from the plugin folder)
 */
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const CLIENT = new URL('../lib/client.js', import.meta.url)

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log(`PASS  ${name}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

/** Load lib/client.js the way the browser module loader does, and read __test__. */
async function loadTestExports() {
  const code = await readFile(CLIENT, 'utf8')
  let definition = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (next) => { definition = next } } },
    document: { head: { appendChild() {} }, createElement: () => ({ remove() {} }), getElementById: () => null },
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  if (definition === null) throw new Error('bundle did not call __ModuleLoader__.load')
  const react = { createElement: () => null }
  return definition.factory(() => react).__test__ ?? {}
}

// 由 lib/client.js 导出的纯函数；RED 阶段它还不存在，先按期望签名写测试。
const { pickTriggerIndex } = await loadTestExports()

const RENAME = { className: 'ui-hide-rowAction', attrs: { 'aria-label': '重命名会话' } }
const TRIGGER_POPUP = { className: 'row-more', attrs: { 'aria-haspopup': 'true' } }
const TRIGGER_LABEL = { className: 'row-actions', attrs: { 'aria-label': '会话操作' } }
const UNRELATED = { className: 'row-star', attrs: { 'aria-label': '收藏' } }

check('导出 pickTriggerIndex 纯函数', typeof pickTriggerIndex === 'function')

if (typeof pickTriggerIndex === 'function') {
  // 用例一：重命名按钮排在最前（原先会自己点自己、无限递归）。必须跳过它。
  check(
    '重命名按钮在最前时，跳过它并选中触发器',
    pickTriggerIndex([RENAME, TRIGGER_POPUP]) === 1,
    `→ 选中了 ${pickTriggerIndex([RENAME, TRIGGER_POPUP])}，应为 1`,
  )

  // 用例二：触发器在前（正常顺序）。选中它。
  check(
    '触发器在最前时，直接选中它',
    pickTriggerIndex([TRIGGER_POPUP, RENAME]) === 0,
    `→ 选中了 ${pickTriggerIndex([TRIGGER_POPUP, RENAME])}，应为 0`,
  )

  // 用例三：没有任何可匹配的按钮。返回 -1（调用方放弃并 warn，不点击）。
  check(
    '没有可匹配的触发器时返回 -1',
    pickTriggerIndex([UNRELATED, RENAME]) === -1,
    `→ 返回了 ${pickTriggerIndex([UNRELATED, RENAME])}，应为 -1`,
  )

  // 补充：aria-label 含「操作」也算合法触发器（aria-haspopup 缺席时的兜底）。
  check(
    'aria-label 含「操作」时也认作触发器',
    pickTriggerIndex([RENAME, TRIGGER_LABEL]) === 1,
    `→ 选中了 ${pickTriggerIndex([RENAME, TRIGGER_LABEL])}，应为 1`,
  )

  // 补充：空数组 / 非数组输入不崩，返回 -1。
  check('空数组返回 -1', pickTriggerIndex([]) === -1)
  check('非数组输入返回 -1（不抛错）', (() => {
    try { return pickTriggerIndex(null) === -1 } catch { return false }
  })())
}

console.log(failures === 0 ? '\n所有检查通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
