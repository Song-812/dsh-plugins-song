import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadWhitelist, addHost, matchesHost, covers } from '../lib/whitelist.js'

async function tempFilePath(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-proxy-connect-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return join(dir, 'whitelist.json')
}

/** 捕获 console.warn：「首读损坏要打印醒目警告」这条要求里，警告内容本身就是被测行为。 */
function captureWarnings() {
  const lines = []
  const original = console.warn
  console.warn = (...args) => {
    lines.push(args.join(' '))
  }
  lines.restore = () => {
    console.warn = original
  }
  return lines
}

test('文件不存在时返回空集合', async (t) => {
  const file = await tempFilePath(t)
  const hosts = await loadWhitelist(file)
  assert.equal(hosts.size, 0)
})

test('登记一个域名后能读回来', async (t) => {
  const file = await tempFilePath(t)
  await addHost(file, 'www.google.com')
  const hosts = await loadWhitelist(file)
  assert.ok(hosts.has('www.google.com'))
})

test('重复登记同一域名只保留一条', async (t) => {
  const file = await tempFilePath(t)
  await addHost(file, 'www.google.com')
  await addHost(file, 'www.google.com')
  const hosts = await loadWhitelist(file)
  assert.equal(hosts.size, 1)
})

test('内容损坏时当作空集合，不抛错', async (t) => {
  const file = await tempFilePath(t)
  await writeFile(file, '{ this is not json', 'utf8')
  // 没有上一份好名单可沿用时按空名单处理，但会打印醒目警告——这里只静音、不断言。
  const warnings = captureWarnings()
  try {
    const hosts = await loadWhitelist(file)
    assert.equal(hosts.size, 0)
  } finally {
    warnings.restore()
  }
})

test('顶层不是数组时当作空集合', async (t) => {
  const file = await tempFilePath(t)
  await writeFile(file, '{"hosts":["a.com"]}', 'utf8')
  const warnings = captureWarnings()
  try {
    const hosts = await loadWhitelist(file)
    assert.equal(hosts.size, 0)
  } finally {
    warnings.restore()
  }
})

test('读进来时统一小写并去掉前导点', async (t) => {
  const file = await tempFilePath(t)
  await writeFile(file, JSON.stringify(['API.OpenAI.com', '.ChatGPT.com']), 'utf8')
  const hosts = await loadWhitelist(file)
  assert.deepEqual([...hosts].sort(), ['api.openai.com', 'chatgpt.com'])
})

test('文件里的非字符串与空串被丢掉', async (t) => {
  const file = await tempFilePath(t)
  await writeFile(file, JSON.stringify(['a.com', 42, '', null]), 'utf8')
  const hosts = await loadWhitelist(file)
  assert.deepEqual([...hosts], ['a.com'])
})

test('登记时也归一化，大小写不同不会重复', async (t) => {
  const file = await tempFilePath(t)
  await addHost(file, 'API.OpenAI.com')
  await addHost(file, 'api.openai.com')
  assert.deepEqual([...await loadWhitelist(file)], ['api.openai.com'])
})

test('域名匹配按标签边界：子域名命中，形近的不命中', () => {
  assert.equal(matchesHost('api.openai.com', 'openai.com'), true)
  assert.equal(matchesHost('API.OpenAI.com', 'openai.com'), true)
  assert.equal(matchesHost('notopenai.com', 'openai.com'), false)
  assert.equal(matchesHost('api.openai.com.evil.test', 'openai.com'), false)
  assert.equal(matchesHost('', 'openai.com'), false)
  assert.equal(matchesHost('api.openai.com', ''), false)
})

test('covers 判断名单里是否有条目覆盖某主机', () => {
  const whitelist = new Set(['openai.com', 'www.google.com'])
  assert.equal(covers(whitelist, 'api.openai.com'), true)
  assert.equal(covers(whitelist, 'deepseek.com'), false)
  assert.equal(covers(new Set(), 'api.openai.com'), false)
})
test('名单文件坏了时，登记会抛错且绝不覆盖原文件', async (t) => {
  const file = await tempFilePath(t)
  const broken = '{ this is not json'
  await writeFile(file, broken, 'utf8')
  await assert.rejects(() => addHost(file, 'a.example.com'))
  assert.equal(await readFile(file, 'utf8'), broken)
})

test('并发登记不同域名时，三条都要在（读改写串行）', async (t) => {
  const file = await tempFilePath(t)
  await Promise.all([
    addHost(file, 'a.example.com'),
    addHost(file, 'b.example.com'),
    addHost(file, 'c.example.com'),
  ])
  const hosts = await loadWhitelist(file)
  assert.deepEqual([...hosts].sort(), ['a.example.com', 'b.example.com', 'c.example.com'])
})

// —— 「坏文件 → 沿用上一份好名单」：README 承诺写坏/暂时不存在都保留上一份，
//    抓网页那条路（每次 fetch 重读）以前静默掉回空名单，敏感域名会先走直连。——

test('名单文件写坏时沿用上一份好名单，不掉回空名单', async (t) => {
  const file = await tempFilePath(t)
  await writeFile(file, JSON.stringify(['openai.com']), 'utf8')
  const good = await loadWhitelist(file)
  assert.ok(good.has('openai.com'))

  await writeFile(file, '{ 写坏了', 'utf8')
  const hosts = await loadWhitelist(file)
  assert.ok(hosts.has('openai.com'), '文件写坏后应沿用上一份好名单')
})

test('名单文件暂时不存在时也沿用上一份好名单', async (t) => {
  const file = await tempFilePath(t)
  await writeFile(file, JSON.stringify(['openai.com']), 'utf8')
  await loadWhitelist(file)

  await rm(file)
  const hosts = await loadWhitelist(file)
  assert.ok(hosts.has('openai.com'), '文件暂时不存在时应沿用上一份好名单')
})

test('首读就损坏时（没有好名单可沿用），打印含文件路径与错误的醒目警告', async (t) => {
  const file = await tempFilePath(t)
  await writeFile(file, '{ 写坏了', 'utf8')
  const warnings = captureWarnings()
  try {
    const hosts = await loadWhitelist(file)
    assert.equal(hosts.size, 0)
  } finally {
    warnings.restore()
  }
  const text = warnings.join('\n')
  assert.ok(text.includes(file), `警告里应含文件路径，实际：${text}`)
  assert.match(text, /损坏/)
})

test('登记成功后文件再写坏时，上一份好名单里有刚登记的域名', async (t) => {
  const file = await tempFilePath(t)
  await addHost(file, 'www.google.com')

  await writeFile(file, '{ 写坏了', 'utf8')
  const hosts = await loadWhitelist(file)
  assert.ok(hosts.has('www.google.com'), '刚登记进文件的域名不该因一次坏写丢失')
})