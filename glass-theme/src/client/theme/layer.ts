/** 主题层：背景（壁纸/视频）、CSS 变量、属性开关、边缘渐变、辉光。 */
import { inkFor, type GlassSettings } from '../../shared/settings.ts'
import type { SettingsStore, WallpaperStore, WallpaperSnapshot } from '../state.ts'
import { startSeamStamper } from './seams.ts'
import { startSpotlight } from './spotlight.ts'
import { startOverlayScrollbar } from './overlay-scrollbar.ts'
import { startWordmarkBadge } from './wordmark.ts'

/** 主题层：插件活着就一直开着；停用插件 = 整层移除。 */
export class GlassLayer {
  private background: HTMLDivElement | null = null
  private image: HTMLImageElement | null = null
  private video: HTMLVideoElement | null = null
  private fades: HTMLElement[] = []
  private cleanups: Array<() => void> = []
  private lastUrl: string | null = null

  constructor(
    private readonly settings: SettingsStore,
    private readonly wallpaper: WallpaperStore,
  ) {}

  /**
   * 挂载主题层并订阅设置/壁纸变化。
   * @returns 卸载函数（插件停用时调用）。
   */
  start(): () => void {
    this.buildDom()
    this.cleanups.push(this.settings.subscribe(() => this.applySettings()))
    this.cleanups.push(this.wallpaper.subscribe(() => this.applyWallpaper(this.wallpaper.getSnapshot())))
    this.cleanups.push(startSeamStamper())
    this.cleanups.push(startSpotlight())
    this.cleanups.push(startOverlayScrollbar())
    this.cleanups.push(startWordmarkBadge())
    /* 宿主切换深浅色时重算亮度黑白膜（与 SettingsPage / wordmark 同一钩子） */
    const themeObserver = new MutationObserver(() => { this.applySettings() })
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    this.cleanups.push(() => { themeObserver.disconnect() })
    this.applySettings()
    this.applyWallpaper(this.wallpaper.getSnapshot())
    return () => {
      for (const dispose of this.cleanups) {
        try {
          dispose()
        } catch {
          /* 单项清理失败不影响整体 */
        }
      }
      this.cleanups = []
      this.teardown()
    }
  }

  /** 背景层与上下渐变带。 */
  private buildDom(): void {
    const background = document.createElement('div')
    background.setAttribute('data-glass-bg', '')
    const image = document.createElement('img')
    image.alt = ''
    image.setAttribute('data-glass-image', '')
    const video = document.createElement('video')
    video.muted = true
    video.loop = true
    video.autoplay = true
    video.playsInline = true
    video.setAttribute('data-glass-video', '')
    const dim = document.createElement('div')
    dim.setAttribute('data-glass-dim', '')
    background.append(image, video, dim)
    document.body.prepend(background)

    const top = document.createElement('div')
    top.setAttribute('data-glass-fade', 'top')
    const bottom = document.createElement('div')
    bottom.setAttribute('data-glass-fade', 'bottom')
    document.body.append(top, bottom)

    this.background = background
    this.image = image
    this.video = video
    this.fades = [top, bottom]
    document.documentElement.setAttribute('data-glass', '')
  }

  /** 把设置写成 CSS 变量与 html 属性。 */
  private applySettings(): void {
    const s: GlassSettings = this.settings.getSnapshot()
    const root = document.documentElement
    const style = root.style
    const dark = document.body.hasAttribute('data-ds-dark-theme')

    style.setProperty('--glass-accent', s.accent)
    style.setProperty('--glass-accent-ink', inkFor(s.accent))
    style.setProperty('--glass-blur', `${s.blur}px`)
    style.setProperty('--glass-frost', String(Math.min(s.frost / 50, 1.4)))
    style.setProperty('--glass-surface-frost', String(Math.min((s.frost + 20) / 50, 1.4)))
    style.setProperty('--glass-wallpaper-blur', `${s.wallpaperBlur}px`)
    style.setProperty('--glass-wallpaper-frost', String(s.wallpaperFrost / 100))
    style.setProperty('--glass-video-blur', `${s.videoBlur}px`)
    style.setProperty('--glass-video-dim', String(((100 - s.videoBrightness) / 100) * 0.65))
    /* 背景亮度：纯黑/纯白遮罩。50=透明；浅色只加白，深色只加黑。 */
    style.setProperty('--glass-brightness-black', String(dark ? Math.max(0, (50 - s.bgBrightness) / 50) : 0))
    style.setProperty('--glass-brightness-white', String(dark ? 0 : Math.max(0, (s.bgBrightness - 50) / 50)))
    root.toggleAttribute('data-glass-press', s.press)
    root.toggleAttribute('data-glass-spotlight', s.spotlight)
    root.setAttribute('data-glass', '')
  }

  /** 把当前壁纸写进背景层。 */
  private applyWallpaper(snapshot: WallpaperSnapshot): void {
    const background = this.background
    const image = this.image
    const video = this.video
    if (background === null || image === null || video === null) return

    const entry = snapshot.entry
    if (entry === undefined) return

    if (entry === null) {
      background.setAttribute('data-media', 'none')
      image.removeAttribute('src')
      video.pause()
      video.removeAttribute('src')
      video.load()
      this.lastUrl = null
      document.documentElement.removeAttribute('data-glass-media')
      return
    }

    background.setAttribute('data-media', entry.media)
    document.documentElement.setAttribute('data-glass-media', entry.media)

    if (entry.media === 'video') {
      image.removeAttribute('src')
      if (this.lastUrl !== entry.url) {
        this.lastUrl = entry.url
        video.setAttribute('src', entry.url)
        video.load()
      }
      void video.play().catch(() => {
        video.muted = true
        void video.play().catch(() => undefined)
      })
      return
    }

    video.pause()
    video.removeAttribute('src')
    video.load()
    if (this.lastUrl !== entry.url) {
      this.lastUrl = entry.url
      image.setAttribute('src', entry.url)
    }
  }

  /** 移除所有节点与属性。 */
  private teardown(): void {
    this.background?.remove()
    for (const fade of this.fades) fade.remove()
    this.background = null
    this.image = null
    this.video = null
    this.fades = []
    const root = document.documentElement
    root.removeAttribute('data-glass')
    root.removeAttribute('data-glass-media')
    root.removeAttribute('data-glass-press')
    root.removeAttribute('data-glass-spotlight')
    for (const name of [
      '--glass-accent',
      '--glass-accent-ink',
      '--glass-blur',
      '--glass-frost',
      '--glass-surface-frost',
      '--glass-wallpaper-blur',
      '--glass-wallpaper-frost',
      '--glass-video-blur',
      '--glass-video-dim',
      '--glass-brightness-black',
      '--glass-brightness-white',
    ]) {
      root.style.removeProperty(name)
    }
  }
}
