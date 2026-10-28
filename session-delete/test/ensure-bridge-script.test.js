// ensureBridgeScript：TEMP 里的 recycle.ps1 不能「存在就复用」——
// 插件升级后旧脚本还在盘上，会拿旧逻辑去删文件。内容不一致必须覆盖写。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

// 隔离临时目录：os.tmpdir() 每次调用都读环境变量，必须在首次调用前设好。
const isolatedTmp = join(process.env.TEMP ?? 'C:\\', `dsh-session-delete-test-${process.pid}`)
process.env.TMPDIR = isolatedTmp
process.env.TEMP = isolatedTmp
process.env.TMP = isolatedTmp

const { RECYCLE_PS1 } = await import('../lib/recycle-bridge.js')
const { __test__ } = await import('../lib/index.js')

const BRIDGE_SCRIPT = '\uFEFF' + RECYCLE_PS1

test.after(async () => {
  await rm(isolatedTmp, { recursive: true, force: true })
})

test('盘上的桥脚本内容过期时会被覆盖更新（不能存在就复用）', async () => {
  const file = await __test__.ensureBridgeScript()
  await writeFile(file, 'stale recycle.ps1 left by an older build', 'utf8')

  const again = await __test__.ensureBridgeScript()

  assert.equal(again, file)
  assert.equal(await readFile(file, 'utf8'), BRIDGE_SCRIPT, '过期脚本没有被更新成当前内容')
})

test('内容一致时不重写：沿用原文件，省一次 IO', async () => {
  const file = await __test__.ensureBridgeScript()
  const old = new Date('2020-01-01T00:00:00Z')
  await utimes(file, old, old)

  await __test__.ensureBridgeScript()

  assert.equal((await stat(file)).mtimeMs, old.getTime(), '内容一致却重写了脚本（白费 IO）')
})

test('脚本文件被系统清掉后自动重建，且带 UTF-8 BOM', async () => {
  const file = await __test__.ensureBridgeScript()
  await rm(file)

  const again = await __test__.ensureBridgeScript()

  assert.equal(existsSync(again), true)
  assert.equal(await readFile(again, 'utf8'), BRIDGE_SCRIPT)
})
