/**
 * 回收站健康度判定 —— 删前只读探测的事实 → `binStatus`。
 *
 * 事实由回收站桥在按下删除之后、真正动手之前采集（`binProbe`，见 recycle-bridge.js
 * 的 `Probe-BinHealth`）：卷的 `NukeOnDelete` 配置 + `SHQueryRecycleBin` 应答。
 * 这张判定表只此一份：桥只管采集事实，宿主用这里的纯函数下结论，直接假数据就能测。
 *
 * 取值与含义：
 *   'ok'      —— 没配置直通永久删除，且回收站查询正常应答：删除应该可还原；
 *   'suspect' —— 直通永久删除已配置，或回收站查询失败：这次删除有永久丢失风险；
 *   'unknown' —— 探测段异常、或压根没拿到探测事实：不知道，不当作没问题也不当有风险。
 *
 * @module dsh-session-delete/bin-status
 */

/**
 * 由删前探测事实判定回收站健康度。
 *
 * 决策顺序即优先级：
 *   1. 没有探测对象（桥没带回 binProbe）→ unknown；
 *   2. NukeOnDelete === 1 是直接证据 → suspect，即使探测段随后异常也不降级成 unknown；
 *   3. 探测段记录了异常（error 非空）→ unknown —— 承认自己不知道；
 *   4. SHQueryRecycleBin 没确认应答（recycleQueryOk !== true）→ suspect；
 *   5. 其余（回收站正常应答）→ ok。
 *
 * @param {{nukeOnDelete?: number|null, recycleQueryOk?: boolean, error?: string}|null|undefined} probe -
 *   桥回传的探测事实（binProbe）。
 * @returns {'ok' | 'suspect' | 'unknown'} 健康度。
 */
export function decideBinStatus(probe) {
  if (probe === null || typeof probe !== 'object') return 'unknown'
  if (probe.nukeOnDelete === 1) return 'suspect'
  if (probe.error != null && probe.error !== '') return 'unknown'
  return probe.recycleQueryOk === true ? 'ok' : 'suspect'
}
