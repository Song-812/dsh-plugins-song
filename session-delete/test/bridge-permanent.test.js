// 真跑一次回收站桥（与 bridge-roundtrip.mjs 同一条路），但带上断言：
// 正常回收时结果必须有 permanent 字段且为 false —— 真的进了回收站才许这么说。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile, execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import { RECYCLE_PS1 } from '../lib/recycle-bridge.js'
import { decideBinStatus } from '../lib/bin-status.js'

const run = promisify(execFile)
const work = join(tmpdir(), `dsh-session-delete-bridge-permanent-${process.pid}`)

function hasPowershell() {
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], {
      timeout: 15000, windowsHide: true, stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}
const powershellOk = hasPowershell()

async function callBridge(script, action, paths) {
  const inFile = join(work, `in-${action}.json`)
  const outFile = join(work, `out-${action}.json`)
  await writeFile(inFile, JSON.stringify({ action, paths }), 'utf8')
  await run('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', script, '-In', inFile, '-Out', outFile,
  ], { timeout: 120000, windowsHide: true })
  return JSON.parse(await readFile(outFile, 'utf8'))
}

test('正常回收时 permanent 为 false：路径确实躺在回收站里，可以还原', { skip: powershellOk ? false : '需要 Windows 上的 powershell.exe' }, async (t) => {
  t.after(async () => { await rm(work, { recursive: true, force: true }) })
  // 叶子名要全局独特：桥的 restore 按「原始路径或叶子名」匹配回收站条目，
  // 并行跑的 bridge-roundtrip.mjs 用的是 payload —— 撞名会被它顺手捞走（实测踩过）。
  const payload = join(work, `payload-perm-${process.pid}`)
  const script = join(work, 'recycle.ps1')
  await mkdir(payload, { recursive: true })
  await writeFile(join(payload, 'a.txt'), 'hello', 'utf8')
  await writeFile(script, '\uFEFF' + RECYCLE_PS1, 'utf8')

  const deleted = await callBridge(script, 'delete', [payload])
  assert.equal(deleted.ok, true, `删除失败：${deleted.error}`)
  assert.equal('permanent' in deleted, true, `delete 结果缺 permanent 字段：${JSON.stringify(deleted)}`)
  assert.equal(deleted.permanent, false, `正常回收不该报永久删除：${JSON.stringify(deleted)}`)
  assert.equal(existsSync(payload), false, 'payload 应该已经离开磁盘')

  // 删前只读探测的事实必须如实回传，且本机（回收站正常、NukeOnDelete 未启用）判得 ok。
  assert.equal('binProbe' in deleted, true, `delete 结果缺 binProbe 探测事实：${JSON.stringify(deleted)}`)
  const probe = deleted.binProbe
  assert.ok(probe !== null && typeof probe === 'object', `binProbe 不是对象：${JSON.stringify(deleted)}`)
  assert.equal(probe.error, '', `探测段不该有异常：${JSON.stringify(probe)}`)
  assert.match(String(probe.volumeGuid), /^\{[0-9a-f-]{36}\}$/i, `卷 GUID 形状不对：${JSON.stringify(probe)}`)
  assert.ok(probe.nukeOnDelete === null || typeof probe.nukeOnDelete === 'number', `NukeOnDelete 不是数字也不是空：${JSON.stringify(probe)}`)
  assert.equal(probe.recycleQueryOk, true, `本机回收站正常应答，SHQueryRecycleBin 不该失败：${JSON.stringify(probe)}`)
  assert.equal(decideBinStatus(probe), 'ok', `本机实测 binStatus 应为 ok：${JSON.stringify(probe)}`)

  const restored = await callBridge(script, 'restore', [payload])
  assert.equal(restored.ok, true, `还原失败：${restored.error}`)
  assert.equal(existsSync(payload), true, '还原后 payload 应该回到磁盘')
})
