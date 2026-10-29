/**
 * 「直连失败」的计数器：同一个域名在一个时间窗内累计失败够多次，才值得被永久登记进代理名单。
 *
 * 为什么需要它：以前直连只要失败一次、代理那次成功，域名就被永久写进名单；
 * 而名单是两条路（抓网页 / 模型出网）共用的，一次网络抖动就会让一个国内站点
 * 永远被拉去走代理，代理一关就整个连不上。
 *
 * 只存在内存里：重启后重新计数，宁可多试几次，也不要把一次抖动写成永久规则。
 */

/** 最多同时记多少个域名；超过就先清掉已过期的，仍然超出再丢最旧的。 */
const MAX_TRACKED_HOSTS = 500

/**
 * @param options.threshold - 窗口内累计多少次失败才算「确实直连不通」。
 * @param options.windowMs - 统计窗口（毫秒），只有窗口内的失败才算数。
 * @param options.now - 当前时间函数，测试里注入。
 */
export function createFailureTracker({ threshold, windowMs, now = Date.now }) {
  const failures = new Map() // host -> number[]（失败时间戳，升序）

  const prune = (list, current) => {
    const cutoff = current - windowMs
    let start = 0
    while (start < list.length && list[start] <= cutoff) start += 1
    return start === 0 ? list : list.slice(start)
  }

  const evictIfNeeded = (current) => {
    if (failures.size <= MAX_TRACKED_HOSTS) return
    for (const [host, list] of failures) {
      if (prune(list, current).length === 0) failures.delete(host)
    }
    while (failures.size > MAX_TRACKED_HOSTS) {
      failures.delete(failures.keys().next().value)
    }
  }

  return {
    /**
     * 记一次失败。
     * @returns 达到门槛时返回 true（并清零，调用方此时应登记域名）；否则 false。
     */
    record(host) {
      const current = now()
      const list = prune(failures.get(host) ?? [], current)
      list.push(current)
      if (list.length >= threshold) {
        failures.delete(host)
        return true
      }
      failures.set(host, list)
      evictIfNeeded(current)
      return false
    },
    /** 直连成功一次：说明没被挡，之前攒的失败作废。 */
    clear(host) {
      failures.delete(host)
    },
    /** 当前窗口内的失败次数（测试和诊断用）。 */
    count(host) {
      return prune(failures.get(host) ?? [], now()).length
    },
  }
}
