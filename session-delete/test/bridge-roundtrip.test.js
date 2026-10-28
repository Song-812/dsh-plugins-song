// 真跑一次回收站桥：建临时目录 → 删除 → 还原 → 清理。
// 无 powershell.exe 时 skip（本仓库在 Linux CI / 非 Windows 上常见）；有则失败必须让测试变红。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile, execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import { RECYCLE_PS1 } from '../lib/recycle-bridge.js'

const run = promisify(execFile)

function hasPowershell() {
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], {
      timeout: 15000,
      windowsHide: true,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

const powershellOk = hasPowershell()

test('回收站桥往返：删除进回收站再按原路径还原', { skip: powershellOk ? false : '需要 Windows 上的 powershell.exe' }, async (t) => {
  const work = join(tmpdir(), `dsh-session-delete-bridge-roundtrip-${process.pid}`)
  t.after(async () => { await rm(work, { recursive: true, force: true }) })

  const payload = join(work, `payload-rt-${process.pid}`)
  const script = join(work, 'recycle.ps1')
  await mkdir(payload, { recursive: true })
  await writeFile(join(payload, 'a.txt'), 'hello', 'utf8')
  await writeFile(script, '\uFEFF' + RECYCLE_PS1, 'utf8')

  async function callBridge(action, paths) {
    const inFile = join(work, `in-${action}.json`)
    const outFile = join(work, `out-${action}.json`)
    await writeFile(inFile, JSON.stringify({ action, paths }), 'utf8')
    await run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, '-In', inFile, '-Out', outFile,
    ], { timeout: 120000, windowsHide: true })
    return JSON.parse(await readFile(outFile, 'utf8'))
  }

  const deleted = await callBridge('delete', [payload])
  assert.equal(deleted.ok, true, `删除失败：${deleted.error}`)
  assert.equal(existsSync(payload), false, 'payload 应已离开磁盘')
  assert.equal(deleted.permanent, false, `正常回收不该报永久删除：${JSON.stringify(deleted)}`)

  const restored = await callBridge('restore', [payload])
  assert.equal(restored.ok, true, `还原失败：${restored.error}`)
  assert.equal(existsSync(payload), true, '还原后 payload 应回到磁盘')
})
