/** 运行时 seam 打标：给宿主 DOM 补齐 data-dsh-* 钩子（对照清单 S1–S5；自写实现）。 */
import { createFrameThrottle, rafScheduler } from './frame-throttle.ts'

interface Seam {
  readonly attribute: string
  readonly selector: string
  readonly first?: boolean
}

const SEAMS: readonly Seam[] = [
  { attribute: 'data-dsh-frame', selector: ':has(> [class*="sidebarCol"])' },
  { attribute: 'data-dsh-sidebar-root', selector: '[class*="sidebarCol"] [class*="root"]', first: true },
  { attribute: 'data-dsh-surface', selector: 'button[class*="newSession"]' },
  { attribute: 'data-dsh-account', selector: 'button[data-signed-out][aria-haspopup="menu"]' },
  { attribute: 'data-dsh-trajectory', selector: '[data-conversation-composer-overlay]' },
  { attribute: 'data-dsh-details', selector: '[class*="detailsCol"] [class*="root"]', first: true },
  { attribute: 'data-dsh-inputbar', selector: ':has(> [data-composer-card])' },
  { attribute: 'data-dsh-add', selector: '[data-composer-card] [class*="add"]' },
  { attribute: 'data-dsh-stats', selector: '[data-slot="conversation.composer.dock"] [class*="root"]' },
  { attribute: 'data-dsh-wordmark', selector: '[class*="sidebarCol"] [class*="brand"]', first: true },
]

function stamp(seam: Seam): void {
  if (seam.first) {
    const el = document.querySelector(seam.selector)
    if (el !== null && !el.hasAttribute(seam.attribute)) el.setAttribute(seam.attribute, '')
    return
  }
  for (const el of document.querySelectorAll(seam.selector)) {
    if (!el.hasAttribute(seam.attribute)) el.setAttribute(seam.attribute, '')
  }
}

/**
 * 侧栏磨砂层：只挂最外层 sidebarCol 的第一个子节点。
 * Electron 伪元素 backdrop-filter 常不糊；fill 用 z-index:-1 垫在字下面。
 */
function ensureSidebarFills(): void {
  const roots: HTMLElement[] = []
  for (const col of document.querySelectorAll('[class*="sidebarCol"]')) {
    if (!(col instanceof HTMLElement)) continue
    /* 嵌套命中（class 名也含 sidebarCol）不要再插一层，否则会糊住中间导航字 */
    if (col.parentElement !== null && col.parentElement.closest('[class*="sidebarCol"]') !== null) continue
    roots.push(col)

    const fills = [...col.querySelectorAll(':scope > [data-glass-sidebar-fill]')]
    let fill = fills[0] as HTMLElement | undefined
    if (fill === undefined) {
      fill = document.createElement('div')
      fill.setAttribute('data-glass-sidebar-fill', '')
      col.insertBefore(fill, col.firstChild)
    } else if (col.firstElementChild !== fill) {
      col.insertBefore(fill, col.firstChild)
    }
    for (let i = 1; i < fills.length; i++) fills[i]!.remove()
  }
  /* 清掉挂在嵌套/旧节点上的残留 fill（收起重挂、React 挪位后） */
  for (const orphan of document.querySelectorAll('[data-glass-sidebar-fill]')) {
    if (!(orphan instanceof HTMLElement)) continue
    if (!roots.some((root) => root === orphan.parentElement)) orphan.remove()
  }
}

function removeSidebarFills(): void {
  for (const fill of document.querySelectorAll('[data-glass-sidebar-fill]')) {
    fill.remove()
  }
}

function stampAll(): void {
  for (const seam of SEAMS) stamp(seam)
  ensureSidebarFills()
}

/** 打标一次并持续盯 React 重挂载；变更按帧合并，同一帧只补打一轮。 */
export function startSeamStamper(): () => void {
  stampAll()
  const throttle = createFrameThrottle(stampAll, rafScheduler)
  const observer = new MutationObserver(() => throttle.schedule())
  observer.observe(document.documentElement, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    throttle.dispose()
    removeSidebarFills()
  }
}