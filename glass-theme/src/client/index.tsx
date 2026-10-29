/** 玻璃主题 · 浏览器半边：注入样式、挂主题层、注册设置页。 */
import themeCss from './theme.css'
import settingsCss from './settings.css'
import { loadInitialSettings, markLegacyWallpaperMigrated, SettingsStore, WallpaperStore } from './state.ts'
import { GlassLayer } from './theme/layer.ts'
import { SettingsPage } from './ui/SettingsPage.tsx'

const NS = 'glass-theme'

const DICTS = {
  zh: {
    label: '玻璃主题',
    reset: '恢复默认',
    sectionTheme: '主题',
    sectionBg: '背景',
    sectionEffects: '特效',
    accentTitle: '重点色',
    accentDesc: '按钮、开关、滑杆与辉光共用',
    accentCustom: '自定义颜色',
    blurTitle: '玻璃模糊度',
    blurDesc: '玻璃卡片背后内容的模糊半径',
    frostTitle: '磨砂度',
    frostDesc: '玻璃上的雾面遮罩浓度，越高越不透明',
    wallpaper: '壁纸',
    openFolder: '打开文件夹',
    pickImage: '选择图片',
    pickVideo: '选择视频',
    delete: '删除',
    noWallpaper: '无壁纸',
    wallpaperBlurTitle: '壁纸模糊度',
    wallpaperBlurDesc: '壁纸本身的模糊半径',
    wallpaperFrostTitle: '壁纸磨砂度',
    wallpaperFrostDesc: '软雾遮罩，只加雾提对比',
    videoBlurTitle: '视频模糊度',
    videoBlurDesc: '视频画面的模糊半径',
    videoBrightnessTitle: '视频亮度',
    videoBrightnessDesc: '视频专用额外压暗雾；发亮/压黑请用「背景亮度」的白/黑膜',
    bgBrightnessTitle: '背景亮度',
    bgBrightnessDescDark: '黑膜压暗：50 原样，0 近黑',
    bgBrightnessDescLight: '白膜提亮：50 原样，100 近白',
    pressTitle: '悬停上浮',
    pressDesc: '鼠标悬停时玻璃卡片轻微上浮',
    spotlightTitle: '鼠标辉光',
    spotlightDesc: '跟随光标的柔光，颜色跟重点色走',
    toastSaveFail: '无法保存设置，重启后可能失效',
    toastWallpaperUpdated: '壁纸已更新',
    toastWallpaperDeleted: '壁纸已删除',
    toastFolderOpened: '已打开壁纸文件夹',
    toastResetDone: '已恢复默认设置',
    confirmDeleteWallpaper: '删除当前壁纸？文件会从壁纸文件夹移除。',
    confirmReset: '恢复主题默认设置？当前壁纸不会删除。',
    confirm: '确认',
    cancel: '取消',
    numValue: '（数值）',
    increase: '增加',
    decrease: '减少',
    scrollContent: '滚动内容',
  },
  en: {
    label: 'Glass Theme',
    reset: 'Restore defaults',
    sectionTheme: 'Theme',
    sectionBg: 'Background',
    sectionEffects: 'Effects',
    accentTitle: 'Accent colour',
    accentDesc: 'Shared by buttons, switches, sliders and the cursor glow',
    accentCustom: 'Custom colour',
    blurTitle: 'Glass blur',
    blurDesc: 'Blur radius behind frosted glass cards',
    frostTitle: 'Frost',
    frostDesc: 'Fog opacity on glass; higher is more opaque',
    wallpaper: 'Wallpaper',
    openFolder: 'Open folder',
    pickImage: 'Choose image',
    pickVideo: 'Choose video',
    delete: 'Delete',
    noWallpaper: 'No wallpaper',
    wallpaperBlurTitle: 'Wallpaper blur',
    wallpaperBlurDesc: 'Blur radius applied to the wallpaper itself',
    wallpaperFrostTitle: 'Wallpaper frost',
    wallpaperFrostDesc: 'Soft fog overlay for contrast',
    videoBlurTitle: 'Video blur',
    videoBlurDesc: 'Blur radius on the video frame',
    videoBrightnessTitle: 'Video brightness',
    videoBrightnessDesc: 'Extra dimming fog for video; use Background brightness for white/black films',
    bgBrightnessTitle: 'Background brightness',
    bgBrightnessDescDark: 'Black film: 50 is neutral, 0 is near black',
    bgBrightnessDescLight: 'White film: 50 is neutral, 100 is near white',
    pressTitle: 'Hover lift',
    pressDesc: 'Glass cards rise slightly on hover',
    spotlightTitle: 'Cursor glow',
    spotlightDesc: 'Soft glow that follows the cursor, tinted by the accent',
    toastSaveFail: 'Could not save settings; they may reset after restart',
    toastWallpaperUpdated: 'Wallpaper updated',
    toastWallpaperDeleted: 'Wallpaper deleted',
    toastFolderOpened: 'Opened wallpaper folder',
    toastResetDone: 'Defaults restored',
    confirmDeleteWallpaper: 'Delete the current wallpaper? The file will be removed from the wallpaper folder.',
    confirmReset: 'Restore theme defaults? The current wallpaper will be kept.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    numValue: ' value',
    increase: 'Increase',
    decrease: 'Decrease',
    scrollContent: 'Scroll content',
  },
}

/** 插件对象（由 __ModuleLoader__ 的工厂返回）。 */
const plugin = {
  name: 'glass-theme',
  inject: ['slots', 'locale'] as string[],
  apply(ctx: any): void {
    ctx.effect(() => ctx.locale.register(NS, DICTS), 'glass-theme: dictionaries')

    // 样式挂在插件 fiber 上，停用插件时自动移除。
    ctx.effect(() => {
      const style = document.createElement('style')
      style.setAttribute('data-plugin', 'dsh-glass-theme')
      style.textContent = `${themeCss}
${settingsCss}`
      document.head.appendChild(style)
      return () => style.remove()
    }, 'glass-theme: styles')

    const initial = loadInitialSettings()
    const settings = new SettingsStore(initial.settings)
    const wallpaper = new WallpaperStore()
    const layer = new GlassLayer(settings, wallpaper)

    ctx.effect(() => {
      const dispose = layer.start()
      void (async () => {
        await wallpaper.refresh()
        const current = wallpaper.getSnapshot().entry
        const canImport =
          initial.legacyWallpaper !== null &&
          (current === null || current === undefined || current.isDefault)
        if (canImport && initial.legacyWallpaper !== null) {
          const imported = await wallpaper.importLegacy(initial.legacyWallpaper)
          if (imported) markLegacyWallpaperMigrated()
        }
      })()
      return dispose
    }, 'glass-theme: layer')

    // 服务可能晚于插件就绪，用 inject + effect 等它到位。
    ctx.inject(['slots', 'locale'], (scope: any) => {
      const slots = scope.get('slots')
      const locale = scope.get('locale') ?? ctx.locale
      if (!slots || !locale) return
      const t = locale.bind(NS)
      scope.effect(() => slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'glass-theme', order: 22, label: () => t('label'), locale: NS },
        () => <SettingsPage settings={settings} wallpaper={wallpaper} t={t} />,
      )))
    })
  },
}

export default plugin
