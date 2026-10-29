/** 白名单区域共用可拖动悬浮滚动条；纵向不占宽，横向原样保留。 */
import { createFrameThrottle, rafScheduler } from './frame-throttle.ts'

const HIDE_DELAY_MS = 1000
const HOST_ATTR = 'data-gx-sb-host'
const THUMB_ATTR = 'data-gx-overlay-sb'
const VISIBLE_ATTR = 'data-visible'
/** 必须盖过 dialog overlay(z-index:1000)，否则滑块被盖住看不见 */
const THUMB_Z = '1100'

/** 滚动条可读名称：跟浏览器语言走，避免写死中文。 */
function scrollAriaLabel(override?: string): string {
  if (typeof override === 'string' && override.trim() !== '') return override.trim()
  const lang = (typeof navigator !== 'undefined' && navigator.language) || (typeof document !== 'undefined' && document.documentElement.lang) || 'en'
  return /^zh\b/i.test(String(lang)) ? '滚动内容' : 'Scroll content'
}


type Track = {
  el: HTMLElement
  thumb: HTMLElement
  hideTimer: ReturnType<typeof setTimeout> | 0
  resize: ResizeObserver
  observed: Set<Element>
  cleanups: (() => void)[]
  stopDrag: (() => void) | null
  generatedId: string | null
  travel: number
  restoreChatGeometry: (() => void) | null
}

/**
 * 是否可作为竖向滚动宿主（computed overflow-y 为 auto/scroll/overlay）。
 */
function isYScrollContainer(el: HTMLElement): boolean {
  const oy = getComputedStyle(el).overflowY
  return oy === 'auto' || oy === 'scroll' || oy === 'overlay'
}

/**
 * class token 以 `_list` 结尾（如 GAkraW_list），排除 listArea / listTop*。
 */
function hasSessionListToken(el: HTMLElement): boolean {
  for (const c of el.classList) {
    if (/_list$/.test(c)) return true
  }
  return false
}

/**
 * 会话列表匹配的排除区域；右侧普通视图另走明确白名单。
 */
function isExcludedOutsideSettings(el: HTMLElement): boolean {
  if (el.closest('[data-conversation-scroll]')) return true
  if (el.closest('[data-composer-card]')) return true
  if (el.closest('[data-composer-seat]')) return true
  if (el.closest('[data-sidebar-right-panel]')) return true
  return false
}

/**
 * 收集滚动宿主白名单：
 * 1) 设置 dialog：AnXs9G_options / AnXs9G_navList（及 dialog 内其它 overflow 兜底）
 * 2) 左侧会话列表：GAkraW_list（hash 可变；侧栏范围内 class 以 _list 结尾且可竖滚）
 * 3) 插件 / MCP / 技能页：显式页面根节点。
 * 4) 右侧文件列表和纯文本预览：仅限明确的DOM宿主。
 * 5) 主聊天：只登记data-conversation-scroll，不匹配内部虚拟列表。
 * 不盲扫全页；不碰输入编辑器、终端和iframe。
 * @param dialogCache - 帧内缓存：同一轮扫描里每个 dialog 的全量子树只取一次快照，
 *                      白名单选择器与 overflow 兜底都复用这份快照，不再重复 querySelectorAll('*')。
 */
function collectScrollHosts(dialogCache: Map<HTMLElement, readonly Element[]>): HTMLElement[] {
  const hosts = new Set<HTMLElement>()

  for (const dialog of document.querySelectorAll('[role="dialog"]')) {
    if (!(dialog instanceof HTMLElement)) continue
    let all = dialogCache.get(dialog)
    if (all === undefined) {
      all = [...dialog.querySelectorAll('*')]
      dialogCache.set(dialog, all)
    }
    for (const sel of [
      '[class*="AnXs9G_options"]',
      '[class*="AnXs9G_navList"]',
      '[class*="_options"]',
      '[class*="_navList"]',
    ]) {
      for (const node of all) {
        if (node instanceof HTMLElement && node.matches(sel) && isYScrollContainer(node)) hosts.add(node)
      }
    }
    for (const node of all) {
      if (!(node instanceof HTMLElement)) continue
      if (!isYScrollContainer(node)) continue
      hosts.add(node)
    }
  }

  // 本轮新增：左侧会话列表（仅此项）
  for (const node of document.querySelectorAll('[class*="GAkraW_list"]')) {
    if (!(node instanceof HTMLElement)) continue
    if (!hasSessionListToken(node)) continue
    if (!isYScrollContainer(node)) continue
    if (isExcludedOutsideSettings(node)) continue
    hosts.add(node)
  }
  for (const scope of document.querySelectorAll(
    '[data-dsh-sidebar-root], [class*="sidebarCol"], [class*="GAkraW_root"]',
  )) {
    if (!(scope instanceof Element)) continue
    for (const node of scope.querySelectorAll('[class*="_list"]')) {
      if (!(node instanceof HTMLElement)) continue
      if (!hasSessionListToken(node)) continue
      if (!isYScrollContainer(node)) continue
      if (isExcludedOutsideSettings(node)) continue
      hosts.add(node)
    }
  }

  // Only the three ordinary sidebar pages join this round.
  for (const node of document.querySelectorAll('.plp-page, .mct-page, .dst-page')) {
    if (node instanceof HTMLElement && isYScrollContainer(node)) hosts.add(node)
  }

  // Right-panel ordinary DOM views only; terminals, editors and frames remain native.
  for (const node of document.querySelectorAll(
    '[data-sidebar-right-panel] [data-files-body], [data-sidebar-right-panel] [data-textpreview-body]',
  )) {
    if (node instanceof HTMLElement && isYScrollContainer(node)) hosts.add(node)
  }

  // The chat owns follow-tail/virtualization; only its actual scroll root is managed.
  for (const node of document.querySelectorAll('[data-conversation-scroll]')) {
    if (node instanceof HTMLElement && isYScrollContainer(node)) hosts.add(node)
  }

  return [...hosts]
}

/**
 * 启动 overlay 滚动条。
 * @returns 卸载清理函数
 */
/** Preserve chat text width while the native vertical gutter is replaced. */
function preserveChatGeometry(el: HTMLElement): (() => void) | null {
  if (!el.hasAttribute('data-conversation-scroll')) return null
  const style = getComputedStyle(el)
  const gutter = Math.max(0, el.offsetWidth - el.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth))
  const entries = [
    ['--gx-chat-scroll-gutter', `${gutter}px`],
    ['--gx-chat-original-padding', style.paddingInlineEnd],
  ] as const
  const previous = entries.map(([name]) => [name, el.style.getPropertyValue(name), el.style.getPropertyPriority(name)] as const)
  for (const [name, value] of entries) el.style.setProperty(name, value)
  return () => {
    for (const [name, value, priority] of previous) {
      if (value === '') el.style.removeProperty(name)
      else el.style.setProperty(name, value, priority)
    }
  }
}

/** Body-owned thumbs must notify the host chat before changing its scrollTop.
 * The native controller listens on this scroller to cancel smooth/pending follow.
 * Non-bubbling notifications reach that capture listener without replaying clicks.
 */
function notifyChatIntent(el: HTMLElement, event: PointerEvent | KeyboardEvent | WheelEvent): void {
  if (!el.hasAttribute('data-conversation-scroll')) return
  if (event.type === 'pointerdown') {
    const pointer = event as PointerEvent
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: pointer.pointerId, pointerType: pointer.pointerType, button: pointer.button, clientX: pointer.clientX, clientY: pointer.clientY }))
  } else if (event.type === 'keydown') {
    const key = event as KeyboardEvent
    el.dispatchEvent(new KeyboardEvent('keydown', { key: key.key, code: key.code, ctrlKey: key.ctrlKey, metaKey: key.metaKey, shiftKey: key.shiftKey, altKey: key.altKey }))
  } else if (event.type === 'wheel') {
    const wheel = event as WheelEvent
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: wheel.deltaX, deltaY: wheel.deltaY, deltaMode: wheel.deltaMode }))
  }
}

export function startOverlayScrollbar(options?: { ariaLabel?: string }): () => void {
  const label = scrollAriaLabel(options?.ariaLabel)
  const tracks = new Map<HTMLElement, Track>()
  let nextId = 0

  const hide = (track: Track): void => {
    track.thumb.style.display = 'none'
    track.thumb.removeAttribute(VISIBLE_ATTR)
  }

  // The thumb lives under body to escape transformed glass ancestors. Clip it
  // to its host/ancestors, and never display a background thumb over a dialog.
  const visibleBounds = (el: HTMLElement): { top: number; right: number; height: number } | null => {
    if (!el.isConnected || el.getClientRects().length === 0) return null
    const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
      .filter((dialog) => dialog.getClientRects().length > 0 && getComputedStyle(dialog).visibility !== 'hidden')
    const activeDialog = dialogs.at(-1)
    if (activeDialog !== undefined && !activeDialog.contains(el)) return null
    const rect = el.getBoundingClientRect()
    let top = Math.max(0, rect.top + el.clientTop)
    let bottom = Math.min(window.innerHeight, rect.top + el.clientTop + el.clientHeight)
    let left = Math.max(0, rect.left + el.clientLeft)
    let right = Math.min(window.innerWidth, rect.left + el.clientLeft + el.clientWidth)
    for (let parent = el.parentElement; parent !== null; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      if (style.visibility === 'hidden' || style.display === 'none') return null
      const box = parent.getBoundingClientRect()
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        top = Math.max(top, box.top + parent.clientTop)
        bottom = Math.min(bottom, box.top + parent.clientTop + parent.clientHeight)
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        left = Math.max(left, box.left + parent.clientLeft)
        right = Math.min(right, box.left + parent.clientLeft + parent.clientWidth)
      }
    }
    if (bottom - top < 12 || right - left < 14) return null
    return { top, right, height: bottom - top }
  }

  const paint = (track: Track): boolean => {
    const { el, thumb } = track
    const bounds = visibleBounds(el)
    const maximum = Math.max(0, el.scrollHeight - el.clientHeight)
    if (bounds === null || maximum <= 1) { hide(track); return false }
    const height = Math.min(bounds.height, Math.max(28, (el.clientHeight / el.scrollHeight) * bounds.height))
    track.travel = Math.max(0, bounds.height - height)
    const top = bounds.top + Math.max(0, Math.min(1, el.scrollTop / maximum)) * track.travel
    thumb.style.display = ''
    thumb.style.top = `${top}px`
    thumb.style.left = `${bounds.right - 14}px`
    thumb.style.height = `${height}px`
    thumb.setAttribute('aria-valuemax', String(Math.ceil(maximum)))
    thumb.setAttribute('aria-valuenow', String(Math.round(Math.max(0, Math.min(maximum, el.scrollTop)))))
    return true
  }

  const scheduleHide = (track: Track): void => {
    if (track.hideTimer !== 0) clearTimeout(track.hideTimer)
    track.hideTimer = 0
    if (track.stopDrag !== null) return
    track.hideTimer = setTimeout(() => {
      track.hideTimer = 0
      if (track.stopDrag !== null || document.activeElement === track.thumb || track.thumb.matches(':hover')) return
      track.thumb.removeAttribute(VISIBLE_ATTR)
    }, HIDE_DELAY_MS)
  }

  const reveal = (track: Track): void => {
    if (!paint(track)) return
    track.thumb.setAttribute(VISIBLE_ATTR, '')
    scheduleHide(track)
  }

  const startDrag = (track: Track, event: PointerEvent): void => {
    if (event.button !== 0 || !paint(track) || track.travel <= 0) return
    event.preventDefault()
    event.stopPropagation()
    track.stopDrag?.()
    notifyChatIntent(track.el, event)
    const pointerId = event.pointerId
    const startY = event.clientY
    const startScroll = track.el.scrollTop
    const oldSelect = document.body.style.userSelect
    const oldCursor = document.body.style.cursor
    const move = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return
      next.preventDefault()
      const maximum = Math.max(0, track.el.scrollHeight - track.el.clientHeight)
      track.el.scrollTop = Math.max(0, Math.min(maximum, startScroll + (next.clientY - startY) * maximum / Math.max(1, track.travel)))
      paint(track)
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', finish)
      try { track.thumb.releasePointerCapture(pointerId) } catch { /* Capture may already be lost. */ }
      document.body.style.userSelect = oldSelect
      document.body.style.cursor = oldCursor
      track.thumb.removeAttribute('data-dragging')
      track.stopDrag = null
      scheduleHide(track)
    }
    const release = (next: PointerEvent): void => { if (next.pointerId === pointerId) finish() }
    track.stopDrag = finish
    if (track.hideTimer !== 0) clearTimeout(track.hideTimer)
    track.hideTimer = 0
    track.thumb.setAttribute(VISIBLE_ATTR, '')
    track.thumb.setAttribute('data-dragging', '')
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
    try { track.thumb.setPointerCapture(pointerId) } catch { /* Window listeners still receive synthetic events. */ }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', finish)
  }

  const observeContent = (track: Track): void => {
    const current = new Set<Element>([track.el, ...track.el.children])
    for (const node of track.observed) if (!current.has(node)) track.resize.unobserve(node)
    for (const node of current) if (!track.observed.has(node)) track.resize.observe(node)
    track.observed = current
  }

  const bind = (el: HTMLElement): void => {
    if (tracks.has(el)) return
    const restoreChatGeometry = preserveChatGeometry(el)
    el.setAttribute(HOST_ATTR, '')
    let generatedId: string | null = null
    if (el.id === '') {
      do { generatedId = `gx-scroll-host-${++nextId}` } while (document.getElementById(generatedId) !== null)
      el.id = generatedId
    }
    const thumb = document.createElement('div')
    thumb.setAttribute(THUMB_ATTR, '')
    thumb.setAttribute('role', 'scrollbar')
    thumb.setAttribute('aria-label', label)
    thumb.setAttribute('aria-orientation', 'vertical')
    thumb.setAttribute('aria-controls', el.id)
    thumb.setAttribute('aria-valuemin', '0')
    thumb.tabIndex = 0
    thumb.style.zIndex = THUMB_Z
    document.body.appendChild(thumb)
    const track: Track = {
      el, thumb, generatedId, restoreChatGeometry, hideTimer: 0, travel: 0, stopDrag: null,
      resize: new ResizeObserver(() => scheduleSync()), observed: new Set(), cleanups: [],
    }
    const listen = (target: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions): void => {
      target.addEventListener(type, fn, options)
      track.cleanups.push(() => target.removeEventListener(type, fn, options))
    }
    listen(el, 'scroll', () => reveal(track), { passive: true })
    listen(el, 'pointermove', (event) => {
      const pointer = event as PointerEvent
      const right = el.getBoundingClientRect().right
      if (pointer.clientX >= right - 16 && pointer.clientX <= right) reveal(track)
    }, { passive: true })
    listen(thumb, 'pointerenter', () => reveal(track))
    listen(thumb, 'pointerleave', () => scheduleHide(track))
    listen(thumb, 'focus', () => reveal(track))
    listen(thumb, 'blur', () => scheduleHide(track))
    listen(thumb, 'pointerdown', (event) => startDrag(track, event as PointerEvent))
    listen(thumb, 'wheel', (event) => notifyChatIntent(el, event as WheelEvent), { passive: true })
    listen(thumb, 'keydown', (event) => {
      const key = event as KeyboardEvent
      const maximum = Math.max(0, el.scrollHeight - el.clientHeight)
      const positions: Record<string, number> = {
        ArrowUp: el.scrollTop - 40, ArrowDown: el.scrollTop + 40,
        PageUp: el.scrollTop - el.clientHeight * .9, PageDown: el.scrollTop + el.clientHeight * .9,
        Home: 0, End: maximum,
      }
      const next = positions[key.key]
      if (next === undefined) return
      key.preventDefault()
      key.stopPropagation()
      notifyChatIntent(el, key)
      el.scrollTop = Math.max(0, Math.min(maximum, next))
      reveal(track)
    })
    tracks.set(el, track)
    observeContent(track)
    paint(track)
  }

  const unbind = (el: HTMLElement): void => {
    const track = tracks.get(el)
    if (track === undefined) return
    track.stopDrag?.()
    track.resize.disconnect()
    for (const cleanup of track.cleanups) cleanup()
    if (track.hideTimer !== 0) clearTimeout(track.hideTimer)
    el.removeAttribute(HOST_ATTR)
    track.restoreChatGeometry?.()
    if (track.generatedId !== null && el.id === track.generatedId) el.removeAttribute('id')
    track.thumb.remove()
    tracks.delete(el)
  }

  const sync = (): void => {
    const found = new Set(collectScrollHosts(new Map()))
    for (const el of found) bind(el)
    for (const [el, track] of tracks) {
      if (!found.has(el) || !el.isConnected) unbind(el)
      else { observeContent(track); paint(track) }
    }
  }

  // Mutation / resize / scroll / 尺寸变化共用一个帧合并节流：同一帧只跑一次全量扫描。
  const syncThrottle = createFrameThrottle(sync, rafScheduler)
  const scheduleSync = (): void => { syncThrottle.schedule() }
  const observer = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      if (record.target instanceof Element && record.target.closest(`[${THUMB_ATTR}]`) !== null) return false
      if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every((node) => node instanceof Element && node.hasAttribute(THUMB_ATTR))) return false
      return true
    })
    if (relevant) scheduleSync()
  })
  sync()
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden'],
  })
  window.addEventListener('resize', scheduleSync, { passive: true })
  window.addEventListener('scroll', scheduleSync, { passive: true, capture: true })
  return () => {
    observer.disconnect()
    window.removeEventListener('resize', scheduleSync)
    window.removeEventListener('scroll', scheduleSync, true)
    syncThrottle.dispose()
    for (const el of [...tracks.keys()]) unbind(el)
  }
}
