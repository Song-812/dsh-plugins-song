/**
 * dsh-global-rules 宿主半边：给「设置 → 全局规则」面板提供读写接口。
 *
 * 端点走 Connection 的精确 Fetch 注册表，因此落在 /api 的同源围栏与浏览器鉴权之内：
 *   GET  /api/global-rules              → { exists, content }
 *   POST /api/global-rules { content }  → { ok: true }          写规则（文件不存在就创建）
 *   POST /api/global-rules { action:"reset" } → { ok: true }    先备份旧规则，再把文件清成 0 字节
 *
 * 备份目录：$DSH_GLOBAL_RULES_BACKUP_DIR，未设置时用 <DSH_HOME>/global-rules-backups。
 * 只保留最近一份有内容的备份：空规则没有备份价值，不会把有用的那份冲掉。
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const name = 'global-rules'

const FILE_NAME = 'AGENTS.md'
const HOME_ENV = 'DSH_HOME'
const HOME_DIR_NAME = '.dsh'
const ROUTE_PATH = '/api/global-rules'

/** 请求体上限：规则文件是纯文本，256 KiB 足够，也挡住误发的超大请求。 */
const MAX_BODY_BYTES = 256 * 1024

/** 备份目录：环境变量优先（测试用），否则放在 DSH 主目录下。 */
const BACKUP_DIR_ENV = 'DSH_GLOBAL_RULES_BACKUP_DIR'
const BACKUP_DIR_NAME = 'global-rules-backups'
const BACKUP_PREFIX = 'AGENTS-'
const BACKUP_SUFFIX = '.md'

/** JSON 响应，带 no-store：规则内容不该被浏览器缓存。 */
function jsonResponse(status, payload) {
  return Response.json(payload, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

/** 抛出值的可读文字，写进失败的响应体（界面只显示"失败"，不显示这段）。 */
function messageOf(error) {
  return String((error && error.message) || error)
}

/** 展开 ~ / ~\ 前缀。 */
function expandHomePath(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/** 与内置指令加载器同规则：非空 $DSH_HOME 优先，否则 ~/.dsh。 */
function resolveHome() {
  const configured = process.env[HOME_ENV]
  const chosen = configured !== undefined && configured.trim().length > 0
    ? configured
    : join(homedir(), HOME_DIR_NAME)
  return resolve(expandHomePath(chosen))
}

/** 备份目录（绝对路径）；环境变量里的 ~ 也会展开。 */
function backupDir() {
  const configured = process.env[BACKUP_DIR_ENV]
  if (typeof configured === 'string' && configured.trim() !== '') {
    return resolve(expandHomePath(configured.trim()))
  }
  return join(resolveHome(), BACKUP_DIR_NAME)
}

/** 备份文件名用的本地时间戳：YYYYMMDD-HHmmss-SSS（含毫秒，避免同秒撞名）。 */
function timestamp(date = new Date()) {
  const pad = (value, width = 2) => String(value).padStart(width, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    + `-${pad(date.getMilliseconds(), 3)}`
}

/** 读规则文件；不存在时返回 null（区别于存在但为空）。 */
async function readRules(file) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

/**
 * 原子写：先写同目录临时文件、读回校验，再整体替换目标。
 * 中途失败（磁盘满、进程被杀）时目标文件保持原样，不会变成半截内容。
 */
async function writeFileAtomic(file, content) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temp, content, 'utf8')
    const readBack = await readFile(temp, 'utf8')
    if (readBack !== content) throw new Error('write verification failed')
    await rename(temp, file)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/** 写规则文件：父目录不存在就先建出来，否则界面说"保存将创建它"却兑现不了。 */
async function writeRules(file, content) {
  // AGENTS.md 若是符号链接，写到链接指向的真文件，别用 rename 把链接本身换成普通文件。
  const target = await realpath(file).catch(() => file)
  await mkdir(dirname(target), { recursive: true })
  await writeFileAtomic(target, content)
}

/** 只保留最近一份备份，其余删掉；只认本插件的文件名格式，别误删目录里别的东西。 */
const BACKUP_PATTERN = /^AGENTS-\d{8}-\d{6}-\d{3}\.md$/

async function pruneBackups(directory, keep) {
  const names = await readdir(directory)
  const stale = names.filter((entry) => BACKUP_PATTERN.test(entry) && join(directory, entry) !== keep)
  await Promise.all(stale.map((entry) => unlink(join(directory, entry)).catch(() => {})))
}

/**
 * 把清空前的规则存一份备份。
 * 空内容不备份：连点两次「恢复默认」时，第二次是空文件，不该把有价值的那份冲掉。
 */
async function backupRules(file, content) {
  if (content === null || content.trim() === '') return null
  const directory = backupDir()
  await mkdir(directory, { recursive: true })
  const target = join(directory, `${BACKUP_PREFIX}${timestamp()}${BACKUP_SUFFIX}`)
  await writeFileAtomic(target, content)
  await pruneBackups(directory, target)
  return target
}

/** 恢复默认：先备份，再清成 0 字节。 */
async function resetRules(file) {
  const existing = await readRules(file)
  await backupRules(file, existing)
  await writeRules(file, '')
}

/**
 * 所有写操作排队执行。
 * 否则"清空"读到旧内容 A 后挂起、另一个"保存"写进 B，清空随后把 B 抹掉，
 * 备份里却只有 A —— 用户看到保存成功，规则却没了。
 */
let writeChain = Promise.resolve()

function serialize(task) {
  const result = writeChain.then(task, task)
  writeChain = result.then(() => {}, () => {})
  return result
}

/** 读请求体并解析成 JSON 对象；不合规时返回错误响应。 */
async function readJsonBody(request) {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { error: jsonResponse(413, { error: 'request body too large' }) }
  }
  let text
  try {
    text = await request.text()
  } catch {
    return { error: jsonResponse(400, { error: 'request body must be JSON' }) }
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return { error: jsonResponse(413, { error: 'request body too large' }) }
  }
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return { error: jsonResponse(400, { error: 'request body must be JSON' }) }
  }
  if (typeof body !== 'object' || body === null) {
    return { error: jsonResponse(400, { error: 'request body must be a JSON object' }) }
  }
  return { body }
}


/** 内容的版本号（短哈希）：保存/清空时带上它，能发现「别的窗口已经改过」。 */
function versionOf(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16)
}

/** 文件当前版本；不存在当作空内容的版本。 */
async function currentVersion(file) {
  const content = await readRules(file)
  return versionOf(content === null ? '' : content)
}

/**
 * 请求带了 baseVersion 且与磁盘不符时，返回 409。
 * 不带 baseVersion 的旧调用照旧放行（升级前后都能用）。
 */
async function staleResponse(file, baseVersion) {
  if (typeof baseVersion !== 'string' || baseVersion === '') return null
  const version = await currentVersion(file)
  if (version === baseVersion) return null
  return jsonResponse(409, { error: 'rules changed elsewhere', code: 'stale', version })
}

/** 处理一次面板请求。 */
async function handle(request, file) {
  if (request.method === 'GET') {
    try {
      const content = await readRules(file)
      const version = versionOf(content === null ? '' : content)
      return content === null
        ? jsonResponse(200, { exists: false, content: '', version })
        : jsonResponse(200, { exists: true, content, version })
    } catch (error) {
      return jsonResponse(500, { error: messageOf(error) })
    }
  }

  const parsed = await readJsonBody(request)
  if (parsed.error) return parsed.error
  const body = parsed.body

  try {
    // 版本检查必须和写入在同一个串行段里：放在队列外，两个请求会同时读到旧内容、
    // 都通过检查，后一个再覆盖前一个。
    if (body.action === 'reset') {
      return await serialize(async () => {
        const stale = await staleResponse(file, body.baseVersion)
        if (stale !== null) return stale
        await resetRules(file)
        return jsonResponse(200, { ok: true, version: versionOf('') })
      })
    }
    if (typeof body.content !== 'string') {
      return jsonResponse(400, { error: 'content must be a string' })
    }
    return await serialize(async () => {
      const stale = await staleResponse(file, body.baseVersion)
      if (stale !== null) return stale
      await writeRules(file, body.content)
      return jsonResponse(200, { ok: true, version: versionOf(body.content) })
    })
  } catch (error) {
    return jsonResponse(500, { error: messageOf(error) })
  }
}

export function apply(ctx) {
  const file = join(resolveHome(), FILE_NAME)
  ctx.inject(['connection'], (host) => {
    host.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: (request) => handle(request, file),
    })
  })
}
