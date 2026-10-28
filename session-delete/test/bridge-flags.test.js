import assert from 'node:assert/strict'
import test from 'node:test'

import { RECYCLE_PS1 } from '../lib/recycle-bridge.js'

test('FO_DELETE 的标志里必须带 FOF_WANTNUKEWARNING(0x4000)：永久删除才可能被发现', () => {
  // 注意：审查证据里写的 0x40000 是笔误。SDK 头文件里 FOF_WANTNUKEWARNING = 0x4000；
  // SHFILEOPSTRUCT.fFlags 是 WORD（16 位），0x40000=bit18 根本放不下，
  // 赋值会当场抛 “Cannot convert value to UInt16”，整个删除流程报废（实测踩过）。
  const flagLine = RECYCLE_PS1.split('\n').find((line) => line.includes('$op.fFlags ='))
  assert.ok(flagLine, '桥脚本里找不到 fFlags 赋值行')
  assert.match(flagLine, /0x4000\b/, `fFlags 缺 FOF_WANTNUKEWARNING(0x4000)：${flagLine}`)
})

test('fFlags 里的每个标志都必须装得进 16 位（WORD）', () => {
  const flagLine = RECYCLE_PS1.split('\n').find((line) => line.includes('$op.fFlags ='))
  assert.ok(flagLine, '桥脚本里找不到 fFlags 赋值行')
  const values = [...flagLine.matchAll(/0x[0-9a-fA-F]+/g)].map((m) => Number.parseInt(m[0], 16))
  assert.ok(values.length >= 6, `fFlags 一行里没解析出完整的标志列表：${flagLine}`)
  for (const value of values) {
    assert.ok(value <= 0xFFFF, `标志 0x${value.toString(16)} 超出 WORD 范围，赋值会抛 UInt16 溢出`)
  }
})

test('delete 结果必须带回 permanent 字段，且不许写死 $false', () => {
  assert.match(RECYCLE_PS1, /\$result\.permanent/, '桥脚本没有输出 permanent 字段')
  // 写死成 false 正是这次要修的 bug：回收站被禁用/配额满时它其实已经永久删除了。
  assert.doesNotMatch(
    RECYCLE_PS1,
    /\$result\.permanent\s*=\s*\$false\s*$/,
    'permanent 被写死成 $false，回收站降级时就是对宿主说谎',
  )
})

test('permanent 的判据是「消失的路径有没有真的出现在回收站索引里」', () => {
  // 对账逻辑必须走 Read-Index（解析 $I 文件拿原始路径），不能凭 SHFileOperation 的返回码猜。
  // 只圈 delete 分支本身：restore/detect 也调 Read-Index，不能让它们替 delete 分支过关。
  const start = RECYCLE_PS1.indexOf(`'delete' {`)
  const end = RECYCLE_PS1.indexOf(`'restore' {`)
  assert.ok(start >= 0 && end > start, '找不到 delete 分支的边界')
  const deleteBranch = RECYCLE_PS1.slice(start, end)
  assert.match(deleteBranch, /Read-Index/, 'delete 分支没有回头查回收站索引')
  assert.match(deleteBranch, /\$result\.permanent/, 'delete 分支没有按对账结果写 permanent')
})
