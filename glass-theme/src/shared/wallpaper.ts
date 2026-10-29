/**
 * 壁纸文件的纯逻辑：扩展名 → 媒体类型、安全文件名、时间戳命名、文件头识别、MIME。
 * 客户端与主机半边共用，不碰 DOM / fs。
 */

/** 壁纸媒体类型。 */
export type MediaKind = 'image' | 'video'

/** 扩展名 → 媒体类型。 */
const MEDIA_BY_EXT: Readonly<Record<string, MediaKind>> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  bmp: 'image',
  avif: 'image',
  mp4: 'video',
  m4v: 'video',
  webm: 'video',
  mov: 'video',
}

/** 扩展名 → Content-Type（服务文件时用）。 */
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

/** 取小写扩展名（不含点）。 */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * 按扩展名判断媒体类型。
 * @param name - 文件名。
 * @returns 图片 / 视频 / null（不支持）。
 */
export function mediaFromName(name: string): MediaKind | null {
  return MEDIA_BY_EXT[extensionOf(name)] ?? null
}

/**
 * 只接受单层、无路径分隔符、无冒号的文件名（挡目录穿越）。
 * @param name - 文件名。
 */
export function isSafeFileName(name: string): boolean {
  if (name.length === 0 || name.length > 120) return false
  if (name === '.' || name === '..') return false
  return /^[A-Za-z0-9\u4e00-\u9fa5._-]+$/.test(name) && !name.includes('/') && !name.includes('\\') && !name.includes(':')
}

/**
 * 生成带时间戳的基本文件名（UTC）；上传端另加随机 ID 防止同毫秒重名。
 * @param ext - 带点的扩展名，如 `.jpg`。
 * @param now - 当前时间。
 */
export function buildWallpaperName(ext: string, now: Date): string {
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0')
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}` +
    `-${pad(now.getUTCMilliseconds(), 3)}`
  return `wallpaper-${stamp}${ext.toLowerCase()}`
}

/**
 * 按文件头判断媒体类型（不信扩展名）。
 * @param bytes - 文件开头若干字节。
 */
export function detectMediaFromMagic(bytes: Uint8Array): MediaKind | null {
  const at = (offset: number, ...expected: number[]): boolean =>
    expected.every((value, index) => bytes[offset + index] === value)
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image' // PNG
  if (at(0, 0xff, 0xd8, 0xff)) return 'image' // JPEG
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image' // GIF8
  if (at(0, 0x42, 0x4d)) return 'image' // BM
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image' // RIFF..WEBP
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return 'video' // WebM / MKV
  if (at(4, 0x66, 0x74, 0x79, 0x70)) {
    // ISO BMFF：品牌在偏移 8。avif/avis 是静图/连拍图，其余按视频（mp4/mov/m4v）。
    const b0 = bytes[8], b1 = bytes[9], b2 = bytes[10], b3 = bytes[11]
    if (b0 === 0x61 && b1 === 0x76 && b2 === 0x69 && (b3 === 0x66 || b3 === 0x73)) return 'image'
    return 'video'
  }
  return null
}

/**
 * 文件名的 MIME 类型；未知一律按二进制流。
 * @param name - 文件名。
 */
export function mimeFor(name: string): string {
  return MIME_BY_EXT[extensionOf(name)] ?? 'application/octet-stream'
}
