// 回收站索引必须扫各卷的 $Recycle.Bin，不能写死只看 C:；对账路径大小写不敏感。
import assert from 'node:assert/strict'
import test from 'node:test'

import { RECYCLE_PS1 } from '../lib/recycle-bridge.js'

function readIndexBody() {
  const start = RECYCLE_PS1.indexOf('function Read-Index')
  const end = RECYCLE_PS1.indexOf('function Send-ToRecycleBin')
  assert.ok(start >= 0 && end > start, '找不到 Read-Index 边界')
  return RECYCLE_PS1.slice(start, end)
}

function deleteBranch() {
  const start = RECYCLE_PS1.indexOf(`'delete' {`)
  const end = RECYCLE_PS1.indexOf(`'restore' {`)
  assert.ok(start >= 0 && end > start, '找不到 delete 分支边界')
  return RECYCLE_PS1.slice(start, end)
}

test('桥脚本提供 Get-RecycleBinRoots：按盘符枚举各卷 $Recycle.Bin', () => {
  assert.match(RECYCLE_PS1, /function Get-RecycleBinRoots/, '缺少 Get-RecycleBinRoots')
  assert.match(RECYCLE_PS1, /DriveInfo\]::GetDrives\(\)/, '没有枚举本机盘符')
  assert.match(RECYCLE_PS1, /Recycle\.Bin/, '没有拼 $Recycle.Bin')
})

test('Read-Index 遍历 Get-RecycleBinRoots，而不是单一 $binRoot = C:\\…', () => {
  const body = readIndexBody()
  assert.match(body, /foreach \(\$binRoot in \(Get-RecycleBinRoots\)\)/, 'Read-Index 没有遍历各卷回收站')
  // 顶层不再写死唯一 $binRoot；C: 只允许作为 Get-RecycleBinRoots 的兜底。
  assert.doesNotMatch(
    RECYCLE_PS1.split('function Get-RecycleBinRoots')[0],
    /\$binRoot\s*=\s*'C:/,
    '脚本开头仍写死 $binRoot = C:…',
  )
})

test('permanent 对账使用大小写不敏感集合', () => {
  const branch = deleteBranch()
  assert.match(branch, /OrdinalIgnoreCase/, 'permanent 对账未使用 IgnoreCase')
  assert.match(branch, /HashSet\[string\]/, 'permanent 对账未用 HashSet')
})
