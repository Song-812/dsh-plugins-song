/**
 * 能不能删这一条会话 —— 宿主能判的两个前提。
 *
 * 纯函数：不碰磁盘、不读上下文，输入就是全部前提，方便直接测。
 *
 * @param {{running: boolean, onDisk: boolean}} facts - 会话此刻的客观状态。
 * @returns {{deletable: boolean, reason: 'running' | 'blank' | null}} 判定结果。
 */
export function deleteDecision(facts) {
  if (facts.running) return { deletable: false, reason: 'running' }
  if (!facts.onDisk) return { deletable: false, reason: 'blank' }
  return { deletable: true, reason: null }
}
