// 一次性验证：回收站桥能不能真的把目录送进回收站、并按原路径还回来。
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { RECYCLE_PS1 } from '../lib/recycle-bridge.js'

const run = promisify(execFile)
const work = join(tmpdir(), 'dsh-session-delete-bridge-test')
const payload = join(work, 'payload')
const script = join(work, 'recycle.ps1')

async function callBridge(action, paths) {
  const inFile = join(work, `in-${action}.json`)
  const outFile = join(work, `out-${action}.json`)
  await writeFile(inFile, JSON.stringify({ action, paths }), 'utf8')
  try {
    await run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, '-In', inFile, '-Out', outFile,
    ], { timeout: 120000, windowsHide: true })
  } catch (error) {
    return { ok: false, error: String(error.message) }
  }
  const text = await readFile(outFile, 'utf8')
  return JSON.parse(text)
}

await mkdir(payload, { recursive: true })
await writeFile(join(payload, 'a.txt'), 'hello', 'utf8')
await writeFile(script, '\uFEFF' + RECYCLE_PS1, 'utf8')

const deleted = await callBridge('delete', [payload])
console.log('delete =>', JSON.stringify(deleted))
console.log('payload gone?', !existsSync(payload))

const restored = await callBridge('restore', [payload])
console.log('restore =>', JSON.stringify(restored))
console.log('payload back?', existsSync(payload))

await rm(work, { recursive: true, force: true })
