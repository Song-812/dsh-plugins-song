/**
 * 玻璃主题 · 主机半边。
 *
 * 只做壁纸文件的存取，不碰 DSH 自身文件：
 *   GET    /api/glass-theme/wallpaper       当前壁纸状态（file / media / url）
 *   POST   /api/glass-theme/wallpaper       上传图片或视频（二进制体 + x-ext 头）
 *   DELETE /api/glass-theme/wallpaper       清除壁纸
 *   GET    /api/glass-theme/file            当前壁纸字节（支持 Range，视频可播）
 *   GET    /api/glass-theme/font?i=1..3     Space Grotesk 三段子集
 *   POST   /api/glass-theme/reveal          在资源管理器里打开「壁纸」文件夹
 *
 * 文件落在插件自己的 壁纸/ 目录：复制插件文件夹就带着壁纸一起走。
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  buildWallpaperName,
  detectMediaFromMagic,
  isSafeFileName,
  mediaFromName,
  mimeFor,
  type MediaKind,
} from '../shared/wallpaper.ts'
import { streamFile } from './serve-file.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const WALLPAPER_DIR = path.join(ROOT, '壁纸')
const FONT_DIR = path.join(ROOT, 'assets', 'fonts')
const STATE_FILE = path.join(WALLPAPER_DIR, 'state.json')
const DEFAULT_WALLPAPER = '默认壁纸.jpg'
const ROUTE = '/api/glass-theme'
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const FONT_FILES = ['space-grotesk-1.woff2', 'space-grotesk-2.woff2', 'space-grotesk-3.woff2']
const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.mp4', '.m4v', '.webm', '.mov'])

/** 当前壁纸状态：undefined = 从没设置过（用出厂图），file=null = 明确删除。 */
interface WallpaperState {
  file: string | null
}

/** 主机侧返回给页面的壁纸信息。 */
interface WallpaperEntry {
  file: string
  media: MediaKind
  url: string
  isDefault: boolean
  updatedAt: number
}

function ensureDir(): void {
  fs.mkdirSync(WALLPAPER_DIR, { recursive: true })
}

function statePath(): string {
  return STATE_FILE
}

function readState(): WallpaperState | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as unknown
    if (parsed === null || typeof parsed !== 'object') return undefined
    const file = (parsed as { file?: unknown }).file
    if (file === null) return { file: null }
    if (typeof file === 'string' && isSafeFileName(file)) return { file }
    return undefined
  } catch {
    return undefined
  }
}

/** 原子写 state.json：先写唯一临时文件再改名，避免写一半被读到。 */
function writeState(state: WallpaperState): void {
  ensureDir()
  const tmp = `${STATE_FILE}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, STATE_FILE)
  } catch (error) {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* 临时文件可能压根没建出来 */
    }
    throw error
  }
}

/** 壁纸目录一条写链：并发上传/删除不会互踩留下孤儿文件。 */
const writeChains = new Map<string, Promise<unknown>>()

function queueWrite<T>(task: () => Promise<T> | T): Promise<T> {
  const key = WALLPAPER_DIR
  const previous = writeChains.get(key) ?? Promise.resolve()
  const next = previous.then(task, task)
  writeChains.set(key, next.then(() => undefined, () => undefined))
  return next
}

function fileExists(name: string): boolean {
  try {
    return fs.statSync(path.join(WALLPAPER_DIR, name)).isFile()
  } catch {
    return false
  }
}

/** 当前该显示哪个文件（出厂图只在从没设置过时兜底）。 */
function currentFile(): { name: string; isDefault: boolean } | null {
  const state = readState()
  if (state === undefined) {
    return fileExists(DEFAULT_WALLPAPER) ? { name: DEFAULT_WALLPAPER, isDefault: true } : null
  }
  if (state.file === null) return null
  return fileExists(state.file) ? { name: state.file, isDefault: state.file === DEFAULT_WALLPAPER } : null
}

function entryFor(file: string, isDefault: boolean): WallpaperEntry {
  const stat = fs.statSync(path.join(WALLPAPER_DIR, file))
  return {
    file,
    media: mediaFromName(file) ?? 'image',
    url: `${ROUTE}/file?v=${encodeURIComponent(file)}-${stat.mtimeMs.toFixed(0)}`,
    isDefault,
    updatedAt: stat.mtimeMs,
  }
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

function removeUserWallpaper(name: string | null, strict = false): void {
  if (name === null || name === DEFAULT_WALLPAPER || !name.startsWith('wallpaper-')) return
  try {
    fs.unlinkSync(path.join(WALLPAPER_DIR, name))
  } catch (error) {
    if (strict && (error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    /* 已经不在了，或替换壁纸后清理旧文件失败。 */
  }
}

async function handleWallpaper(request: Request): Promise<Response> {
  if (request.method === 'GET') {
    const current = currentFile()
    return json(200, current === null ? { file: null } : entryFor(current.name, current.isDefault))
  }

  if (request.method === 'DELETE') {
    return queueWrite(async () => {
      const previous = readState()
      try {
        removeUserWallpaper(previous?.file ?? null, true)
      } catch (error) {
        return json(500, { error: `删除壁纸失败：${String((error as Error)?.message ?? error)}` })
      }
      try {
        writeState({ file: null })
      } catch (error) {
        return json(500, { error: `壁纸文件已处理，但保存状态失败：${String((error as Error)?.message ?? error)}` })
      }
      return json(200, { file: null })
    })
  }

  if (request.method !== 'POST') return json(405, { error: '只支持 GET / POST / DELETE' })

  const declared = Number(request.headers.get('content-length') ?? 'NaN')
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return json(413, { error: `文件太大（上限 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB）` })
  }

  const rawExt = (request.headers.get('x-ext') ?? '').toLowerCase()
  if (!EXTENSIONS.has(rawExt)) return json(400, { error: '不支持的扩展名' })

  return queueWrite(async () => {
    let buffer: Buffer
    try {
      const ab = await request.arrayBuffer()
      if (ab.byteLength > MAX_UPLOAD_BYTES) return json(413, { error: '文件太大' })
      buffer = Buffer.from(ab)
    } catch {
      return json(400, { error: '读取上传内容失败' })
    }
    if (buffer.length === 0) return json(400, { error: '文件是空的' })

    const media = detectMediaFromMagic(buffer.subarray(0, 16))
    if (media === null) return json(400, { error: '文件内容不是图片或视频' })

    const expected = mediaFromName(`x${rawExt}`)
    if (expected !== media) return json(400, { error: '扩展名与文件内容不一致' })

    ensureDir()
    const baseName = buildWallpaperName(rawExt, new Date())
    const name = `${baseName.slice(0, -rawExt.length)}-${randomUUID()}${rawExt}`
    const dest = path.join(WALLPAPER_DIR, name)
    try {
      // 按块写入，避免再复制一份巨大 Buffer；成功后再改 state / 删旧文件。
      const fd = fs.openSync(dest, 'wx')
      try {
        const chunk = 1024 * 1024
        for (let offset = 0; offset < buffer.length; offset += chunk) {
          fs.writeSync(fd, buffer, offset, Math.min(chunk, buffer.length - offset))
        }
      } finally {
        fs.closeSync(fd)
      }
    } catch (error) {
      try {
        fs.unlinkSync(dest)
      } catch {
        /* 可能根本没建出来 */
      }
      return json(500, { error: `写文件失败：${String((error as Error)?.message ?? error)}` })
    }

    const previous = readState()
    try {
      writeState({ file: name })
    } catch (error) {
      try {
        fs.unlinkSync(dest)
      } catch {
        /* ignore */
      }
      return json(500, { error: `写状态失败：${String((error as Error)?.message ?? error)}` })
    }
    removeUserWallpaper(previous?.file ?? null)
    return json(200, entryFor(name, false))
  })
}

/** 当前壁纸字节，带 Range 支持（视频循环播放）；按需流式读取，不整文件进内存。 */
function handleFile(request: Request): Response {
  const current = currentFile()
  if (current === null) return new Response('no wallpaper', { status: 404 })
  try {
    const file = path.join(WALLPAPER_DIR, current.name)
    return streamFile(file, mimeFor(current.name), request.headers.get('range'))
  } catch {
    return new Response('unreadable', { status: 500 })
  }
}

function handleFont(request: Request): Response {
  const index = Number(new URL(request.url).searchParams.get('i') ?? '0')
  const name = FONT_FILES[index - 1]
  if (name === undefined) return new Response('not found', { status: 404 })
  try {
    const bytes = fs.readFileSync(path.join(FONT_DIR, name))
    return new Response(new Uint8Array(bytes), {
      headers: { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=31536000, immutable' },
    })
  } catch {
    return new Response('missing font', { status: 404 })
  }
}

function handleReveal(): Response {
  ensureDir()
  if (process.platform === 'win32') {
    spawn('explorer.exe', [WALLPAPER_DIR], { detached: true, stdio: 'ignore' }).unref()
  }
  return json(200, { ok: true })
}

/**
 * 插件入口：把六条本机路由挂到宿主 web 服务上。
 * @param ctx - 宿主 Cordis 上下文。
 */
export function apply(ctx: any): void {
  ctx.inject(['connection'], (host: any) => {
    const disposers: (() => void)[] = []
    const cleanup = (): void => {
      for (const dispose of disposers.splice(0).reverse()) {
        try { dispose() } catch { /* 继续清理剩余接口 */ }
      }
    }
    const register = (endpoint: string, methods: string[], handler: (request: Request) => Response | Promise<Response>): void => {
      const dispose = host.connection.fetch.register({
        path: ROUTE + endpoint,
        methods,
        requestBody: 'buffered',
        fetch: handler,
      })
      if (typeof dispose === 'function') disposers.push(dispose)
    }
    try {
      register('/wallpaper', ['GET', 'POST', 'DELETE'], handleWallpaper)
      register('/file', ['GET'], handleFile)
      register('/font', ['GET'], handleFont)
      register('/reveal', ['POST'], handleReveal)
      return cleanup
    } catch (error) {
      cleanup()
      throw error
    }
  })
}

export const name = 'glass-theme'

/** 给测试/诊断用：暴露目录常量与写锁。 */
export const paths = { ROOT, WALLPAPER_DIR, STATE_FILE, DEFAULT_WALLPAPER }
export const __test__ = { queueWrite, writeState, MAX_UPLOAD_BYTES }
