/**
 * 主题设置：默认值、校验、旧版（dsh.ui-aqua.*）迁移、重点色的可读底色。
 * 纯函数，不碰 DOM —— 单元测试直接跑。
 */

/** 新版设置对象。 */
export interface GlassSettings {
  /** 全局重点色，#RRGGBB。 */
  accent: string
  /** 玻璃模糊半径，px。 */
  blur: number
  /** 磨砂度 0-100。 */
  frost: number
  /** 壁纸模糊半径，px。 */
  wallpaperBlur: number
  /** 壁纸磨砂度 0-100。 */
  wallpaperFrost: number
  /** 视频模糊半径，px。 */
  videoBlur: number
  /** 视频亮度 0-100（越低越暗）。 */
  videoBrightness: number
  /** 背景亮度 0-100（浅色 50-100 提亮、深色 0-50 压暗）。 */
  bgBrightness: number
  /** 悬停上浮。 */
  press: boolean
  /** 鼠标辉光。 */
  spotlight: boolean
}

type NumericSettingKey = {
  [Key in keyof GlassSettings]: GlassSettings[Key] extends number ? Key : never
}[keyof GlassSettings]

/** 出厂观感：模糊 4 / 磨砂 55 / 壁纸模糊 0 / 壁纸磨砂 20 / 重点色粉。 */
export const DEFAULT_SETTINGS: GlassSettings = Object.freeze({
  accent: '#F077AF',
  blur: 4,
  frost: 55,
  wallpaperBlur: 0,
  wallpaperFrost: 20,
  videoBlur: 6,
  videoBrightness: 45,
  bgBrightness: 50,
  press: true,
  spotlight: true,
})

/** localStorage 键：新插件自己的命名空间。 */
export const SETTINGS_KEY = 'dsh-glass-theme.v1'

/** 旧插件留下的键 → 新字段。只搬仍然存在的旋钮。 */
const LEGACY_KEYS: ReadonlyArray<readonly [string, NumericSettingKey | 'press' | 'spotlight']> = [
  ['dsh.ui-aqua.blur', 'blur'],
  ['dsh.ui-aqua.frost', 'frost'],
  ['dsh.ui-aqua.wallpaperBlur', 'wallpaperBlur'],
  ['dsh.ui-aqua.wallpaperFrost', 'wallpaperFrost'],
  ['dsh.ui-aqua.videoBlur', 'videoBlur'],
  ['dsh.ui-aqua.videoBrightness', 'videoBrightness'],
  ['dsh.ui-aqua.bgBrightness', 'bgBrightness'],
  ['dsh.ui-aqua.press', 'press'],
  ['dsh.ui-aqua.spotlight', 'spotlight'],
]

/** 旧插件存壁纸的键（data URL，迁移时交给主机侧写成文件）。 */
const LEGACY_WALLPAPER_KEY = 'dsh.ui-aqua.wallpaper'

/** 数值旋钮的取值范围。 */
const RANGES: Readonly<Record<NumericSettingKey, readonly [number, number]>> = {
  blur: [0, 40],
  frost: [0, 100],
  wallpaperBlur: [0, 40],
  wallpaperFrost: [0, 100],
  videoBlur: [0, 40],
  videoBrightness: [0, 100],
  bgBrightness: [0, 100],
}

/** 把任意输入夹到整数范围；坏值退回兜底。 */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** 布尔值只认 true/false 与它们的字符串形式，其余退回兜底。 */
function readBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return fallback
}

/**
 * 校验 #RRGGBB 颜色；不合法时退回兜底色。
 * @param value - 候选值。
 * @param fallback - 兜底色。
 */
export function normalizeHex(value: unknown, fallback: string = DEFAULT_SETTINGS.accent): string {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toUpperCase() : fallback
}

/**
 * 任意输入 → 合法设置。缺项/坏值一律退回默认值。
 * @param input - 存储里读到的对象。
 */
export function normalizeSettings(input: unknown): GlassSettings {
  if (input === null || typeof input !== 'object') return { ...DEFAULT_SETTINGS }
  const raw = input as Record<string, unknown>
  const out = { ...DEFAULT_SETTINGS }
  out.accent = normalizeHex(raw.accent, DEFAULT_SETTINGS.accent)
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    const field = key as NumericSettingKey
    out[field] = clampNumber(raw[field], min, max, DEFAULT_SETTINGS[field])
  }
  out.press = readBoolean(raw.press, DEFAULT_SETTINGS.press)
  out.spotlight = readBoolean(raw.spotlight, DEFAULT_SETTINGS.spotlight)
  return out
}

/**
 * 解析 localStorage 里的 JSON 文本。
 * @param raw - 原始字符串（可为 null）。
 */
export function parseSettings(raw: string | null): GlassSettings {
  if (raw === null || raw === '') return { ...DEFAULT_SETTINGS }
  try {
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * 序列化为存储文本。
 * @param settings - 合法设置。
 */
export function serializeSettings(settings: GlassSettings): string {
  return JSON.stringify(normalizeSettings(settings))
}

/**
 * 从旧插件（dsh.ui-aqua.*）搬迁设置与壁纸。
 * @param read - localStorage 读取器（测试里可注入）。
 * @returns 合并后的设置，以及需要落盘的旧壁纸 data URL（没有则 null）。
 */
export function migrateLegacy(
  read: (key: string) => string | null,
): { settings: GlassSettings; wallpaper: string | null } {
  const settings = { ...DEFAULT_SETTINGS }
  for (const [key, field] of LEGACY_KEYS) {
    const raw = read(key)
    if (raw === null) continue
    if (field === 'press' || field === 'spotlight') {
      settings[field] = readBoolean(raw, settings[field])
    } else {
      const [min, max] = RANGES[field] ?? [0, 100]
      settings[field] = clampNumber(raw, min, max, settings[field])
    }
  }
  const wallpaper = read(LEGACY_WALLPAPER_KEY)
  return {
    settings,
    wallpaper: wallpaper !== null && /^data:(image|video)\//.test(wallpaper) ? wallpaper : null,
  }
}

/** 相对亮度（WCAG）。 */
function luminance(hex: string): number {
  const value = normalizeHex(hex)
  const channel = (offset: number): number => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/**
 * 重点色上应该用哪种字色：亮色配深墨，暗色配白。
 * 阈值 0.3 是按「粉 #F077AF 用深墨、蓝 #4D7CFE 用白」定的。
 * @param hex - 重点色。
 */
export function inkFor(hex: string): '#13243E' | '#FFFFFF' {
  return luminance(hex) >= 0.3 ? '#13243E' : '#FFFFFF'
}
