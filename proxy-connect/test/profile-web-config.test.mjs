/**
 * 「改 `web` 那行的 fetchProvider」这件事的行为契约。
 *
 * 两个方向、两套要求：
 *   claim    —— 启用时把配置指向本插件，行不存在时**要补上**（否则网页那半会静默留在
 *               内置抓取器上）；
 *   handBack —— 停用时交还内置实现，只在当前值确实是我们时才改，**绝不新增行**。
 *
 * 为什么两个方向都可能走文件：停用/启用动作本身发生在 DSH 的 HMR 事务里，
 * 在事务里调 configEditor 会报
 *   HMR transactions cannot be nested
 * （2026-10-14 关的那次实测、2026-10-17 开的那次实测），失败会把配置停在旧值 ——
 * 关的时候网页整个坏掉，开的时候网页静默不走代理。改文件不受那层限制。
 *
 * 文本变换是纯函数，所以能逐字断言「只改该改的地方、别的一个字都不动」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  claimFetchProviderInFile,
  claimFetchProviderInText,
  handBackFetchProviderInFile,
  handBackFetchProviderInText,
  resolvePatchFilePath,
} from '../lib/profile-web-config.js'

const OURS = 'proxy-connect'
const BUILTIN = 'http'

const PROFILE = `- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: openai
    model: gpt-6.1-sol
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: deepseek-official
    fetchProvider: proxy-connect
- id: dsh-proxy-connect
  disabled: false
`

const PROFILE_WITH_BUILTIN = PROFILE.replace('fetchProvider: proxy-connect', 'fetchProvider: http')

const PROFILE_WITHOUT_PROVIDER = `- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: deepseek-official
- id: other
  disabled: false
`

function linesOf(text) {
  return text.split('\n')
}

test('交还：把 web 段的 fetchProvider 改回内置实现', () => {
  const { text, changed } = handBackFetchProviderInText(PROFILE, { from: OURS, to: BUILTIN })
  assert.equal(changed, true)
  assert.match(text, /fetchProvider: http/)
  assert.doesNotMatch(text, /fetchProvider: proxy-connect/)
})

test('交还：除那一行外逐字不变', () => {
  const { text } = handBackFetchProviderInText(PROFILE, { from: OURS, to: BUILTIN })
  const before = linesOf(PROFILE)
  const after = linesOf(text)
  assert.equal(after.length, before.length)
  for (let i = 0; i < before.length; i += 1) {
    if (before[i].includes('fetchProvider')) continue
    assert.equal(after[i], before[i], `第 ${i + 1} 行不该变`)
  }
})

test('交还：已经是内置实现时什么都不做', () => {
  const { text, changed } = handBackFetchProviderInText(PROFILE_WITH_BUILTIN, { from: OURS, to: BUILTIN })
  assert.equal(changed, false)
  assert.equal(text, PROFILE_WITH_BUILTIN)
})

test('交还：指向别的抓取器时不动它', () => {
  const other = PROFILE.replace('fetchProvider: proxy-connect', 'fetchProvider: someone-else')
  const { text, changed } = handBackFetchProviderInText(other, { from: OURS, to: BUILTIN })
  assert.equal(changed, false)
  assert.equal(text, other)
})

test('交还：行不存在时不新增（没写就代表内置）', () => {
  const { text, changed } = handBackFetchProviderInText(PROFILE_WITHOUT_PROVIDER, { from: OURS, to: BUILTIN })
  assert.equal(changed, false)
  assert.equal(text, PROFILE_WITHOUT_PROVIDER)
})

test('交还：没有 web 段时什么都不做', () => {
  const noWeb = '- id: something-else\n  config:\n    fetchProvider: proxy-connect\n'
  const { text, changed } = handBackFetchProviderInText(noWeb, { from: OURS, to: BUILTIN })
  assert.equal(changed, false)
  assert.equal(text, noWeb)
})

test('交还：只改 web 段，别的段里的同名键不碰', () => {
  const twoSections = `- id: other
  config:
    fetchProvider: proxy-connect
- id: web
  config:
    fetchProvider: proxy-connect
`
  const { text } = handBackFetchProviderInText(twoSections, { from: OURS, to: BUILTIN })
  const occurrences = [...text.matchAll(/fetchProvider: (\S+)/g)].map((m) => m[1])
  assert.deepEqual(occurrences, ['proxy-connect', 'http'])
})

test('交还：认得 include:web 这种行标识', () => {
  const includeForm = '- id: include:web\n  config:\n    fetchProvider: proxy-connect\n'
  const { text, changed } = handBackFetchProviderInText(includeForm, { from: OURS, to: BUILTIN })
  assert.equal(changed, true)
  assert.match(text, /fetchProvider: http/)
})

test('交还：缩进与行尾注释保留', () => {
  const indented = '- id: web\n  config:\n      fetchProvider: proxy-connect # 插件接管\n'
  const { text } = handBackFetchProviderInText(indented, { from: OURS, to: BUILTIN })
  assert.match(text, /\n {6}fetchProvider: http # 插件接管\n/)
})

test('接管：把内置实现改成自己', () => {
  const { text, changed } = claimFetchProviderInText(PROFILE_WITH_BUILTIN, { from: BUILTIN, to: OURS })
  assert.equal(changed, true)
  assert.match(text, /fetchProvider: proxy-connect/)
  assert.match(text, /searchProvider: deepseek-official/)
})

test('接管：当前层没有这一行时补在 config 下面（缩进对齐）', () => {
  const { text, changed } = claimFetchProviderInText(PROFILE_WITHOUT_PROVIDER, { from: BUILTIN, to: OURS })
  assert.equal(changed, true)
  assert.equal(
    text,
    `- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: deepseek-official
    fetchProvider: proxy-connect
- id: other
  disabled: false
`,
  )
})

test('接管：已经指向自己时什么都不做', () => {
  const { text, changed } = claimFetchProviderInText(PROFILE, { from: BUILTIN, to: OURS })
  assert.equal(changed, false)
  assert.equal(text, PROFILE)
})

test('接管：指向别的抓取器时不抢（不是内置值就不动）', () => {
  const other = PROFILE.replace('fetchProvider: proxy-connect', 'fetchProvider: someone-else')
  const { text, changed } = claimFetchProviderInText(other, { from: BUILTIN, to: OURS })
  assert.equal(changed, false)
  assert.equal(text, other)
})

test('接管：没有 web 段时不新增任何东西', () => {
  const noWeb = '- id: other\n  config:\n    a: 1\n'
  const { text, changed } = claimFetchProviderInText(noWeb, { from: BUILTIN, to: OURS })
  assert.equal(changed, false)
  assert.equal(text, noWeb)
})

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'proxy-connect-web-config-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/**
 * 假文件系统：readFile 按剧本吐内容（用完重复最后一个），writeFile/rename
 * 只记录不落盘。用来模拟「读与改名之间，DSH 自己也在写这个文件」的并发窗口。
 */
function scriptedIo(script) {
  const writes = []
  const renames = []
  let reads = 0
  return {
    io: {
      async readFile() {
        const value = script[Math.min(reads, script.length - 1)]
        reads += 1
        return value
      },
      async writeFile(path, data) {
        writes.push({ path, data })
      },
      async rename(from, to) {
        renames.push({ from, to })
      },
    },
    reads: () => reads,
    writes,
    renames,
  }
}

// —— CAS 写入：rename 前重读比对，文件被 DSH 改过就基于新内容重试，绝不盖掉别人的行。——

test('读与写之间文件被外部改动时，基于新内容重试，外部刚写的行保得住', async () => {
  // DSH 在这个窗口里往 web 段补了一行自己的配置（比如超时）。
  const external = PROFILE_WITH_BUILTIN.replace(
    '    searchProvider: deepseek-official\n',
    '    searchProvider: deepseek-official\n    agentTimeout: 30\n',
  )
  const { io, reads, writes, renames } = scriptedIo([
    PROFILE_WITH_BUILTIN, // 第 1 次读：初始内容
    external, // 第 2 次读：CAS 重读，发现 DSH 刚改过 → 重试
    external, // 第 3 次读：第二轮的初始内容
    external, // 第 4 次读：CAS 重读，已稳定
  ])

  const { changed } = await claimFetchProviderInFile('fake://cordis.patch.yml', { from: BUILTIN, to: OURS }, io)

  assert.equal(changed, true)
  assert.equal(reads(), 4, '应是两轮「读 + CAS 重读」')
  assert.equal(writes.length, 1)
  assert.equal(renames.length, 1)
  const written = writes[0].data
  assert.match(written, /fetchProvider: proxy-connect/)
  assert.ok(written.includes('    agentTimeout: 30\n'), '外部刚写的行必须还在结果里')
})

test('外部持续在改、重试用尽时，报错且一个字节都不写', async () => {
  const { io, writes, renames } = scriptedIo([
    PROFILE_WITH_BUILTIN,
    `${PROFILE_WITH_BUILTIN}// 改动 1\n`,
    `${PROFILE_WITH_BUILTIN}// 改动 2\n`,
    `${PROFILE_WITH_BUILTIN}// 改动 3\n`,
    `${PROFILE_WITH_BUILTIN}// 改动 4\n`,
    `${PROFILE_WITH_BUILTIN}// 改动 5\n`,
  ])

  await assert.rejects(
    () => claimFetchProviderInFile('fake://cordis.patch.yml', { from: BUILTIN, to: OURS }, io),
    (error) => {
      assert.match(error.message, /fake:\/\/cordis\.patch\.yml/)
      assert.match(error.message, /并发|冲突/)
      return true
    },
  )
  assert.equal(writes.length, 0, '冲突未解决时绝不写文件')
  assert.equal(renames.length, 0)
})

test('文件不存在时不报错、也不写文件', async (t) => {
  const dir = await tempDir(t)
  const file = join(dir, 'cordis.patch.yml')
  const { changed } = await handBackFetchProviderInFile(file, { from: OURS, to: BUILTIN })
  assert.equal(changed, false)
})

test('因为「不存在」以外的原因读不到时，如实抛错而不是当作没事', async (t) => {
  const dir = await tempDir(t)
  const asDirectory = join(dir, 'cordis.patch.yml')
  await mkdir(asDirectory)

  await assert.rejects(
    () => handBackFetchProviderInFile(asDirectory, { from: OURS, to: BUILTIN }),
    (error) => error.code !== 'ENOENT',
  )
})

test('写回失败时如实抛错，不会留下半个文件', async (t) => {
  const dir = await tempDir(t)
  const file = join(dir, 'cordis.patch.yml')
  await writeFile(file, PROFILE, 'utf8')
  await mkdir(`${file}.proxy-connect.tmp`)

  await assert.rejects(() => handBackFetchProviderInFile(file, { from: OURS, to: BUILTIN }))
  assert.equal(await readFile(file, 'utf8'), PROFILE)
})

test('写回是「临时文件 + 改名」，不留下残渣', async (t) => {
  const dir = await tempDir(t)
  const file = join(dir, 'cordis.patch.yml')
  await writeFile(file, PROFILE, 'utf8')

  await handBackFetchProviderInFile(file, { from: OURS, to: BUILTIN })

  const leftovers = (await readdir(dir)).filter((name) => name.includes('tmp'))
  assert.deepEqual(leftovers, [])
})

test('接管走文件时同样写回，并保住其余内容', async (t) => {
  const dir = await tempDir(t)
  const file = join(dir, 'cordis.patch.yml')
  await writeFile(file, PROFILE_WITH_BUILTIN, 'utf8')

  const { changed } = await claimFetchProviderInFile(file, { from: BUILTIN, to: OURS })

  assert.equal(changed, true)
  const text = await readFile(file, 'utf8')
  assert.match(text, /fetchProvider: proxy-connect/)
  assert.match(text, /- id: dsh-proxy-connect\n {2}disabled: false/)
})

test('profile 路径按 DSH_HOME 与 DSH_PROFILE 解析', () => {
  assert.equal(
    resolvePatchFilePath({ DSH_HOME: 'C:/h', DSH_PROFILE: 'desktop' }),
    join('C:/h', 'profiles', 'desktop', 'cordis.patch.yml'),
  )
  assert.match(resolvePatchFilePath({ DSH_HOME: 'C:/h' }), /profiles[\\/]desktop[\\/]cordis\.patch\.yml$/)
})
