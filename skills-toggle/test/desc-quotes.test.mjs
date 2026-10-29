// 简介里带引号 / 反斜杠时，写入与回读必须用同一套转义，不能被误判成“写坏了”而回滚。
// 2026-10-26 修：headerText 只剥外层引号、不解码转义，导致这类简介全部被回滚。
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { __test__ } from '../lib/index.js'

async function makeSkill() {
  const home = await mkdtemp(join(tmpdir(), 'skills-quotes-'))
  const dir = join(home, 'skills', 'demo')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'SKILL.md')
  await writeFile(
    file,
    '---\nname: demo\ndescription: "Original demo skill description."\n---\n\n# demo\n',
    'utf8',
  )
  return { home, file }
}

async function saveDescription(home, file, description) {
  const request = new Request('http://127.0.0.1/api/skills-toggle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'desc', file, description }),
  })
  const response = await __test__.handle(request, home)
  const payload = await response.json()
  return { status: response.status, result: payload.result, text: await readFile(file, 'utf8') }
}

test('带双引号的简介能保存成功，不被回滚', async (t) => {
  const { home, file } = await makeSkill()
  t.after(() => rm(home, { recursive: true, force: true }))

  const { result } = await saveDescription(home, file, '用于“示例”的 "工具"')
  assert.equal(result.status, 'applied')
  assert.match(result.description, /用于“示例”的 "工具"/)
})

test('带 Windows 路径反斜杠的简介能保存成功', async (t) => {
  const { home, file } = await makeSkill()
  t.after(() => rm(home, { recursive: true, force: true }))

  const { result } = await saveDescription(home, file, '包含路径 C:\\Users\\Example\\AI')
  assert.equal(result.status, 'applied')
  assert.match(result.description, /C:\\Users\\Example\\AI/)
})

test('引号和反斜杠同时出现也能存', async (t) => {
  const { home, file } = await makeSkill()
  t.after(() => rm(home, { recursive: true, force: true }))

  const { result } = await saveDescription(home, file, '两者都有 "C:\\temp\\x" 的简介')
  assert.equal(result.status, 'applied')
  assert.match(result.description, /"C:\\temp\\x"/)
})

// 2026-10-26 复核：任务描述的「先 \" 后 \\ 两遍替换对反斜杠紧跟引号解码错位、
// 含 \" 的简介永远回滚」在当前源码上不复现 —— 这个顺序对写入端的转义字母表
// （\\ 与 \"）恰好是正确的；旧版「headerText 不解码」的 bug 已在 2026-10-26 修掉
// （见本文件头注释）。以下用例守住这些组合的写入/读回往返（含 A\"B、C\\D、E\"F），
// 并为把 unquoteYaml 收敛成单遍解码提供等价性护栏。

test('简介含 A\"B（反斜杠紧跟引号）原样保存', async (t) => {
  const { home, file } = await makeSkill()
  t.after(() => rm(home, { recursive: true, force: true }))

  const { result } = await saveDescription(home, file, '前 A\\"B 后')
  assert.equal(result.status, 'applied')
  assert.equal(result.description, '前 A\\"B 后（Original demo skill description.）')
})

test('简介含 C\\D（双反斜杠）原样保存', async (t) => {
  const { home, file } = await makeSkill()
  t.after(() => rm(home, { recursive: true, force: true }))

  const { result } = await saveDescription(home, file, '前 C\\\\D 后')
  assert.equal(result.status, 'applied')
  assert.equal(result.description, '前 C\\\\D 后（Original demo skill description.）')
})

test('简介含 E\\"F（双反斜杠紧跟引号）原样保存，不回滚', async (t) => {
  const { home, file } = await makeSkill()
  t.after(() => rm(home, { recursive: true, force: true }))

  const { result } = await saveDescription(home, file, '前 E\\\\"F 后')
  assert.equal(result.status, 'applied')
  assert.equal(result.description, '前 E\\\\"F 后（Original demo skill description.）')
})

test('A\\"B、C\\\\D、E\\"F 三种组合混在一段简介里一次保存', async (t) => {
  const { home, file } = await makeSkill()
  t.after(() => rm(home, { recursive: true, force: true }))

  const description = 'A\\"B、C\\\\D、E\\\\"F 混合'
  const { result, text } = await saveDescription(home, file, description)
  assert.equal(result.status, 'applied')
  assert.equal(result.description, `${description}（Original demo skill description.）`)
  // 文件里落的必须是合法的双引号 YAML 标量（\\ 与 \" 均已转义）。
  assert.match(text, /description: ".*\\\\\\\\.*"/)
})
