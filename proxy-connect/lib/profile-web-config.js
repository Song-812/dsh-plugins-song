/**
 * 改 profile 里 `web` 那行的 `fetchProvider`（两个方向）。
 *
 * 为什么直接改文件而不走 `configEditor`：停用/启用插件这个动作本身就发生在 DSH 的
 * HMR 事务里，在事务里改配置会报
 *   HMR transactions cannot be nested
 * （2026-10-14 关的那次实测、2026-10-17 开的那次实测）。失败会把配置停在旧值，
 * 于是：关的时候 `fetchProvider` 指向一个没加载的抓取器，**连国内站也抓不了**；
 * 开的时候配置留在内置实现上，**网页那半静默不走代理**。
 *
 * 两个方向的要求不同，所以是两组函数：
 *   claimFetchProvider*    —— 启用：只在当前值是内置实现、或这一行压根不存在时才动；
 *                             不存在就补在 `web` 那段的末尾（否则白开一场）。
 *   handBackFetchProvider* —— 停用：只在当前值是我们时才改回内置，绝不新增行。
 *
 * 写回一律「临时文件 + 改名」，不会让读者看到半截内容；改名前会重读比对
 * （CAS），发现文件在窗口里被 DSH 改过就基于新内容重试，绝不盖掉别人的行。
 */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 真实文件系统；并发窗口的测试通过第三个参数注入假 fs。 */
const fileIo = { readFile, writeFile, rename }

/** 真实 DSH 里这一行的 id 可能是 `web`，也可能带 `include:` 前缀。 */
const WEB_ENTRY_IDS = new Set(['web', 'include:web'])

/** 顶层条目的起始行形如 `- id: web`（列 0 的短横线），config 里的列表项有缩进，不会被误判。 */
const ENTRY_ID_PATTERN = /^-\s*id:\s*(.+?)\s*$/

/**
 * profile 的 `cordis.patch.yml` 路径。
 * @param env - 环境变量对象，默认取当前进程；只为测试留出注入点。
 * @returns 绝对路径。
 */
export function resolvePatchFilePath(env = process.env) {
  const home = nonEmpty(env?.DSH_HOME) ?? join(homedir(), '.dsh')
  const profile = nonEmpty(env?.DSH_PROFILE) ?? 'desktop'
  return join(home, 'profiles', profile, 'cordis.patch.yml')
}

/** 启用：把 `web` 那行指向本插件；值不是内置实现时不动，行不存在时补上。 */
export function claimFetchProviderInText(text, { from, to }) {
  return transformWebFetchProvider(text, { from, to, insertIfMissing: true })
}

/** 停用：把 `web` 那行交还内置实现；只在当前值是我们时才改，绝不新增行。 */
export function handBackFetchProviderInText(text, { from, to }) {
  return transformWebFetchProvider(text, { from, to, insertIfMissing: false })
}

/** 启用：就地写回（读不到且原因不是「不存在」时抛错）。 */
export async function claimFetchProviderInFile(filePath, options, io = fileIo) {
  return writeFetchProviderInFile(filePath, options, claimFetchProviderInText, io)
}

/** 停用：就地写回（读不到且原因不是「不存在」时抛错）。 */
export async function handBackFetchProviderInFile(filePath, options, io = fileIo) {
  return writeFetchProviderInFile(filePath, options, handBackFetchProviderInText, io)
}

/**
 * 文本变换：只动 `web` 段里的 `fetchProvider`。
 * @param text - `cordis.patch.yml` 全文。
 * @param options - 期望的当前值 `from`、要写的值 `to`、以及缺行时是否补写。
 * @returns 新文本与「是否真的改了」。
 */
function transformWebFetchProvider(text, { from, to, insertIfMissing }) {
  const lines = text.split('\n')
  const range = webEntryRange(lines)
  if (range === undefined) return { text, changed: false }

  let sawProviderLine = false
  for (let index = range.start; index < range.end; index += 1) {
    // 只认顶格的 `fetchProvider:`（config 下的一级键）；别的键名里含这个词不算。
    if (!/^\s*fetchProvider:/.test(lines[index])) continue
    sawProviderLine = true
    const replaced = replaceFetchProviderLine(lines[index], from, to)
    if (replaced === undefined) continue
    const next = [...lines]
    next[index] = replaced
    return { text: next.join('\n'), changed: true }
  }

  // 这一行已经存在（只是值不是我们期望的那个）→ 别人写的，不抢也不重复补。
  if (sawProviderLine || !insertIfMissing) return { text, changed: false }
  const inserted = insertFetchProvider(lines, range, to)
  return inserted === undefined ? { text, changed: false } : { text: inserted, changed: true }
}

/** `web` 条目在行数组里的范围；没有这个条目时返回 undefined。 */
function webEntryRange(lines) {
  let start
  for (let index = 0; index < lines.length; index += 1) {
    const entryId = entryIdOf(lines[index])
    if (entryId === undefined) continue
    if (start !== undefined) return { start, end: index }
    if (WEB_ENTRY_IDS.has(entryId)) start = index
  }
  return start === undefined ? undefined : { start, end: lines.length }
}

/** 把一行 `fetchProvider:` 的值从 `from` 换成 `to`；值不符或不是这一行时返回 undefined。 */
function replaceFetchProviderLine(line, from, to) {
  const match = /^(\s*)fetchProvider:(\s*)(.*)$/.exec(line)
  if (match === null) return undefined
  const [, indent, spacing, rest] = match
  const commentAt = rest.indexOf(' #')
  const value = (commentAt === -1 ? rest : rest.slice(0, commentAt)).trim()
  if (unquote(value) !== from) return undefined
  const comment = commentAt === -1 ? '' : rest.slice(commentAt)
  return `${indent}fetchProvider:${spacing}${to}${comment}`
}

/** 在 `web` 段末尾补一行 `fetchProvider`，缩进跟着该段的 `config:` 走。 */
function insertFetchProvider(lines, range, to) {
  const configIndex = findConfigLine(lines, range)
  if (configIndex === undefined) return undefined
  const configIndent = /^(\s*)/.exec(lines[configIndex])[1]
  const next = [...lines]
  next.splice(range.end, 0, `${configIndent}  fetchProvider: ${to}`)
  return next.join('\n')
}

function findConfigLine(lines, range) {
  for (let index = range.start; index < range.end; index += 1) {
    if (/^\s*config:\s*$/.test(lines[index])) return index
  }
  return undefined
}

/**
 * CAS 式写回：DSH 自己也在写这个文件，「读→变换→整文件替换」的窗口里它可能刚写入
 * 别的行——rename 前重读比对，内容变了就基于新内容重试变换；重试用尽仍冲突就报错，
 * 绝不拿陈旧快照盖掉 DSH 刚写入的内容。
 */
const MAX_CAS_ATTEMPTS = 3

async function writeFetchProviderInFile(filePath, options, transform, io = fileIo) {
  for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt += 1) {
    const original = await readTextOrMissing(io, filePath)
    if (original.missing) return { changed: false }
    const result = transform(original.text, options)
    if (!result.changed) return { changed: false }

    const current = await readTextOrMissing(io, filePath)
    if (current.missing || current.text !== original.text) continue

    const temporary = `${filePath}.proxy-connect.tmp`
    await io.writeFile(temporary, result.text, 'utf8')
    await io.rename(temporary, filePath)
    return { changed: true }
  }
  throw new Error(
    `写入 ${filePath} 时反复检测到并发修改（重试 ${MAX_CAS_ATTEMPTS} 次仍冲突），拒绝用陈旧快照覆盖`,
  )
}

/** 读全文；文件不存在时返回 `{ missing: true }`，其它读取错误如实抛出。 */
async function readTextOrMissing(io, filePath) {
  try {
    return { text: await io.readFile(filePath, 'utf8') }
  } catch (error) {
    if (isMissingFile(error)) return { missing: true }
    throw error
  }
}

/** 顶层条目行里 `id:` 的值；不是条目起始行时返回 undefined。 */
function entryIdOf(line) {
  const match = ENTRY_ID_PATTERN.exec(line)
  if (match === null) return undefined
  return unquote(match[1])
}

function unquote(value) {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && /^["']/.test(trimmed) && trimmed.endsWith(trimmed[0])) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function isMissingFile(error) {
  return error?.code === 'ENOENT'
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}
