/** 帧合并节流：同一帧内多次触发只 flush 一次（MutationObserver 突发合并用）。 */

/** requestAnimationFrame 的可注入替身，方便在 Node 里测节流逻辑。 */
export interface FrameScheduler {
  request(callback: () => void): number
  cancel(handle: number): void
}

export interface FrameThrottle {
  /** 请求一次 flush；同一帧内重复调用会被合并。 */
  schedule(): void
  /** 取消未执行的 flush 并作废之后的 schedule（卸载时调用）。 */
  dispose(): void
}

/**
 * @param flush - 帧内真正执行的全量扫描
 * @param scheduler - 帧调度器；浏览器传 rafScheduler
 */
export function createFrameThrottle(flush: () => void, scheduler: FrameScheduler): FrameThrottle {
  let handle: number | null = null
  let disposed = false
  return {
    schedule(): void {
      if (disposed || handle !== null) return
      handle = scheduler.request(() => {
        handle = null
        flush()
      })
    },
    dispose(): void {
      disposed = true
      if (handle === null) return
      scheduler.cancel(handle)
      handle = null
    },
  }
}

/** 浏览器默认调度器：requestAnimationFrame。 */
export const rafScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(() => callback()),
  cancel: (handle) => cancelAnimationFrame(handle),
}
