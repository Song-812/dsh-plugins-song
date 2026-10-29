/** 主机半边提供的壁纸接口。 */

/** 当前壁纸信息（主机返回）。 */
export interface WallpaperEntry {
  file: string
  media: 'image' | 'video'
  url: string
  isDefault: boolean
  updatedAt: number
}

const BASE = '/api/glass-theme'
const MAX_BYTES = 50 * 1024 * 1024

/** 解析错误响应体里的 error 字段。 */
async function errorOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error !== '') return body.error
  } catch {
    /* 不是 JSON */
  }
  return `请求失败（HTTP ${response.status}）`
}

/** 读当前壁纸；没设置或已删除时返回 null。 */
export async function fetchWallpaper(): Promise<WallpaperEntry | null> {
  const response = await fetch(`${BASE}/wallpaper`, { cache: 'no-store' })
  if (!response.ok) throw new Error(await errorOf(response))
  const body = (await response.json()) as { file?: unknown }
  if (typeof body.file !== 'string') return null
  return body as WallpaperEntry
}

/** 选一张图/一段视频上传到插件的 壁纸/ 目录。 */
export async function uploadWallpaper(file: File): Promise<WallpaperEntry> {
  if (file.size > MAX_BYTES) throw new Error(`文件太大（上限 ${MAX_BYTES / 1024 / 1024} MB）`)
  const dot = file.name.lastIndexOf('.')
  const ext = dot < 0 ? '' : file.name.slice(dot).toLowerCase()
  const response = await fetch(`${BASE}/wallpaper`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-ext': ext },
    body: await file.arrayBuffer(),
  })
  if (!response.ok) throw new Error(await errorOf(response))
  return (await response.json()) as WallpaperEntry
}

/** 清除当前壁纸（文件一并删掉；出厂图不会被动）。 */
export async function deleteWallpaper(): Promise<void> {
  const response = await fetch(`${BASE}/wallpaper`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await errorOf(response))
}

/** 在资源管理器里打开 壁纸/ 目录。 */
export async function revealWallpaperFolder(): Promise<void> {
  const response = await fetch(`${BASE}/reveal`, { method: 'POST' })
  if (!response.ok) throw new Error(await errorOf(response))
}

/** 把旧插件留下的 data URL 壁纸搬进 壁纸/ 目录。 */
export async function importDataUrl(dataUrl: string): Promise<WallpaperEntry | null> {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl)
  if (match === null) return null
  const mime = match[1].toLowerCase()
  const media = mime.startsWith('video/') ? 'video' : 'image'
  let ext: string
  if (media === 'video') {
    if (mime.includes('webm')) ext = '.webm'
    else if (mime.includes('quicktime')) ext = '.mov'
    else ext = '.mp4'
  } else if (mime.includes('png')) {
    ext = '.png'
  } else if (mime.includes('webp')) {
    ext = '.webp'
  } else if (mime.includes('gif')) {
    ext = '.gif'
  } else if (mime.includes('avif')) {
    ext = '.avif'
  } else {
    ext = '.jpg'
  }
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const response = await fetch(`${BASE}/wallpaper`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-ext': ext },
    body: bytes,
  })
  if (!response.ok) return null
  return (await response.json()) as WallpaperEntry
}
