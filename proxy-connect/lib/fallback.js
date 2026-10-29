/**
 * 抓取失败的错误分类。
 *
 * 两个问题分开回答，别混用：
 *   shouldFallback     —— 这次失败值不值得改用代理重试，只有「压根没连上」值得
 *   isProxyUnreachable —— 这次失败是不是「代理端口没人听」，用来判 Clash 开没开
 *
 * 后者比前者窄：目标站不回响应也算网络失败、也该回退，但它恰恰说明代理是通的。
 */

const NETWORK_FAILURE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
])

const PROXY_UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
])

export function shouldFallback(error) {
  if (isCancellation(error)) return false
  const code = errorCode(error)
  if (code === undefined) return false
  if (code.startsWith('WEB_')) return false
  return NETWORK_FAILURE_CODES.has(code)
}

export function isProxyUnreachable(error) {
  const code = errorCode(error)
  return code !== undefined && PROXY_UNREACHABLE_CODES.has(code)
}

export function isCancellation(error) {
  return error?.name === 'AbortError' || codeOf(error) === 'ABORT_ERR'
    || error?.cause?.name === 'AbortError' || codeOf(error?.cause) === 'ABORT_ERR'
}

function errorCode(error) {
  return codeOf(error) ?? codeOf(error?.cause)
}

function codeOf(value) {
  return typeof value?.code === 'string' ? value.code : undefined
}
