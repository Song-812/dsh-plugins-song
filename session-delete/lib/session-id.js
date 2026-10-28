/**
 * 会话 id 的形状与「磁盘上该找哪几个名字」。
 *
 * 为什么需要这一层：会话 id 在磁盘上的命名跨内核版本变过 ——
 * 旧版本（0.1.x）是 `session-<uuid>`，本机 0.2.x 上是**裸 uuid**
 * （`~/.dsh/sessions/<分桶>/<uuid>/`，投影缓存也是 `<uuid>.json`）。
 * 如果只按一种写法拼路径，另一种内核上每一次真实请求都会 404/400。
 *
 * 纯字符串处理，不碰磁盘，所以可以直接测。
 *
 * @module dsh-session-delete/session-id
 */

/** 允许出现在路径分量里的形状：不以点开头、不含分隔符与空白。 */
const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * 一个名字能不能直接当路径分量用。
 *
 * 必须额外挡掉 `.`、`..` 和空串：它们能满足上面的字符规则，但拼进路径会跑到上一级
 * （`sessions/<分桶>/..` = 整个 `sessions` 根）。`session-..` 去掉前缀正好是 `..`，
 * 属于真实可利用的穿越（2026-10-26 由独立审查发现）。
 *
 * @param {string} name - 待检查的名字。
 * @returns {boolean} 可安全当作一个路径分量则 true。
 */
function isSafeSegment(name) {
  if (name === '' || name === '.' || name === '..') return false
  if (name.includes('..')) return false
  return SAFE_SESSION_ID.test(name)
}

/**
 * 这个 id 能不能安全地当成一个路径分量用。
 *
 * 带 `session-` 前缀时，去掉前缀后的裸名也必须安全 —— 两种写法都会被拿去拼路径。
 * @param {unknown} id - 待检查的会话 id。
 * @returns {boolean} 安全则 true。
 */
export function isSafeSessionId(id) {
  if (typeof id !== 'string') return false
  const bare = id.startsWith('session-') ? id.slice('session-'.length) : id
  return isSafeSegment(bare) && isSafeSegment(`session-${bare}`)
}

/**
 * 同一个会话在磁盘上可能出现的两种名字（先给传入的那个，再给另一种写法）。
 *
 * 非法 id 返回空数组：调用方据此一个路径都不会拼出来。
 * @param {string} id - 传入的会话 id。
 * @returns {string[]} 依次尝试的名字。
 */
export function sessionIdVariants(id) {
  if (!isSafeSessionId(id)) return []
  const bare = id.startsWith('session-') ? id.slice('session-'.length) : id
  const prefixed = `session-${bare}`
  return id === prefixed ? [prefixed, bare] : [bare, prefixed]
}
/**
 * 同一个会话的**规范 id**：去掉 `session-` 前缀。
 *
 * 并发的两次删除可能一个用 `abc`、一个用 `session-abc`，它们指向同一组目录；
 * 锁必须落在规范 id 上，否则两种写法各拿各的锁、同时进回收站桥。
 *
 * @param {unknown} id - 任意写法的会话 id。
 * @returns {string} 规范 id；非字符串给空串。
 */
export function canonicalSessionId(id) {
  const text = typeof id === 'string' ? id : ''
  return text.startsWith('session-') ? text.slice('session-'.length) : text
}