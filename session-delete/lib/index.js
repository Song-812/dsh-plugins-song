/**
 * dsh-session-delete — 宿主半边。
 *
 * 职责只有三件：
 *   1. 回答「这条会话现在能不能删、删掉会花掉多少 token」（`POST /check`）；
 *   2. 真正删一条：先摘工作区账目与归档，再把会话目录**送进 Windows 系统回收站**
 *      （`SHFileOperationW` + `FOF_ALLOWUNDO`，不是硬删），最后广播 `api-session/removed`
 *      让所有已连接的浏览器立刻把那一行摘掉；
 *   3. 自检（`GET /status`）与连通性探针（`GET /ping`）。
 *
 * 本插件**没有**撤销入口、没有台账、没有设置页：
 * 删掉之后要找回，就去资源管理器回收站里还原。
 *
 * 为什么不用 RPC：内核没有可用的会话删除接口
 * （`workspace/deleteSession` 只在 typert 清单里声明），所以这里用内核已有的公开服务
 * 自己走完：`ctx.workspaceRegistry`（账目/归档）+ 文件系统 + Windows Shell +
 * `ctx.emit("api-session/removed")`（前端实时同步）。
 *
 * @module dsh-session-delete
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { RECYCLE_PS1 } from './recycle-bridge.js'
import { decideBinStatus } from './bin-status.js'
import { deleteDecision } from './decide.js'
import { formatTokenCount } from './format.js'
import { canonicalSessionId, isSafeSessionId, sessionIdVariants } from './session-id.js'

const run = promisify(execFile)

/** 插件名（cordis loader 行 id 与客户端模块 id 都用它）。 */
export const name = 'dsh-session-delete'
/** 依赖宿主 webServer 服务来注册路由。 */
export const inject = ['webServer']

/** 本插件所有路由的公共前缀。 */
const BASE = '/dsh-session-delete'

/** 正在删的会话：同一个 id 的并发请求直接拒绝，免得两次回收同一批目录。 */
const inFlight = new Set()
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}
/** BOM：PowerShell 5.1 没有它就按 ANSI 读 .ps1，中文注释会炸。 */
const UTF8_BOM = '\uFEFF'

/**
 * 解析 DSH home（与内核 `dshHomePath()` 同优先级：$DSH_HOME 优先，否则 ~/.dsh）。
 * @returns {string} 绝对的 DSH home 路径。
 */
function dshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  return join(homedir(), '.dsh')
}

/**
 * 读取请求体并解析 JSON，带大小上限。
 * @param {import('node:http').IncomingMessage} req - 请求对象。
 * @param {number} [limit] - 最大字节数。
 * @returns {Promise<Record<string, unknown>>} 解析后的 JSON 对象。
 */
function readJsonBody(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(text)
        resolve(parsed !== null && typeof parsed === 'object' ? parsed : {})
      } catch (error) {
        reject(new Error(`invalid JSON body: ${String(error && error.message)}`))
      }
    })
    req.on('error', reject)
  })
}

/**
 * 写出一个 JSON 响应。
 * @param {import('node:http').ServerResponse} res - 响应对象。
 * @param {number} status - HTTP 状态码。
 * @param {unknown} payload - 要序列化的值。
 */
function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(status, { ...JSON_HEADERS, 'content-length': String(body.length) })
  res.end(body)
}

/**
 * 判断一个路径是否是已存在的目录。
 * @param {string} path - 待检查路径。
 * @returns {Promise<boolean>} 是目录则 true。
 */
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * 定位磁盘上的会话目录：`$DSH_HOME/sessions/<工作区分桶>/<sessionId>`。
 * 未落盘的空白会话命中空数组，这是正常的（它不是错误）。
 * @param {string} home - DSH home。
 * @param {string} sessionId - 会话 id。
 * @returns {Promise<string[]>} 命中的会话目录。
 */
async function findSessionDirs(home, sessionId) {
  const root = join(home, 'sessions')
  let entries = []
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const hits = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    for (const name of sessionIdVariants(sessionId)) {
      const candidate = join(root, entry.name, name)
      if (await isDirectory(candidate)) hits.push(candidate)
    }
  }
  return hits
}

/**
 * 一个会话「进回收站」时要一起收走的路径：会话目录 + 它的投影缓存。
 *
 * 缓存也走回收站而不是硬删 —— 还原时一并回来，语义一致（缓存丢了只是数字要重新算，
 * 但不该在「可撤销的删除」里夹一个不可撤销的动作）。
 * @param {string} home - DSH home。
 * @param {string} sessionId - 会话 id。
 * @returns {Promise<string[]>} 磁盘上真实存在的待收路径。
 */
async function recycleCandidatesFor(home, sessionId) {
  const dirs = await findSessionDirs(home, sessionId)
  const projCache = join(home, 'storages', 'session_projcache', 'sessions')
  const caches = []
  for (const name of sessionIdVariants(sessionId)) {
    for (const suffix of ['.json', '.json.tmp']) {
      const candidate = join(projCache, `${name}${suffix}`)
      if (existsSync(candidate)) caches.push(candidate)
    }
  }
  return [...dirs, ...caches]
}

/** 桥脚本的目标内容（UTF-8 带 BOM）。盘上内容与它不一致就覆盖写。 */
const BRIDGE_SCRIPT_SOURCE = UTF8_BOM + RECYCLE_PS1
/** 桥脚本落盘位置（内容与当前内嵌脚本一致才复用；不一致说明是旧版本残留）。 */
let bridgeScriptPath = null

/**
 * 把内嵌的 PowerShell 桥写到临时文件（UTF-8 **带 BOM**）。
 *
 * 缓存的是路径，但有两个坑：临时目录可能被系统清理掉；插件升级后旧脚本还躺在盘上
 * —— 「存在就复用」会拿旧逻辑去删文件。所以每次调用都把盘上内容与当前内嵌脚本
 * 整体比对（等价于内容哈希、无碰撞面，文件只有几 KB），不一致就覆盖写；
 * 内容一致才复用，不白费一次 IO。
 * @returns {Promise<string>} 脚本的绝对路径。
 */
async function ensureBridgeScript() {
  const dir = join(tmpdir(), 'dsh-session-delete')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'recycle.ps1')
  if (bridgeScriptPath === file) {
    try {
      if ((await readFile(file, 'utf8')) === BRIDGE_SCRIPT_SOURCE) return file
    } catch {
      // 读不出来（被系统清掉、没权限）就当作过期，走下面的覆盖写。
    }
  }
  await writeFile(file, BRIDGE_SCRIPT_SOURCE, 'utf8')
  bridgeScriptPath = file
  return file
}

/**
 * 调一次回收站桥。
 *
 * 为什么用「文件进文件出」而不是环境变量或命令行参数：会话路径里可能有引号、空格、
 * 反斜杠，命令行拼字符串迟早出事；写 JSON 文件最稳。为什么不用 stdout 收结果：
 * 同一份代码在受限沙箱里跑时，捕获子进程 stdio 会 `EPERM`，写文件则不受影响。
 *
 * @param {'delete'} action - 要做的事。
 * @param {string[]} paths - 目标路径（绝对路径）。
 * @returns {Promise<{ok: boolean, error?: string, deleted?: string[], failed?: object[], permanent?: boolean}>} 桥的返回。
 */
async function runRecycleBridge(action, paths) {
  const script = await ensureBridgeScript()
  const dir = join(tmpdir(), 'dsh-session-delete')
  await mkdir(dir, { recursive: true })
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const inFile = join(dir, `in-${stamp}.json`)
  const outFile = join(dir, `out-${stamp}.json`)
  await writeFile(inFile, JSON.stringify({ action, paths }), 'utf8')
  try {
    try {
      await run('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', script, '-In', inFile, '-Out', outFile,
      ], { timeout: 120000, windowsHide: true })
    } catch (error) {
      // 桥本身崩了（脚本语法错、PowerShell 不在）时，out 文件通常没写出来
      if (!existsSync(outFile)) {
        const detail = String((error && (error.stderr || error.message)) || error)
        return { ok: false, error: `recycle bridge failed: ${detail.slice(0, 400)}` }
      }
    }
    if (!existsSync(outFile)) return { ok: false, error: 'recycle bridge produced no output' }
    try {
      const parsed = JSON.parse(await readFile(outFile, 'utf8'))
      return parsed !== null && typeof parsed === 'object' ? parsed : { ok: false, error: 'bad bridge output' }
    } catch (error) {
      return { ok: false, error: `bad bridge output: ${String((error && error.message) || error)}` }
    }
  } finally {
    // 所有出口（包括提前 return）都要清掉这两个文件：in-*.json 里有会话路径。
    await rm(inFile, { force: true }).catch(() => {})
    await rm(outFile, { force: true }).catch(() => {})
  }
}

/**
 * 读一个会话的累计 token 用量。
 *
 * 数据来自**内核自己的会话投影缓存**（`storages/session_projcache/sessions/<id>.json`）——
 * 里面 `rows.tokenUsage.val.totals` 就是 DSH 界面同源的权威数字。
 *
 * 特意**不去解** `session.v3.jsonl.zstd`：那是多帧 zstd，5MB 的会话要解出 19MB 文本、
 * 花 300ms；而且里面的 `data.usage` 是「每轮一条、上下文递增」的，求和会算出 5 亿这种
 * 荒谬值。投影缓存又小又准。
 *
 * @param {string} home - DSH home。
 * @param {string} sessionId - 会话 id。
 * @returns {Promise<{total: number | null, label: string}>} 总量与人读的标签。
 */
async function sessionTokenUsage(home, sessionId) {
  const projCache = join(home, 'storages', 'session_projcache', 'sessions')
  // 与 findSessionDirs / recycleCandidatesFor 一样试两种 id 写法（裸 uuid 与 session- 前缀）。
  for (const name of sessionIdVariants(sessionId)) {
    const file = join(projCache, `${name}.json`)
    try {
      const doc = JSON.parse(await readFile(file, 'utf8'))
      const totals = doc?.record?.rows?.tokenUsage?.val?.totals
      if (totals === null || totals === undefined) continue
      const total = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
        .reduce((sum, key) => sum + (Number(totals[key]) || 0), 0)
      return { total, label: formatTokenCount(total) }
    } catch {
      // 试下一种写法
    }
  }
  return { total: null, label: '' }
}

/**
 * 把一个会话从工作区账目里摘出来（工作区本身保留）。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主上下文。
 * @param {string} sessionId - 会话 id。
 * @returns {Promise<string | undefined>} 摘除成功时返回所属工作区 id。
 */
async function detachFromWorkspace(ctx, sessionId) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return undefined
  for (const workspace of registry.list()) {
    if (!Array.isArray(workspace.sessionIds) || !workspace.sessionIds.includes(sessionId)) continue
    await workspace.detachSession(sessionId)
    return workspace.id
  }
  return undefined
}

/**
 * 把会话移出归档集合（幂等；指向已消失会话的陈旧归档项也一并清掉）。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主上下文。
 * @param {string} sessionId - 会话 id。
 * @returns {Promise<boolean>} 归档集合确实发生了变化则 true。
 */
async function dropFromArchive(ctx, sessionId) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return false
  const archived = registry.archivedSessionIds
  if (!Array.isArray(archived) || !archived.includes(sessionId)) return false
  await registry.unarchiveSession(sessionId)
  return true
}

/**
 * 「不能删」的拒绝错误：/delete 路由按 code 映射成 409。
 * @param {'running' | 'blank'} reason - 拒绝理由。
 * @returns {Error} 带 `code` 的错误。
 */
function refusalError(reason) {
  const error = new Error(reason === 'running' ? '会话还在跑' : '空白会话')
  error.code = reason === 'running' ? 'session-running' : 'session-blank'
  return error
}

/**
 * 会话是否正在跑（宿主还握着它的写句柄）。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主上下文。
 * @param {string} sessionId - 会话 id。
 * @returns {boolean} 正在运行则 true。
 */
function isRunning(ctx, sessionId) {
  try {
    const agents = ctx.get('agents')
    if (typeof agents?.get !== 'function') throw new Error('agents service unavailable')
    const agent = agents.get(sessionId)
    // 未加载的会话没有运行句柄；服务失效或返回残缺对象则不能当作空闲。
    if (agent == null) return false
    if (typeof agent.status !== 'string' || agent.status === '') throw new Error('invalid agent status')
    return agent.status === 'running'
  } catch {
    const error = new Error('暂时无法确认会话是否正在运行，已暂停删除，请稍后重试。')
    error.code = 'session-state-unavailable'
    throw error
  }
}

/**
 * 回收站的最近一次真实观察：`'permanent'`（出现过永久删除）| `'recycled'`（成功回收过）
 * | `null`（还没删过）。
 *
 * 回收站被禁用/配额满时，「送回收站」会静默退化成永久删除 —— 删完对账索引就知道了。
 * /check 据此提前给确认框递话（「将永久删除、无法找回」）；之后只要成功回收一次
 * 就自动解除，不用重启。
 */
let lastBinObservation = null

/**
 * 最近一次删除的删前探测结论（`'ok' | 'suspect' | 'unknown'`）；还没删过则 null。
 *
 * 探测是删除流程里的一部分（桥在 SHFileOperation 之前只读采集，见 recycle-bridge.js），
 * 所以 /check 拿到的是「上一次删除时这一卷的回收站长什么样」—— 第一次删除无法预警，
 * 但只要删过一次，之后每次删除前确认框就能把「可能永久丢失」说在前面。
 * 它比 lastBinObservation 更「抢跑」：suspect 是预警（可能不准），permanent 是铁证。
 */
let lastBinStatus = null

/**
 * 一条会话此刻能不能删，以及删之前该显示多少 token。
 *
 * `permanent` 是回收站的最近一次真实观察：true = 上次删除出现过永久删除，
 * 界面据此把「将永久删除、无法找回」说在确认框里。
 * `binStatus` 是最近一次删除的删前探测结论：'suspect' = 探测发现回收站可能不可用，
 * 界面据此把「可能永久丢失」说在确认框里；从没删过则是 'unknown'。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主上下文。
 * @param {string} sessionId - 会话 id。
 * @returns {Promise<Record<string, unknown>>} 判定 + 用量。
 */
async function inspectSession(ctx, sessionId) {
  const home = dshHome()
  const onDisk = (await findSessionDirs(home, sessionId)).length > 0
  const decision = deleteDecision({ running: isRunning(ctx, sessionId), onDisk })
  const usage = await sessionTokenUsage(home, sessionId)
  return {
    sessionId,
    ...decision,
    onDisk,
    ...usage,
    permanent: lastBinObservation === 'permanent',
    binStatus: lastBinStatus ?? 'unknown',
  }
}

/**
 * 删掉一个会话：先把文件送进**系统回收站**，成功后再摘账目、广播移除。
 *
 * 顺序很关键：先删文件。删文件失败就原样退出——工作区账目没动、那一行还在，
 * 主人可以重试。反过来先摘账目的话，送回收站一旦失败（文件被占用），侧栏那一行会消失，
 * 磁盘上却留着目录，看起来"删了"其实变成孤儿。
 *
 * 文件删掉之后，摘账目/广播失败都只记日志、不再报错：否则接口报失败、行还留着，
 * 再点又会因为磁盘上没目录而被判成「空白会话」，那条会话就永远删不掉了。
 *
 * 判定通过后、真正送进回收站之前会**再复查一次**运行状态：两步之间隔了一次磁盘扫描，
 * 会话可能在窗口里被启动（TOCTOU），正在写的目录绝不能被搬走。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主上下文。
 * @param {string} sessionId - 会话 id。
 * @param {{bridge?: (action: 'delete', paths: string[]) => Promise<Record<string, unknown>>}} [deps] -
 *   测试接缝：默认走真实的回收站桥，测试可注入假桥。
 * @returns {Promise<Record<string, unknown>>} 执行结果（含回收站桥如实回传的 `permanent`）。
 */
async function deleteSession(ctx, sessionId, deps = {}) {
  const runBridge = deps.bridge ?? runRecycleBridge
  const home = dshHome()
  const dirs = await findSessionDirs(home, sessionId)
  const refusal = deleteDecision({ running: isRunning(ctx, sessionId), onDisk: dirs.length > 0 })
  if (!refusal.deletable) {
    throw refusalError(refusal.reason)
  }

  // 1. 会话目录 + 投影缓存 → Windows 回收站。这一步失败就什么都不改。
  const candidates = await recycleCandidatesFor(home, sessionId)
  // TOCTOU 复查：判定到这里隔了一次磁盘扫描，会话可能在中间被启动。
  // 真正送进回收站之前必须再看一眼 —— 正在写的目录被搬走，内核那边就炸了。
  if (isRunning(ctx, sessionId)) {
    throw refusalError('running')
  }
  const sent = []
  let permanent = false
  // 删前探测的结论：桥在动手之前只读采集了这一卷的事实（binProbe），
  // 判定表在 lib/bin-status.js。没跑探测（没有候选路径）时就是 unknown。
  let binStatus = 'unknown'
  if (candidates.length > 0) {
    const bridge = await runBridge('delete', candidates)
    // 桥即使整体失败，也可能已经删掉了一部分：先把它带回的逐项结果吃进来再判断。
    const deleted = (Array.isArray(bridge.deleted) ? bridge.deleted : []).filter((item) => typeof item === 'string')
    const failed = (Array.isArray(bridge.failed) ? bridge.failed : [])
      .filter((item) => item && item.error !== 'not on disk')
    sent.push(...deleted)

    const dirSet = new Set(dirs)
    // 会话目录还留在盘上 = 真失败；只有投影缓存删不掉就算了（数字重算而已）。
    const blocked = failed.filter((item) => dirSet.has(item.path))
    if (blocked.length > 0) {
      const error = new Error(`会话目录没能全部送进回收站（多半被内核占用）: ${blocked.map((item) => item.path).join('; ')}`)
      error.code = 'move-failed'
      throw error
    }
    if (deleted.length === 0 && bridge.ok !== true) {
      const error = new Error(`会话没能送进回收站（多半被内核占用）: ${String(bridge.error || '回收站写入失败')}`)
      error.code = 'move-failed'
      throw error
    }
    if (failed.length > 0) {
      ctx.logger.warn(`session-delete: 投影缓存没删掉（不影响会话删除）: ${failed.map((item) => item.path).join('; ')}`)
    }
    // 桥的 permanent 是删完对账回收站索引得出的：true = 有路径凭空蒸发
    // （回收站被禁用/配额满时 FOF_ALLOWUNDO 会静默退化成永久删除）。
    permanent = bridge.permanent === true
    // binStatus 由桥带回的删前探测事实判定；桥没带回事实（旧脚本、桥崩过）就是 unknown。
    binStatus = decideBinStatus(bridge.binProbe)
  }
  // 顺手记一笔回收站的真实状态，供 /check 的「将永久删除」提示用（见 lastBinObservation）；
  // 删前探测结论也记一笔（见 lastBinStatus）——没删成的那次不更新，免得拿空探测当观察。
  if (sent.length > 0) {
    lastBinObservation = permanent ? 'permanent' : 'recycled'
    lastBinStatus = binStatus
  }

  // 2. 文件已经不在了，账目摘除失败也不能把错误抛回去（见上面的注释）。
  let workspaceId
  let unarchived = false
  try {
    workspaceId = await detachFromWorkspace(ctx, sessionId)
    unarchived = await dropFromArchive(ctx, sessionId)
  } catch (error) {
    ctx.logger.warn(`session-delete: 文件已删，但摘账目失败: ${String(error && error.message)}`)
  }

  // 3. 广播给所有浏览器（api-session/removed 在 dsh-api-remotes 的转发白名单里，
  //    客户端会据此把这一行从会话列表里摘掉，无需刷新）。
  //    客户端收到 200 后还会再调一次本地的同款入口兜底。
  try {
    ctx.emit('api-session/removed', sessionId)
  } catch (error) {
    ctx.logger.warn(`session-delete: 广播 api-session/removed 失败: ${String(error && error.message)}`)
  }

  ctx.logger.info(
    `session-delete: 删除 ${sessionId}（${permanent ? '回收站不可用，为永久删除' : '已送进系统回收站'}，探测 ${binStatus}）` +
    `${workspaceId === undefined ? '' : `（工作区 ${workspaceId}）`}` +
    `（回收站 ${sent.length} 项）`,
  )

  return { sessionId, moved: sent, recycled: sent.length, permanent, binStatus, unarchived }
}

/**
 * 注册路由。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主上下文。
 */
export function apply(ctx) {
  // 能不能删 + 要显示的 token 数。客户端在悬停时问一次（拿禁用状态与原因），
  // 点下去时再问一次（拿最终判定与确认框里的数字）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${BASE}/check`,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST only' })
        return
      }
      try {
        const sessionId = String((await readJsonBody(req)).sessionId || '')
        if (!isSafeSessionId(sessionId)) {
          sendJson(res, 400, { ok: false, error: `invalid sessionId: ${JSON.stringify(sessionId)}` })
          return
        }
        sendJson(res, 200, { ok: true, ...(await inspectSession(ctx, sessionId)) })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'session-delete: /check')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${BASE}/delete`,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST only' })
        return
      }
      try {
        const sessionId = String((await readJsonBody(req)).sessionId || '')
        if (!isSafeSessionId(sessionId)) {
          sendJson(res, 400, { ok: false, error: `invalid sessionId: ${JSON.stringify(sessionId)}` })
          return
        }
        // 锁按“规范 id”算：abc 与 session-abc 指向同一组目录，不能各拿各的锁。
        const lockKey = canonicalSessionId(sessionId)
        if (inFlight.has(lockKey)) {
          sendJson(res, 409, { ok: false, code: 'delete-busy', error: '这条会话正在删' })
          return
        }
        inFlight.add(lockKey)
        try {
          sendJson(res, 200, { ok: true, ...(await deleteSession(ctx, sessionId)) })
        } finally {
          inFlight.delete(lockKey)
        }
      } catch (error) {
        const code = (error && error.code) || 'delete-failed'
        const status = code === 'session-running' || code === 'session-blank' ? 409 : 500
        sendJson(res, status, { ok: false, code, error: String((error && error.message) || error) })
      }
    },
  }), 'session-delete: /delete')

  /** 自检：确认插件活着、DSH home 解析成什么、回收站桥写过没有。 */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${BASE}/status`,
    handler: (req, res) => {
      try {
        const home = dshHome()
        sendJson(res, 200, {
          ok: true,
          plugin: name,
          home,
          sessionsRoot: join(home, 'sessions'),
          permanent: lastBinObservation === 'permanent',
          binStatus: lastBinStatus ?? 'unknown',
          recycleBin: 'windows',
          bridge: existsSync(join(tmpdir(), 'dsh-session-delete', 'recycle.ps1')),
        })
      } catch (error) {
        sendJson(res, 200, { ok: false, where: 'status', error: String((error && error.stack) || error) })
      }
    },
  }), 'session-delete: /status')

  /** 最小连通性探针（排查路由冲突用）。 */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${BASE}/ping`,
    handler: (req, res) => {
      sendJson(res, 200, { ok: true, pong: Date.now() })
    },
  }), 'session-delete: /ping')
}

/**
 * 仅供测试的接缝（与 lib/client.js 的 `__test__` 同一惯例）：
 * 生产代码只走 `apply()` 注册的路由；测试用这些入口直接驱动内部流程。
 */
export const __test__ = { ensureBridgeScript, deleteSession, inspectSession, sessionTokenUsage }
