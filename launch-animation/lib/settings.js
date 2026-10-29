/**
 * dsh-launch-animation 配置读写。
 *
 * 只碰自己的目录：$DSH_HOME/launch-animation/settings.json（纯文本、可手改）。
 * 不写 profile、不写任何别人的文件；插件停用就不注入（设置页没有关闭开关）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULTS = Object.freeze({
  mode: 'full',            // full = 完整档 ~14.5 秒；fast = 引擎自带简版 4 秒
  showSkipHint: true,      // 是否显示「点击 / Esc 跳过」提示（关掉后 Esc 仍然有效）
  identityMode: 'brand',   // brand = 内置灰鲸；custom = 用下面的自定义图；none = 不显示身份图
  identityImage: '',       // identityMode=custom 时：仅允许 $DSH_HOME/launch-animation/uploads/ 下的文件
  captionMode: 'transparent', // 顶部 Windows 原生标题栏（外壳 titleBarOverlay，40px）—— 真机验证结论：
                              //   transparent = 让那条透明，动画直接透上来（2026-10-08 实测有效，默认值）
                              //   match       = 染成动画同色（随深浅主题取色）
                              //   off         = 完全不碰它（那一块会露出应用自己的浅色）
                              // 说明：这个机制是「顶部不再有白条/色块」的关键，设置页那一行已按需求删掉，
                              //       值可以在 settings.json 里手改。
})

const MODES = new Set(['full', 'fast'])
const IDENTITY_MODES = new Set(['brand', 'custom', 'none'])
const CAPTION_MODES = new Set(['match', 'transparent', 'off'])

const IMAGE_MAGIC = [
  { mime: 'image/png', test: (b) => b.length > 3 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', test: (b) => b.length > 11 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 11) === 'WEB' },
  { mime: 'image/gif', test: (b) => b.length > 5 && b.toString('ascii', 0, 4) === 'GIF8' },
  { mime: 'image/bmp', test: (b) => b.length > 3 && b.toString('ascii', 0, 2) === 'BM' },
]

export function homeDir() {
  const value = process.env.DSH_HOME
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : path.join(os.homedir(), '.dsh')
}

export function dataDir() {
  return path.join(homeDir(), 'launch-animation')
}

export function uploadsDir() {
  return path.join(dataDir(), 'uploads')
}

export function settingsFile() {
  return path.join(dataDir(), 'settings.json')
}

/** 若 candidate 解析后落在 uploads/ 内，返回解析后的绝对路径；否则返回空串。 */
export function resolveUnderUploads(candidate) {
  if (typeof candidate !== 'string') return ''
  let file = candidate.trim()
  while (file.length > 1 && ((file.startsWith('"') && file.endsWith('"')) || (file.startsWith("'") && file.endsWith("'")))) {
    file = file.slice(1, -1).trim()
  }
  if (file === '') return ''
  const uploads = path.resolve(uploadsDir())
  const resolved = path.resolve(file)
  const rel = path.relative(uploads, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return ''
  return resolved
}

export function detectImageMime(file) {
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const buf = Buffer.alloc(16)
      const n = fs.readSync(fd, buf, 0, 16, 0)
      const b = buf.subarray(0, n)
      const hit = IMAGE_MAGIC.find((entry) => entry.test(b))
      return hit ? hit.mime : null
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

function normalize(raw) {
  const source = typeof raw === 'object' && raw !== null ? raw : {}
  const mode = MODES.has(source.mode) ? source.mode : DEFAULTS.mode
  const identityMode = IDENTITY_MODES.has(source.identityMode) ? source.identityMode : DEFAULTS.identityMode
  const captionMode = CAPTION_MODES.has(source.captionMode) ? source.captionMode : DEFAULTS.captionMode
  let identityImage = typeof source.identityImage === 'string' ? source.identityImage.trim() : ''
  // 自定义图只认 uploads/ 内路径；越界的旧值清空，避免经设置接口读任意本机文件
  if (identityImage) {
    const safe = resolveUnderUploads(identityImage)
    identityImage = safe || ''
  }
  return {
    mode,
    showSkipHint: source.showSkipHint !== false,
    identityMode: identityMode === 'custom' && !identityImage ? 'brand' : identityMode,
    identityImage,
    captionMode,
  }
}

export function loadSettings() {
  try {
    return normalize(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')))
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * 串行写：同一进程里多个 POST 不会交错读-改-写丢更新。
 * Node 单线程下 sync 函数本身不会被打断；这里再用队列挡住「await 之后再写」的调用方。
 */
let saveTail = Promise.resolve()

export function saveSettings(patch) {
  const next = normalize({ ...loadSettings(), ...(typeof patch === 'object' && patch !== null ? patch : {}) })
  fs.mkdirSync(dataDir(), { recursive: true })
  writeFileAtomic(settingsFile(), `${JSON.stringify(next, null, 2)}\n`)
  return next
}

/** 异步串行封装：需要跨 await 保护时用（例如 upload 与改档位并发）。 */
export function saveSettingsQueued(patch) {
  const run = saveTail.then(() => saveSettings(patch))
  saveTail = run.then(() => {}, () => {})
  return run
}

/** 自定义身份图是否可用（在 uploads/ 内、存在、是文件、≤8MB、文件头是图）。 */
export function identityImageState(settings) {
  const raw = settings.identityImage
  if (settings.identityMode !== 'custom') return { ok: false, reason: 'not-custom', file: raw }
  if (!raw) return { ok: false, reason: 'empty', file: raw }
  const file = resolveUnderUploads(raw)
  if (!file) return { ok: false, reason: 'outside-uploads', file: raw }
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile()) return { ok: false, reason: 'not-a-file', file }
    if (stat.size > 8 * 1024 * 1024) return { ok: false, reason: 'too-large', file }
    if (!detectImageMime(file)) return { ok: false, reason: 'not-image', file }
    return { ok: true, reason: 'ok', file, bytes: stat.size }
  } catch {
    return { ok: false, reason: 'missing', file }
  }
}

/** 把自定义身份图读成 data URL；读不到就返回 null（宿主会回落到内置灰鲸）。 */
export function identityImageDataUrl(settings) {
  const state = identityImageState(settings)
  if (!state.ok) return null
  try {
    const mime = detectImageMime(state.file) || 'image/png'
    const buffer = fs.readFileSync(state.file)
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

/** 清空 uploads/（恢复默认时调用）。当前引用的文件一并删掉。 */
export function clearUploads() {
  const dir = uploadsDir()
  try {
    if (!fs.existsSync(dir)) return { ok: true, removed: 0 }
    let removed = 0
    let failed = 0
    for (const name of fs.readdirSync(dir)) {
      try {
        fs.rmSync(path.join(dir, name), { force: true, recursive: true })
        removed += 1
      } catch {
        failed += 1
      }
    }
    return failed > 0 ? { ok: false, removed, error: `${failed} 个文件或目录未能删除` } : { ok: true, removed }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
}

/** 1×1 透明 PNG：identityMode=none 时用它，身份段就只剩雷达环和字标。 */
export const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/**
 * 原子写：先写同目录临时文件，再整体替换。
 *
 * 直接 writeFileSync 会先把目标截断：写一半失败（磁盘满、进程被杀）时配置就变成空文件
 * 或半截 JSON，下次读取会静默回落默认值 —— 相当于配置被悄悄清空。
 */
function writeFileAtomic(file, text) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(temp, text, 'utf8')
    fs.renameSync(temp, file)
  } catch (error) {
    try { fs.unlinkSync(temp); } catch { /* 临时文件可能压根没建出来 */ }
    throw error
  }
}
