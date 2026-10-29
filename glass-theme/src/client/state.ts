/** 客户端状态：设置（localStorage）与壁纸（主机文件）各一个 store，页面用 useSyncExternalStore 订阅。 */
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  migrateLegacy,
  normalizeSettings,
  parseSettings,
  serializeSettings,
  type GlassSettings,
} from '../shared/settings.ts'
import {
  deleteWallpaper,
  fetchWallpaper,
  importDataUrl,
  revealWallpaperFolder,
  uploadWallpaper,
  type WallpaperEntry,
} from './api.ts'

/** 安全读 localStorage（隐私模式/配额异常时不炸）。 */
function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** 安全写 localStorage。 */
function setItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** 启动时读设置：优先新键；没有就从旧插件的 dsh.ui-aqua.* 搬一次。 */
export function loadInitialSettings(): { settings: GlassSettings; legacyWallpaper: string | null } {
  const stored = getItem(SETTINGS_KEY)
  let settings: GlassSettings
  if (stored !== null) {
    settings = parseSettings(stored)
  } else {
    const legacy = migrateLegacy(getItem)
    settings = legacy.settings
    setItem(SETTINGS_KEY, serializeSettings(settings))
  }
  return { settings, legacyWallpaper: readLegacyWallpaper() }
}

/** 旧壁纸只搬一次：成功后打标记，避免用户删掉壁纸又被搬回来。 */
const LEGACY_WALLPAPER_DONE_KEY = 'dsh-glass-theme.wallpaperMigrated'

/** 读旧插件的壁纸 data URL（没搬过才读）。 */
function readLegacyWallpaper(): string | null {
  if (getItem(LEGACY_WALLPAPER_DONE_KEY) === '1') return null
  const raw = getItem('dsh.ui-aqua.wallpaper')
  return raw !== null && /^data:(image|video)\//.test(raw) ? raw : null
}

/** 标记旧壁纸已经搬完。 */
export function markLegacyWallpaperMigrated(): void {
  setItem(LEGACY_WALLPAPER_DONE_KEY, '1')
}

/** 设置的订阅容器。 */
export class SettingsStore {
  private value: GlassSettings
  private readonly listeners = new Set<() => void>()

  constructor(initial: GlassSettings) {
    this.value = initial
  }

  getSnapshot = (): GlassSettings => this.value

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 合并一个补丁并落盘；内存态也回洗，避免坏值写上 DOM。 */
  update(patch: Partial<GlassSettings>): boolean {
    this.value = normalizeSettings({ ...this.value, ...patch })
    const saved = setItem(SETTINGS_KEY, serializeSettings(this.value))
    this.emit()
    return saved
  }

  /** 回到出厂参数。 */
  reset(): boolean {
    this.value = { ...DEFAULT_SETTINGS }
    const saved = setItem(SETTINGS_KEY, serializeSettings(this.value))
    this.emit()
    return saved
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        /* 单个订阅出错不影响其它 */
      }
    }
  }
}

/** 壁纸快照。 */
export interface WallpaperSnapshot {
  entry: WallpaperEntry | null | undefined
  error: string | null
  busy: boolean
}

/** 壁纸的订阅容器：状态从主机文件目录来。 */
export class WallpaperStore {
  private snapshot: WallpaperSnapshot = { entry: undefined, error: null, busy: false }
  private readonly listeners = new Set<() => void>()
  /** 只接受最新操作的读取响应；上传/删除会让之前的读取立即过期。 */
  private revision = 0

  getSnapshot = (): WallpaperSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private set(patch: Partial<WallpaperSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** 重新读主机状态。 */
  async refresh(): Promise<void> {
    if (this.snapshot.busy) return
    const revision = ++this.revision
    try {
      const entry = await fetchWallpaper()
      if (revision !== this.revision) return
      this.set({ entry, error: null })
    } catch (error) {
      if (revision !== this.revision) return
      this.set({ entry: null, error: String((error as Error)?.message ?? error) })
    }
  }

  /** 上传并切换壁纸。 */
  async upload(file: File): Promise<boolean> {
    if (this.snapshot.busy) return false
    ++this.revision
    this.set({ busy: true, error: null })
    try {
      const entry = await uploadWallpaper(file)
      this.set({ entry, busy: false })
      return true
    } catch (error) {
      this.set({ busy: false, error: String((error as Error)?.message ?? error) })
      return false
    }
  }

  /** 删除当前壁纸。 */
  async remove(): Promise<boolean> {
    if (this.snapshot.busy) return false
    ++this.revision
    this.set({ busy: true, error: null })
    try {
      await deleteWallpaper()
      this.set({ entry: null, busy: false })
      return true
    } catch (error) {
      this.set({ busy: false, error: String((error as Error)?.message ?? error) })
      return false
    }
  }

  /** 打开 壁纸/ 目录。 */
  async reveal(): Promise<boolean> {
    this.set({ error: null })
    try {
      await revealWallpaperFolder()
      return true
    } catch (error) {
      this.set({ error: String((error as Error)?.message ?? error) })
      return false
    }
  }

  /** 旧插件的 data URL 壁纸 -> 主机文件。 */
  async importLegacy(dataUrl: string): Promise<boolean> {
    if (this.snapshot.busy) return false
    ++this.revision
    this.set({ busy: true })
    try {
      const entry = await importDataUrl(dataUrl)
      if (entry === null) return false
      this.set({ entry })
      return true
    } catch {
      return false
    } finally {
      this.set({ busy: false })
    }
  }
}
