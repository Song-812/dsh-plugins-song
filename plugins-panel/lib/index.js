/**
 * 插件面板（dsh-plugins-panel）宿主半。
 *
 * 只做两件事，别的一律交给客户端与 DSH 自带接口：
 *   1. 存取这一页的显示偏好（自定义名、行简介、分组名、组内顺序、折叠、旋钮方向）。
 *   2. 告诉客户端哪些插件是「自制」（profile 里用 link:/file: 装的），用于分组。
 *
 * 启用/停用开关不走这里：客户端直接调用官方
 * `remote.pluginManager.setPluginEnabled(entryId, enabled)`，与 DSH 自带的插件页同一个接口。
 *
 * 状态文件：$DSH_HOME/plugins-panel.json（纯 JSON、可手改）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Windows 上用 PowerShell 存过的 JSON 可能带 BOM：先剥掉，否则整份配置会被当成坏的。 */
const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

export const name = 'dsh-plugins-panel'

/** 客户端用的路由与状态文件名（改名时两处一起改）。 */
export const ROUTE_PATH = '/api/plugins-panel'
export const STATE_FILE_NAME = 'plugins-panel.json'

/** POST 请求体上限：偏好字段另有条数/长度清洗，这里先挡住超大 body 进内存。 */
const MAX_BODY_BYTES = 256 * 1024

/** DSH 主目录。 */
function resolveHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return path.join(os.homedir(), '.dsh')
}

/**
 * Infer the active profile directory from where this plugin is loaded.
 * DSH usually installs the junction under `profiles/<name>/node_modules/...`,
 * and does NOT export DSH_PROFILE_DIR to the main process — so walking up from
 * import.meta.url is the reliable way to avoid guessing by mtime.
 */
export function profileDirFromPluginPath(pluginFile = fileURLToPath(import.meta.url)) {
  let dir = path.dirname(pluginFile)
  for (let depth = 0; depth < 10; depth += 1) {
    const parent = path.dirname(dir)
    if (path.basename(dir) === 'node_modules' && path.basename(path.dirname(parent)) === 'profiles') {
      return parent
    }
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * profile 目录（用来读它的 package.json，判断自制/内置）。
 * 优先：$DSH_PROFILE_DIR → $DSH_PROFILE → 从本包加载路径推断；
 * 都没有才回退 profiles/desktop，并对「猜的」写 warnings（不再按 mtime 挑最新）。
 *
 * @returns {{ dir: string, source: 'env-dir'|'env-name'|'plugin-path'|'fallback-desktop', warning?: string }}
 */
function pickProfileDir(home, env, pluginFile) {
  const explicit = env.DSH_PROFILE_DIR
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return { dir: explicit.trim(), source: 'env-dir' }
  }
  const profile = env.DSH_PROFILE
  if (typeof profile === 'string' && profile.trim() !== '') {
    return { dir: path.join(home, 'profiles', profile.trim()), source: 'env-name' }
  }
  const fromPlugin = profileDirFromPluginPath(pluginFile)
  if (fromPlugin !== undefined) {
    return { dir: fromPlugin, source: 'plugin-path' }
  }
  const fallback = path.join(home, 'profiles', 'desktop')
  return {
    dir: fallback,
    source: 'fallback-desktop',
    warning: '未设置 DSH_PROFILE_DIR/DSH_PROFILE，且无法从插件加载路径推断 profile，已回退 profiles/desktop',
  }
}

/** profile 目录（用真实进程环境）。 */
function resolveProfileDir(home) {
  return pickProfileDir(home, process.env).dir
}

/** 读 JSON 文件；不存在或坏了都当成空对象，绝不让页面因为坏文件打不开。 */
function readJson(file, fallback) {
  try {
    const text = stripBom(fs.readFileSync(file, 'utf8'))
    const data = JSON.parse(text)
    return data !== null && typeof data === 'object' ? data : fallback
  } catch {
    return fallback
  }
}

/**
 * 一个 home 一条写链：状态文件的「读-改-写」不是原子的，两次并发保存会互相覆盖
 * （后读的那份把先写的改动静默冲掉），也可能让固定临时名互踩。整段排队后，
 * 每次保存看到的都是上一次保存之后的最新内容。
 */
const writeChains = new Map()

export function queueWrite(home, task) {
  const previous = writeChains.get(home) ?? Promise.resolve()
  const next = previous.then(task, task)
  writeChains.set(home, next.then(() => undefined, () => undefined))
  return next
}

/** 原子写：先写唯一临时文件再改名，避免写一半被读到；失败时清掉临时文件。 */
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, file)
  } catch (error) {
    try {
      fs.unlinkSync(tmp)
    } catch {
      // 临时文件可能压根没建出来。
    }
    throw error
  }
}

/** 只留字符串到字符串的映射，键值都限长，避免状态文件被写坏或撑大。 */
function cleanMap(value, max = 200) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out = {}
  let count = 0
  for (const [key, item] of Object.entries(value)) {
    if (count >= max) break
    if (typeof key !== 'string' || key === '' || typeof item !== 'string') continue
    const text = item.trim().slice(0, 300)
    if (text === '') continue
    out[key.slice(0, 200)] = text
    count += 1
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** 只留「键 → 布尔」的映射。 */
function cleanFlags(value, max = 200) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out = {}
  let count = 0
  for (const [key, item] of Object.entries(value)) {
    if (count >= max) break
    if (typeof key !== 'string' || key === '' || typeof item !== 'boolean') continue
    out[key.slice(0, 200)] = item
    count += 1
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** 只留「分组 → 字符串数组」的映射。 */
function cleanOrder(value, max = 200) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out = {}
  let groups = 0
  for (const [key, list] of Object.entries(value)) {
    if (groups >= 20) break
    if (typeof key !== 'string' || key === '' || !Array.isArray(list)) continue
    const items = list
      .filter((item) => typeof item === 'string' && item !== '')
      .slice(0, max)
      .map((item) => item.slice(0, 200))
    if (items.length === 0) continue
    out[key.slice(0, 200)] = items
    groups += 1
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/**
 * 清洗客户端送来的偏好：认识的字段留下，其余一律丢弃。
 * 返回对象里没有的键表示「回到默认」，所以只保留非空字段。
 * 不再接受遗留的 bulkOn（客户端已不用）。
 */
export function sanitizePrefs(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return {}
  const out = {}
  const titles = cleanMap(input.titles)
  if (titles !== undefined) out.titles = titles
  // 行简介：只存在这一页（显示 + 搜索用），不进任何插件文件、也不影响模型。
  const desc = cleanMap(input.desc)
  if (desc !== undefined) out.desc = desc
  const groupTitles = cleanMap(input.groupTitles)
  if (groupTitles !== undefined) out.groupTitles = groupTitles
  const order = cleanOrder(input.order)
  if (order !== undefined) out.order = order
  const collapsed = cleanFlags(input.collapsed)
  if (collapsed !== undefined) out.collapsed = collapsed
  const bulk = cleanFlags(input.bulk)
  if (bulk !== undefined) out.bulk = bulk
  return out
}

/**
 * 哪些条目是「自制」：profile 的 package.json 里用 link:/file: 装的。
 * 读不到就返回空表 —— 那样全部归到「内置」，页面照常能用，不会报错。
 */
export function selfMadeModules(profileDir) {
  const pkg = readJson(path.join(profileDir, 'package.json'), {})
  const deps = pkg.dependencies !== null && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}
  const self = []
  for (const [moduleName, spec] of Object.entries(deps)) {
    if (typeof spec !== 'string') continue
    if (spec.startsWith('link:') || spec.startsWith('file:')) self.push(moduleName)
  }
  return self.sort()
}

/** 组装 GET 的答复（不回绝对 home 路径）。 */
export function buildGet(home, pluginFile = fileURLToPath(import.meta.url)) {
  const picked = pickProfileDir(home, process.env, pluginFile)
  const warnings = []
  if (typeof picked.warning === 'string' && picked.warning !== '') warnings.push(picked.warning)
  return {
    ok: true,
    prefs: sanitizePrefs(readJson(path.join(home, STATE_FILE_NAME), {}).prefs ?? {}),
    selfMade: selfMadeModules(picked.dir),
    profileSource: picked.source,
    warnings,
  }
}

/** 读请求体并强制大小上限。 */
async function readBodyText(request) {
  const declared = Number(request.headers?.get?.('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('请求体过大')
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('请求体过大')
  return text
}

/** 处理一次请求；导出以便离线自测。 */
export async function handle(request, home, pluginFile = fileURLToPath(import.meta.url)) {
  const headers = { 'cache-control': 'no-store' }
  if (request.method === 'GET') return Response.json(buildGet(home, pluginFile), { headers })
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: '只支持 GET 和 POST' }, { status: 405, headers })
  }

  let body
  try {
    body = JSON.parse(stripBom((await readBodyText(request)) || '{}'))
  } catch (error) {
    const message = String(error?.message ?? error)
    if (message.includes('请求体过大')) {
      return Response.json({ ok: false, error: '请求体过大' }, { status: 413, headers })
    }
    return Response.json({ ok: false, error: 'bad-json' }, { status: 400, headers })
  }
  if (body === null || typeof body !== 'object' || body.action !== 'prefs') {
    return Response.json({ ok: false, error: 'bad-action' }, { status: 400, headers })
  }

  const stateFile = path.join(home, STATE_FILE_NAME)
  const prefs = sanitizePrefs(body.prefs)
  try {
    // 整个「读-改-写」跑在写链上：并发保存按到达顺序落盘，谁也不会冲掉谁。
    await queueWrite(home, () => {
      writeJson(stateFile, { ...readJson(stateFile, {}), prefs })
    })
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message ?? error) }, { status: 500, headers })
  }
  return Response.json({ ok: true, prefs }, { headers })
}

export function apply(ctx) {
  const home = resolveHome()
  ctx.inject(['connection'], (host) => {
    // register 的返回值若为清理函数，交回给框架：插件卸载/重载时把路由摘掉，
    // 否则重载一次就多注册一次同名路由。
    const dispose = host.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: (request) => handle(request, home),
    })
    if (typeof dispose === 'function') return dispose
  })
}

/** 仅供离线自测使用。 */
export const __test__ = {
  sanitizePrefs,
  selfMadeModules,
  buildGet,
  handle,
  resolveHome,
  resolveProfileDir,
  pickProfileDir,
  profileDirFromPluginPath,
  queueWrite,
  MAX_BODY_BYTES,
}
