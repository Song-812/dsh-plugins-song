/**
 * 把 token 总数写成人读得懂的一小段字（`1.2M` / `834K` / `999`）。
 *
 * 放在宿主侧算而不是客户端：确认框里那句「用了 X token」只有一处需要它，
 * 而宿主侧能被 node 直接测试，客户端那边就没有第二份格式化代码要对齐。
 *
 * @param {unknown} total - 会话累计 token 数；读不到时是 null。
 * @returns {string} 显示用的短标签。
 */
export function formatTokenCount(total) {
  const value = Number(total)
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(Math.round(value))
  if (value < 1_000_000) return `${trimZero(value / 1000)}K`
  return `${trimZero(value / 1_000_000)}M`
}

/** 保留一位小数，并把结尾的 `.0` 去掉（`1.0K` → `1K`）。 */
function trimZero(value) {
  return value.toFixed(1).replace(/\.0$/, '')
}
