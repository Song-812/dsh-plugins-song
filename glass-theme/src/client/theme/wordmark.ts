/**
 * 深色模式下的 Harness 光泽铭牌：盖住 SVG 里那块 HARNESS 底板，
 * 换成一枚官网同款药丸（渐变描边 + 柔光 + 黑底白字）。
 * 浅色模式不动，插件卸载时整块移除。
 */

/** 底板在 wordmark SVG 里的固定位置（宿主 0.2 的坐标）。 */
const PLATE_SELECTOR = 'rect[x="129.348"]'

/** 深色下开始跟踪；浅色下自动收起。用 ResizeObserver + rAF，不再 400ms 轮询。 */
export function startWordmarkBadge(): () => void {
  let badge: HTMLDivElement | null = null
  let raf = 0
  let plateObserver: ResizeObserver | null = null
  let observedPlate: Element | null = null

  const remove = (): void => {
    badge?.remove()
    badge = null
  }

  const ensure = (): HTMLDivElement => {
    if (badge !== null) return badge
    const element = document.createElement('div')
    element.setAttribute('data-glass-badge', '')
    const text = document.createElement('span')
    text.textContent = 'Harness'
    element.append(text)
    document.body.append(element)
    badge = element
    return element
  }

  const unobservePlate = (): void => {
    if (plateObserver !== null && observedPlate !== null) {
      try {
        plateObserver.unobserve(observedPlate)
      } catch {
        /* ignore */
      }
    }
    observedPlate = null
  }

  const observePlate = (plate: Element): void => {
    if (observedPlate === plate) return
    unobservePlate()
    if (plateObserver === null) {
      plateObserver = new ResizeObserver(() => schedule())
    }
    plateObserver.observe(plate)
    observedPlate = plate
  }

  const sync = (): void => {
    const dark = document.body.hasAttribute('data-ds-dark-theme')
    const plate = document.querySelector<SVGGraphicsElement>(PLATE_SELECTOR)
    if (!dark || plate === null) {
      unobservePlate()
      remove()
      return
    }
    observePlate(plate)
    const rect = plate.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 4) {
      remove()
      return
    }
    const element = ensure()
    element.style.left = `${rect.left - 1}px`
    element.style.top = `${rect.top - 1}px`
    element.style.width = `${rect.width + 2}px`
    element.style.height = `${rect.height + 2}px`
    element.style.fontSize = `${Math.max(7.5, Math.min(10, rect.height * 0.68))}px`
  }

  const schedule = (): void => {
    if (raf !== 0) return
    raf = window.requestAnimationFrame(() => {
      raf = 0
      sync()
    })
  }

  const observer = new MutationObserver(() => schedule())
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'], childList: true, subtree: true })
  window.addEventListener('resize', schedule)
  schedule()

  return () => {
    observer.disconnect()
    window.removeEventListener('resize', schedule)
    if (raf !== 0) window.cancelAnimationFrame(raf)
    unobservePlate()
    plateObserver?.disconnect()
    plateObserver = null
    remove()
  }
}
