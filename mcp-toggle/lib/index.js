/**
 * dsh-mcp-toggle host entry.
 *
 * Read-only helper for the sidebar "MCP" page: it reports what each MCP server
 * row in the profile patch actually is (the label the owner wrote above it, its
 * transport and endpoint, the NAMES of any header/env keys) and how many tools
 * each server currently contributes.
 *
 * Its only write is the panel's own display preferences (custom titles, row
 * order, collapsed flag) into the state file. Enabling, disabling and
 * management is done by the panel through the shipped
 * `remote.pluginManager.setPluginEnabled(...)` Remote, which persists the
 * row's `disabled` override and hot-reloads the row.
 *
 * Facts this file is built on (verified against the shipped packages):
 *   - An MCP server is a Loader row of module `@deepseek-ai/dsh-mcp-client`
 *     declared in the profile's `cordis.patch.yml`; there is no separate config
 *     store and no MCP service.
 *   - `@deepseek-ai/dsh-mcp-client` exposes no connection state at all, so this
 *     host half only contributes the tool count, which is the closest observable
 *     proxy for "connected".
 *   - A server's own config may carry credentials (`headers.Authorization`,
 *     `env.*`). Their values must never reach the page, so only key names and a
 *     masked endpoint are reported.
 */
import { readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Windows 上用 PowerShell 存过的 JSON 可能带 BOM：先剥掉，否则整份配置会被当成坏的。 */
const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

export const name = 'mcp-toggle'

const ROUTE_PATH = '/api/mcp-toggle'
const HOME_ENV = 'DSH_HOME'
const HOME_DIR_NAME = '.dsh'
const PROFILE_DIR_ENV = 'DSH_PROFILE_DIR'
const PROFILE_ENV = 'DSH_PROFILE'
const PATCH_FILE = 'cordis.patch.yml'
const STATE_FILE_NAME = 'mcp-toggle.json'
const MCP_MODULE = '@deepseek-ai/dsh-mcp-client'
const MAX_BODY_BYTES = 256 * 1024

/** JSON response with the no-store header the panel expects. */
function jsonResponse(status, payload) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/** Message of a thrown value, for the panel's failure notice. */
function messageOf(error) {
  return String((error && error.message) || error)
}

/** Expand the supported tilde prefixes against the operating-system home. */
function expandHomePath(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the harness home the way the built-in loader does: a non-blank
 * $DSH_HOME wins, otherwise ~/.dsh. Inlined because an external plugin cannot
 * assume `@deepseek-ai/dsh-home-paths` resolves inside the profile.
 */
function resolveHome() {
  const configured = process.env[HOME_ENV]
  const chosen = configured !== undefined && configured.trim().length > 0
    ? configured
    : join(homedir(), HOME_DIR_NAME)
  return resolve(expandHomePath(chosen))
}

/**
 * Infer the active profile directory from where this plugin is loaded.
 * DSH usually installs the junction under `profiles/<name>/node_modules/...`,
 * and does NOT export DSH_PROFILE_DIR to the main process — so walking up from
 * import.meta.url is the reliable way to avoid scanning every profile.
 */
function profileDirFromPluginPath(pluginFile = fileURLToPath(import.meta.url)) {
  let dir = dirname(pluginFile)
  for (let depth = 0; depth < 10; depth += 1) {
    const parent = dirname(dir)
    if (basename(dir) === 'node_modules' && basename(dirname(parent)) === 'profiles') {
      return parent
    }
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * Candidate patch files for the *active* profile only, plus the home-level patch
 * (loader applies home last). Prefer, in order: $DSH_PROFILE_DIR, $DSH_PROFILE,
 * the profile that loaded this plugin, then (last resort) every profile — the
 * last path also emits id-conflict warnings in `handle`.
 */
async function candidatePatchFiles(home) {
  const homePatch = join(home, PATCH_FILE)
  const hinted = process.env[PROFILE_DIR_ENV]
  if (hinted !== undefined && hinted.trim().length > 0) {
    return [join(resolve(hinted), PATCH_FILE), homePatch]
  }
  const named = process.env[PROFILE_ENV]
  if (named !== undefined && named.trim().length > 0) {
    return [join(home, 'profiles', named.trim(), PATCH_FILE), homePatch]
  }
  const fromPlugin = profileDirFromPluginPath()
  if (fromPlugin !== undefined) {
    return [join(fromPlugin, PATCH_FILE), homePatch]
  }
  // Fallback: no hint and plugin not under profiles/*/node_modules (e.g. offline
  // tests). Scan every profile; duplicate ids are reported as warnings.
  const files = []
  const profilesDir = join(home, 'profiles')
  let entries = []
  try {
    entries = await readdir(profilesDir, { withFileTypes: true })
  } catch {
    entries = []
  }
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = join(profilesDir, entry.name, PATCH_FILE)
    if (!files.includes(file)) files.push(file)
  }
  files.push(homePatch)
  return files
}

//#region redaction

/** Looks like a credential rather than a readable value. */
const SECRETISH_KEY = /(token|secret|password|passwd|pwd|bearer|auth|credential|api[-_]?key|key)/i
const OPAQUE_VALUE = /^[A-Za-z0-9_\-./+=]{24,}$/

/**
 * Mask an endpoint: userinfo and query/fragment values routinely carry a
 * credential, and they are never needed to identify the server.
 */
function maskEndpoint(raw) {
  let text = String(raw).trim().replace(/^['"]|['"]$/g, '')
  text = text.replace(/\/\/[^/@\s]*@/, '//<hidden>@')
  const query = text.indexOf('?')
  if (query !== -1) text = `${text.slice(0, query)}?<hidden>`
  const hash = text.indexOf('#')
  if (hash !== -1) text = `${text.slice(0, hash)}#<hidden>`
  return text
}

/** Mask one argument or command token that may embed a credential. */
function maskArg(raw) {
  const text = String(raw).trim().replace(/^['"]|['"]$/g, '')
  const equals = text.indexOf('=')
  if (equals > 0) {
    const key = text.slice(0, equals)
    return SECRETISH_KEY.test(key) ? `${key}=<hidden>` : text
  }
  // "Bearer <token>" / "Basic <creds>" / "Token <opaque>" — space breaks OPAQUE_VALUE.
  const scheme = /^(Bearer|Basic|Token|Digest|Negotiate|Api[-_]?Key)\s+(\S+)/i.exec(text)
  if (scheme !== null) return `${scheme[1]} <hidden>`
  const parts = text.split(/\s+/).filter((part) => part !== '')
  if (parts.length >= 2 && SECRETISH_KEY.test(parts[0]) && (OPAQUE_VALUE.test(parts[1]) || parts[1].length >= 16)) {
    return `${parts[0]} <hidden>`
  }
  return OPAQUE_VALUE.test(text) ? '<hidden>' : text
}

/** A config scalar, with a `!!js` expression reported as such and never shown. */
function readScalar(raw) {
  const text = String(raw).trim()
  if (text.startsWith('!!js')) return '<expression>'
  return text.replace(/^['"]|['"]$/g, '')
}

//#endregion

//#region patch reading

/** Strip the box-drawing decoration an owner uses to frame a comment header. */
function cleanComment(line) {
  return line
    .replace(/^\s*#+\s?/, '')
    .replace(/[─━═—–=]{2,}/g, ' ')
    .replace(/^[\s\-─━═]+|[\s\-─━═]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Find every `- insert:` row in the profile patch whose `name` is the MCP
 * client module, together with the comment block written above it (the owner's
 * own label) and the credential-safe parts of its config.
 *
 * @param warnings - optional sink for rows that were skipped on purpose; a
 *   malformed row must never take the whole page down.
 */
function readMcpRows(text, warnings = []) {
  const lines = text.split(/\r\n|\n|\r/)
  const rows = []
  let comments = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\s*#/.test(line)) {
      comments.push(line)
      continue
    }
    if (line.trim() === '') {
      comments = []
      continue
    }
    if (!/^-\s*insert\s*:/.test(line)) {
      comments = []
      continue
    }

    // Collect the inserted rows: they are indented, and a blank line or a
    // column-zero line ends the block. Stopping at the blank line matters — a
    // greedy scan would swallow the NEXT entry's comment block and lose labels.
    const block = []
    let cursor = index + 1
    while (cursor < lines.length) {
      const next = lines[cursor]
      if (next.trim() === '' || !/^\s/.test(next)) break
      block.push(next)
      cursor += 1
    }
    index = cursor - 1

    // One `- insert:` may declare several rows; each `- id:` starts one.
    const starts = []
    for (let offset = 0; offset < block.length; offset += 1) {
      if (/^\s*-\s*id\s*:/.test(block[offset])) starts.push(offset)
    }
    for (let position = 0; position < starts.length; position += 1) {
      const rowLines = block.slice(starts[position], starts[position + 1] ?? block.length)
      // `- id:` 冒号后没有值时 exec 返回 null：直接取 [1] 会 TypeError，
      // 让整个 GET 崩掉。这种行没有 id 就没法寻址，跳过并报告，别拖垮整页。
      const idMatch = /^\s*-\s*id\s*:\s*(.+)$/.exec(rowLines[0])
      if (idMatch === null) {
        warnings.push(`第 ${index - block.length + starts[position] + 2} 行的 - id: 没有值，已跳过该行`)
        continue
      }
      const id = readScalar(idMatch[1])
      const nameMatch = /^\s*name\s*:\s*(.+)$/m.exec(rowLines.join('\n'))
      const moduleName = nameMatch === null ? '' : readScalar(nameMatch[1])
      if (moduleName !== MCP_MODULE) continue
      // The comment block frames the insert; with several rows it names the first.
      rows.push({ id, moduleName, label: position === 0 ? firstComment(comments) : undefined, config: readMcpConfig(rowLines), line: index + 1 })
    }
    comments = []
  }
  return rows
}

/** The owner's own one-line label, taken from the first line of its comment block. */
function firstComment(comments) {
  for (const line of comments) {
    const text = cleanComment(line)
    if (text !== '') return text
  }
  return undefined
}

/**
 * Read the credential-safe parts of one insert block's `config:` map:
 * scalars, plus the KEY NAMES of `headers`/`env` and the masked `args` list.
 */
function readMcpConfig(block) {
  const config = { headerKeys: [], envKeys: [], args: [] }
  let nested = undefined

  for (const raw of block) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const indent = raw.length - raw.trimStart().length

    if (/^\s*config\s*:/.test(raw)) {
      nested = undefined
      continue
    }
    // Top-level answer fields of the row (`id`, `name`) sit at a shallower indent.
    const scalar = /^(serverName|transport|url|command|toolCallTimeoutMs|failOnStartupError|maxInstructionBytes|cwd)\s*:\s*(.*)$/.exec(line)
    if (scalar !== null) {
      nested = undefined
      config[scalar[1]] = readScalar(scalar[2])
      continue
    }
    const mapHead = /^(headers|env)\s*:\s*$/.exec(line)
    if (mapHead !== null) {
      nested = mapHead[1]
      continue
    }
    const listHead = /^args\s*:\s*\[(.*)\]\s*$/.exec(line)
    if (listHead !== null) {
      nested = undefined
      config.args = listHead[1].split(',').map((item) => item.trim()).filter((item) => item !== '')
      continue
    }
    if (/^args\s*:\s*$/.test(line)) {
      nested = 'args'
      continue
    }
    if (nested === 'args' && line.startsWith('- ')) {
      config.args.push(readScalar(line.slice(2)))
      continue
    }
    if (nested === 'headers' || nested === 'env') {
      const key = /^([A-Za-z0-9_.\-]+)\s*:/.exec(line)
      if (key === null) continue
      if (indent === 0) {
        nested = undefined
        continue
      }
      if (nested === 'headers') config.headerKeys.push(key[1])
      else config.envKeys.push(key[1])
    }
  }

  // A one-line endpoint, masked; a stdio server is summarised as command + args.
  if (config.url !== undefined) config.endpoint = maskEndpoint(config.url)
  else if (config.command !== undefined) config.endpoint = [maskArg(config.command), ...config.args.map(maskArg)].join(' ')
  else config.endpoint = ''
  delete config.url
  config.args = config.args.map(maskArg)
  return config
}

//#endregion

/** Count the tools each MCP server currently contributes, by public-name prefix. */
function toolCounts(toolsCtx) {
  const counts = {}
  let schemas = []
  try {
    schemas = toolsCtx === undefined || toolsCtx.tools === undefined ? [] : toolsCtx.tools.schemas() ?? []
  } catch {
    schemas = []
  }
  for (const schema of schemas) {
    const matched = /^mcp__([A-Za-z0-9_-]+)__/.exec(String(schema === undefined || schema === null ? '' : schema.name))
    if (matched === null) continue
    counts[matched[1]] = (counts[matched[1]] ?? 0) + 1
  }
  return counts
}

/** Read the small diagnostic state file; a missing one is simply empty. */
async function loadState(home) {
  try {
    const parsed = JSON.parse(stripBom(await readFile(join(home, STATE_FILE_NAME), 'utf8')))
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * One write chain per home. A read-modify-write cycle on a single JSON file is
 * not atomic, and this host half now has two writers (the request breadcrumbs
 * and the panel's preferences), so writes are serialised: without this, a GET
 * reporting diagnostics could overwrite a preference saved a moment earlier.
 */
const writeChains = new Map()

function queueWrite(home, task) {
  const previous = writeChains.get(home) ?? Promise.resolve()
  const next = previous.then(task, task)
  writeChains.set(home, next.then(() => undefined, () => undefined))
  return next
}

/** Persist diagnostics, best effort: it must never be able to break a request. */
async function saveState(home, state) {
  // 原子写：直接覆盖会先截断原文件，写一半失败就把偏好和诊断一起弄没。
  const file = join(home, STATE_FILE_NAME)
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(temp, file)
    return true
  } catch {
    try {
      await unlink(temp)
    } catch {
      // 临时文件可能压根没建出来。
    }
    return false
  }
}

/**
 * Record that the host half loaded. This is how a maintainer tells "running"
 * apart from "silently skipped by the loader", which is silent by design.
 */
async function noteLoad(home) {
  return queueWrite(home, async () => {
    const state = await loadState(home)
    // `profileDir` is the field this file carried while the host half still guessed
    // the profile from the environment; dropping it keeps the breadcrumb honest.
    delete state.profileDir
    await saveState(home, { ...state, loadedAt: new Date().toISOString(), route: ROUTE_PATH })
  })
}

/** Record what the last panel request saw, so the same file answers "did it work". */
async function noteCall(home, patch) {
  return queueWrite(home, async () => {
    const state = await loadState(home)
    await saveState(home, { ...state, lastCallAt: new Date().toISOString(), ...patch })
  })
}

/** Keep only the panel's own display preferences; every field is bounded. */
function sanitizePrefs(raw) {
  const out = { titles: {}, order: [], collapsed: false, groupTitle: '' }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  const titles = raw.titles
  if (titles !== null && typeof titles === 'object' && !Array.isArray(titles)) {
    let kept = 0
    for (const [key, value] of Object.entries(titles)) {
      if (kept >= 500) break
      if (typeof key !== 'string' || key.length > 300 || typeof value !== 'string') continue
      const name = value.trim().slice(0, 200)
      if (name === '') continue
      out.titles[key] = name
      kept += 1
    }
  }
  if (Array.isArray(raw.order)) {
    out.order = raw.order
      .filter((item) => typeof item === 'string' && item.length > 0 && item.length <= 300)
      .slice(0, 1000)
  }
  out.collapsed = raw.collapsed === true
  if (typeof raw.groupTitle === 'string') out.groupTitle = raw.groupTitle.trim().slice(0, 200)
  // The knob's remembered direction: a boolean, or absent when it was never clicked.
  if (raw.bulkOn === true || raw.bulkOn === false) out.bulkOn = raw.bulkOn
  return out
}

/** Read and size-check a JSON request body. */
async function readBody(request) {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('请求体过大')
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('请求体过大')
  const parsed = JSON.parse(stripBom(text))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('请求体必须是对象')
  return parsed
}

/**
 * The panel's display preferences: the one thing this host half writes. They
 * share the diagnostics state file, so the breadcrumbs and the preferences
 * travel together.
 */
async function handlePrefsPost(request, home) {
  let body
  try {
    body = await readBody(request)
  } catch (error) {
    return jsonResponse(400, { error: messageOf(error) })
  }
  if (body.action !== 'prefs') return jsonResponse(400, { error: `未知操作: ${String(body.action)}` })
  const prefs = sanitizePrefs(body.prefs)
  return queueWrite(home, async () => {
    const state = await loadState(home)
    // 偏好是用户亲手改的：写不进去必须报失败，不能返回 200 让他以为存上了。
    if (!(await saveState(home, { ...state, prefs, prefsSavedAt: new Date().toISOString() }))) {
      return jsonResponse(500, { ok: false, error: '状态文件写入失败' })
    }
    return jsonResponse(200, { ok: true, prefs })
  })
}

/** Serve one panel request. Connection already applied the fence and authentication. */
async function handle(request, home, toolsContext) {
  if (request.method === 'POST') return handlePrefsPost(request, home)
  if (request.method !== 'GET') return jsonResponse(405, { error: '只支持 GET 和 POST' })
  const candidates = await candidatePatchFiles(home)
  const warnings = []
  const readFiles = []
  const byId = new Map()

  for (const file of candidates) {
    let text
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      if (error !== null && typeof error === 'object' && error.code === 'ENOENT') continue
      warnings.push(`读不到 ${basename(dirname(file))}/${PATCH_FILE}: ${messageOf(error)}`)
      continue
    }
    const rowWarnings = []
    const found = readMcpRows(text, rowWarnings)
    // 跳过的坏行要说出来：面板靠 warnings 告诉用户「这份配置里有一行没读」。
    for (const message of rowWarnings) warnings.push(`${basename(dirname(file))}/${PATCH_FILE}: ${message}`)
    if (found.length === 0) continue
    readFiles.push(file)
    // A later file is applied later by the loader, so it wins on a duplicate id.
    for (const row of found) {
      if (byId.has(row.id)) {
        warnings.push(`同名 id「${row.id}」出现在多份 patch 中，后读的 ${basename(dirname(file))}/${PATCH_FILE} 覆盖先前配置`)
      }
      byId.set(row.id, { ...row, patchFile: file })
    }
  }

  const rows = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
  const counts = toolCounts(toolsContext)
  // Never send absolute paths to the page or the state breadcrumb.
  const shortPatchName = (file) => {
    if (resolve(dirname(file)) === resolve(home)) return PATCH_FILE
    return `${basename(dirname(file))}/${PATCH_FILE}`
  }
  const shortNames = readFiles.map(shortPatchName)
  await noteCall(home, { patchFiles: shortNames, serverCount: rows.length, toolCounts: counts })

  return jsonResponse(200, {
    ok: true,
    prefs: sanitizePrefs((await loadState(home)).prefs),
    patchFiles: shortNames,
    servers: rows.map((row) => ({
      id: row.id,
      label: row.label,
      serverName: row.config.serverName,
      transport: row.config.transport,
      endpoint: row.config.endpoint,
      headerKeys: row.config.headerKeys,
      envKeys: row.config.envKeys,
      toolCallTimeoutMs: row.config.toolCallTimeoutMs,
      line: row.line,
      patchFile: shortPatchName(row.patchFile),
    })),
    toolCounts: counts,
    warnings,
  })
}

export function apply(ctx) {
  const home = resolveHome()
  void noteLoad(home)
  // The tools registry is read fresh on every request; the injected context is
  // only used to reach it, never to register anything.
  let toolsContext
  ctx.inject(['tools'], (inner) => {
    toolsContext = inner
    return () => {
      toolsContext = undefined
    }
  })
  ctx.inject(['connection'], (host) => {
    const dispose = host.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: (request) => handle(request, home, toolsContext),
    })
    // cordis 把注入回调的返回值当清理函数：register 若交回 disposer，
    // 必须原样 return，否则插件被禁用/卸载后路由还挂着。
    if (typeof dispose === 'function') return dispose
  })
}

/** Exported for the offline core test only; not part of the runtime surface. */
export const __test__ = {
  readMcpRows,
  readMcpConfig,
  readScalar,
  maskEndpoint,
  maskArg,
  cleanComment,
  firstComment,
  toolCounts,
  candidatePatchFiles,
  profileDirFromPluginPath,
  loadState,
  resolveHome,
  handle,
  sanitizePrefs,
  readBody,
}
