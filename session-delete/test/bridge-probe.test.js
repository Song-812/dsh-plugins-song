// 桥脚本的删前只读探测段：必须真在脚本里、必须跑在 SHFileOperation 之前、
// 探测事实必须写进结果 JSON，且整段（含调用点）都被 try/catch 包住 —— 探测绝不能让删除失败。
import assert from 'node:assert/strict'
import test from 'node:test'

import { RECYCLE_PS1 } from '../lib/recycle-bridge.js'

/** 探测函数体：从 function Probe-BinHealth 到 $result 初始化行为止。 */
function probeFunctionBody() {
  const start = RECYCLE_PS1.indexOf('function Probe-BinHealth')
  assert.ok(start >= 0, '桥脚本里找不到 Probe-BinHealth 探测函数')
  const end = RECYCLE_PS1.indexOf('$result = [ordered]', start)
  assert.ok(end > start, '找不到探测函数的结束边界')
  return RECYCLE_PS1.slice(start, end)
}

/** delete 分支（'delete' { 到 'restore' { 之间）。 */
function deleteBranch() {
  const start = RECYCLE_PS1.indexOf(`'delete' {`)
  const end = RECYCLE_PS1.indexOf(`'restore' {`)
  assert.ok(start >= 0 && end > start, '找不到 delete 分支的边界')
  return RECYCLE_PS1.slice(start, end)
}

test('探测段采集两项事实：BitBucket 卷键的 NukeOnDelete + SHQueryRecycleBin 应答', () => {
  const probe = probeFunctionBody()
  assert.match(probe, /BitBucket\\Volume/, '探测段没有读 BitBucket\\Volume 卷键')
  assert.match(probe, /NukeOnDelete/, '探测段没有读 NukeOnDelete')
  assert.match(probe, /SHQueryRecycleBin/, '探测段没有调 SHQueryRecycleBin')
})

test('卷 GUID 走 Get-Volume -DriveLetter 的 UniqueId（不拿 MountVolume 当身份）', () => {
  const probe = probeFunctionBody()
  assert.match(probe, /Get-Volume -DriveLetter/, '探测段没有用盘符取卷信息')
  assert.match(probe, /UniqueId/, '没有从 UniqueId 提取卷 GUID')
  assert.doesNotMatch(probe, /MountVolume/, 'MountVolume 是开关不是卷身份，不许拿来做比对')
})

test('探测段整体包在 try/catch 里：抛什么异常都只记 error，不许冒泡', () => {
  const probe = probeFunctionBody()
  const tryIdx = probe.indexOf('try {')
  const catchIdx = probe.indexOf('catch {')
  assert.ok(tryIdx >= 0 && catchIdx > tryIdx, '探测段没有 try/catch')
  assert.match(probe, /\$probe\.error =/, 'catch 里没有把异常记进探测事实')
})

test('delete 分支：探测跑在 Send-ToRecycleBin 之前，事实写进 $result.binProbe', () => {
  const branch = deleteBranch()
  const probeCall = branch.indexOf('Probe-BinHealth $present[0]')
  const sendCall = branch.indexOf('Send-ToRecycleBin $present')
  assert.ok(probeCall >= 0, 'delete 分支没有调用探测')
  assert.ok(sendCall >= 0, 'delete 分支没有调用 Send-ToRecycleBin')
  assert.ok(probeCall < sendCall, '探测必须跑在删除之前（删完再探就没有预警价值了）')
  assert.match(branch, /\$result\.binProbe/, 'delete 分支没有把探测事实写进结果 JSON')
})

test('delete 分支的探测调用点也包在 try/catch 里：桥自身算错也不许挡住删除', () => {
  const branch = deleteBranch()
  assert.match(branch, /try \{ \$result\.binProbe = Probe-BinHealth/, '探测调用点没有被 try 包住')
  assert.match(branch, /\} catch \{ \$result\.binProbe = @\{ error =/, '探测调用点没有兜底 catch')
})
