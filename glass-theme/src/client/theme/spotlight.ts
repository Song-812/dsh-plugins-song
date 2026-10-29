/** 鼠标辉光：给玻璃面板加一个跟随光标的柔光（用 ::before 画，不往 React 树里塞节点）。 */

/** 会被辉光/悬停命中的面板。 */
const PANE_SELECTOR = [
  '[class*="sidebarCol"]',
  '[data-phase] header',
  /* 输入玻璃本体；有统计行时外壳才是玻璃，见下方 mark 跳过内层 card */
  '[data-composer-card]',
  '[data-dsh-inputbar]:has([data-dsh-stats])',
  /* 轨迹/会话大板只做辉光，不上浮（CSS 里禁 transform） */
  '[data-dsh-trajectory]',
  '[data-dsh-surface]',
  '[data-dsh-account]',
  '[data-sidebar-right-panel] [data-dockkit-pane]',
].join(',')

/** 辉光半径，px。 */
const GLOW_RADIUS = 180

/**
 * 开始跟踪光标。面板补齐用 MutationObserver 只改属性（安全），
 * 坐标写进 CSS 变量（--gx-mx / --gx-my）。
 * @returns 清理函数。
 */
export function startSpotlight(): () => void {
  let hovered: HTMLElement | null = null
  let frame = 0
  let syncFrame = 0

  const markPanes = (): void => {
    for (const pane of document.querySelectorAll<HTMLElement>(PANE_SELECTOR)) {
      /* 统计行合并玻璃时，上浮/辉光打在 inputbar 外壳，内层 card 透明勿再抬 */
      if (
        pane.hasAttribute('data-composer-card') &&
        pane.closest('[data-dsh-inputbar]:has([data-dsh-stats])') !== null
      ) {
        pane.removeAttribute('data-glass-spot')
        continue
      }
      if (!pane.hasAttribute('data-glass-spot')) pane.setAttribute('data-glass-spot', '')
    }
  }

  const scheduleMark = (): void => {
    if (syncFrame !== 0) return
    syncFrame = requestAnimationFrame(() => {
      syncFrame = 0
      markPanes()
    })
  }

  const paint = (clientX: number, clientY: number): void => {
    if (hovered === null) return
    if (frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const pane = hovered
      if (pane === null) return
      const rect = pane.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      pane.style.setProperty('--gx-mx', `${clientX - rect.left}px`)
      pane.style.setProperty('--gx-my', `${clientY - rect.top}px`)
      pane.style.setProperty('--gx-glow-radius', `${GLOW_RADIUS}px`)
    })
  }

  const paneOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? target.closest<HTMLElement>('[data-glass-spot]') : null

  const onOver = (event: PointerEvent): void => {
    const pane = paneOf(event.target)
    if (pane === null) return
    if (hovered !== null && hovered !== pane) hovered.removeAttribute('data-spot-on')
    hovered = pane
    pane.setAttribute('data-spot-on', '')
    paint(event.clientX, event.clientY)
  }

  const onMove = (event: PointerEvent): void => {
    if (hovered === null) return
    if (!hovered.contains(event.target as Node)) return
    paint(event.clientX, event.clientY)
  }

  const onOut = (event: PointerEvent): void => {
    if (hovered === null) return
    const next = event.relatedTarget
    if (next instanceof Node && hovered.contains(next)) return
    hovered.removeAttribute('data-spot-on')
    hovered = null
  }

  markPanes()
  const observer = new MutationObserver(scheduleMark)
  observer.observe(document.body, { childList: true, subtree: true })

  document.addEventListener('pointerover', onOver, { passive: true })
  document.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerout', onOut, { passive: true })

  return () => {
    observer.disconnect()
    document.removeEventListener('pointerover', onOver)
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerout', onOut)
    if (frame !== 0) cancelAnimationFrame(frame)
    if (syncFrame !== 0) cancelAnimationFrame(syncFrame)
    hovered?.removeAttribute('data-spot-on')
    hovered = null
  }
}
