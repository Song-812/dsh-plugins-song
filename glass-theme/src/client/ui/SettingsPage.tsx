/** 「玻璃主题」设置页：页头 + 三张分组卡。 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SettingsStore, WallpaperStore } from '../state.ts'
import { AccentPicker, Slider, Switch } from './controls.tsx'
import '../toast-core.js'

type Translate = (key: string) => string

/** 跟随宿主的深浅色切换（body 上的 data-ds-dark-theme）。 */
function useDarkScheme(): boolean {
  const [dark, setDark] = useState(() => document.body.hasAttribute('data-ds-dark-theme'))
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.body.hasAttribute('data-ds-dark-theme')))
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

/**
 * 设置页组件。
 * @param props - 两个订阅容器 + 词典。
 */
export function SettingsPage(props: { settings: SettingsStore; wallpaper: WallpaperStore; t: Translate }) {
  const { settings, wallpaper, t } = props
  const s = useSyncExternalStore(settings.subscribe, settings.getSnapshot)
  const w = useSyncExternalStore(wallpaper.subscribe, wallpaper.getSnapshot)
  const dark = useDarkScheme()
  const imageInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const owner = useRef<object>({}).current
  const toast = (window as unknown as { __dshSettingsToastV1: { activate: (owner: object) => void; cancel: (owner: object) => void; show: (owner: object, kind: string, text: string) => void; confirm: (owner: object, text: string, labels?: [string, string]) => Promise<boolean> } }).__dshSettingsToastV1
  useEffect(() => { toast.activate(owner); return () => toast.cancel(owner) }, [owner, toast])

  useEffect(() => {
    void wallpaper.refresh().then(() => {
      const error = wallpaper.getSnapshot().error
      if (error !== null) toast.show(owner, 'error', error)
    })
  }, [wallpaper, owner, toast])

  const entry = w.entry
  const media = entry?.media
  const brightnessMin = dark ? 0 : 50
  const brightnessMax = dark ? 50 : 100
  const brightness = Math.min(brightnessMax, Math.max(brightnessMin, s.bgBrightness))
  const sliderAria = { valueAria: t('numValue'), increaseAria: t('increase'), decreaseAria: t('decrease') }

  const update = (patch: Parameters<SettingsStore['update']>[0]): void => {
    if (!settings.update(patch)) toast.show(owner, 'error', t('toastSaveFail'))
  }

  const pick = (input: HTMLInputElement | null): void => input?.click()
  const onFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file !== undefined) void wallpaper.upload(file).then((success) => {
      if (success) toast.show(owner, 'success', t('toastWallpaperUpdated'))
      else { const error = wallpaper.getSnapshot().error; if (error !== null) toast.show(owner, 'error', error) }
    })
  }
  const remove = async (): Promise<void> => {
    if (entry === null || entry === undefined) return
    if (!await toast.confirm(owner, t('confirmDeleteWallpaper'), [t('confirm'), t('cancel')])) return
    const success = await wallpaper.remove()
    if (success) toast.show(owner, 'success', t('toastWallpaperDeleted'))
    else { const error = wallpaper.getSnapshot().error; if (error !== null) toast.show(owner, 'error', error) }
  }
  const reset = async (): Promise<void> => {
    if (!await toast.confirm(owner, t('confirmReset'), [t('confirm'), t('cancel')])) return
    if (settings.reset()) toast.show(owner, 'success', t('toastResetDone'))
    else toast.show(owner, 'error', t('toastSaveFail'))
  }

  return (
    <div className="gx-page">
      <header className="gx-head">
        <h1 className="gx-title">{t('label')}</h1>
        <button type="button" className="gx-btn" onClick={() => void reset()}>{t('reset')}</button>
      </header>

      <section className="gx-card">
        <h2 className="gx-card-title">{t('sectionTheme')}</h2>
        <AccentPicker
          value={s.accent}
          onChange={(accent) => update({ accent })}
          title={t('accentTitle')}
          desc={t('accentDesc')}
          customTitle={t('accentCustom')}
        />
        <Slider
          title={t('blurTitle')}
          desc={t('blurDesc')}
          value={s.blur}
          min={0}
          max={40}
          unit="px"
          onChange={(blur) => update({ blur })}
          {...sliderAria}
        />
        <Slider
          title={t('frostTitle')}
          desc={t('frostDesc')}
          value={s.frost}
          min={0}
          max={100}
          unit="%"
          onChange={(frost) => update({ frost })}
          {...sliderAria}
        />
      </section>

      <section className="gx-card">
        <h2 className="gx-card-title">{t('sectionBg')}</h2>
        <div className="gx-row">
          <div className="gx-row-text">
            <div className="gx-row-title">{t('wallpaper')}</div>
          </div>
          <div className="gx-control gx-wallpaper">
            <button type="button" className="gx-btn" onClick={() => void wallpaper.reveal().then((success) => { if (success) toast.show(owner, 'success', t('toastFolderOpened')); else { const error = wallpaper.getSnapshot().error; if (error !== null) toast.show(owner, 'error', error) } })}>{t('openFolder')}</button>
            <div className="gx-thumb">
              {media === 'image' && entry !== null && entry !== undefined ? (
                <img src={entry.url} alt="" />
              ) : media === 'video' && entry !== null && entry !== undefined ? (
                <video src={entry.url} muted loop autoPlay playsInline />
              ) : (
                <div className="gx-thumb-empty">{t('noWallpaper')}</div>
              )}
            </div>
            <button type="button" className="gx-btn" disabled={w.busy} onClick={() => pick(imageInput.current)}>{t('pickImage')}</button>
            <button type="button" className="gx-btn" disabled={w.busy} onClick={() => pick(videoInput.current)}>{t('pickVideo')}</button>
            <button type="button" className="gx-btn danger" disabled={w.busy || entry === null || entry === undefined} onClick={() => void remove()}>{t('delete')}</button>
          </div>
        </div>
        <input ref={imageInput} type="file" accept="image/*,.avif" hidden onChange={onFile} />
        <input ref={videoInput} type="file" accept="video/*" hidden onChange={onFile} />

        {media !== 'video' && (
          <>
            <Slider
              title={t('wallpaperBlurTitle')}
              desc={t('wallpaperBlurDesc')}
              value={s.wallpaperBlur}
              min={0}
              max={40}
              unit="px"
              onChange={(wallpaperBlur) => update({ wallpaperBlur })}
              {...sliderAria}
            />
            <Slider
              title={t('wallpaperFrostTitle')}
              desc={t('wallpaperFrostDesc')}
              value={s.wallpaperFrost}
              min={0}
              max={100}
              unit="%"
              onChange={(wallpaperFrost) => update({ wallpaperFrost })}
              {...sliderAria}
            />
          </>
        )}
        {media === 'video' && (
          <>
            <Slider
              title={t('videoBlurTitle')}
              desc={t('videoBlurDesc')}
              value={s.videoBlur}
              min={0}
              max={40}
              unit="px"
              onChange={(videoBlur) => update({ videoBlur })}
              {...sliderAria}
            />
            <Slider
              title={t('videoBrightnessTitle')}
              desc={t('videoBrightnessDesc')}
              value={s.videoBrightness}
              min={0}
              max={100}
              unit="%"
              onChange={(videoBrightness) => update({ videoBrightness })}
              {...sliderAria}
            />
          </>
        )}
        <Slider
          title={t('bgBrightnessTitle')}
          desc={dark ? t('bgBrightnessDescDark') : t('bgBrightnessDescLight')}
          value={brightness}
          min={brightnessMin}
          max={brightnessMax}
          unit="%"
          onChange={(value) => update({ bgBrightness: value })}
          {...sliderAria}
        />
      </section>

      <section className="gx-card">
        <h2 className="gx-card-title">{t('sectionEffects')}</h2>
        <Switch
          title={t('pressTitle')}
          desc={t('pressDesc')}
          checked={s.press}
          onChange={(press) => update({ press })}
        />
        <Switch
          title={t('spotlightTitle')}
          desc={t('spotlightDesc')}
          checked={s.spotlight}
          onChange={(spotlight) => update({ spotlight })}
        />
      </section>
    </div>
  )
}
