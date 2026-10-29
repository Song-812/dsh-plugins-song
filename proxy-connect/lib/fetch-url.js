/**
 * 读取一个 URL，整理成 DSH 要的结果形状。
 *
 * transport 由调用方注入：生产用 undici（直连和代理各一个 dispatcher），
 * 测试用假的 request。重定向、大小上限、内容类型这些判断留在这里，
 * 因为它们和「这一次走哪条路」无关。
 */

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

const ACCEPT =
  'text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8'

export function createFetcher({ request, maxResponseBytes, maxBodyChars, maxRedirects, userAgent }) {
  const limits = { maxResponseBytes, maxBodyChars, maxRedirects }
  const headers = { 'user-agent': userAgent, accept: ACCEPT }
  return (url, signal) => followAndRead({ request, limits, headers }, url, signal)
}

async function followAndRead({ request, limits, headers }, initialUrl, signal) {
  let currentUrl = initialUrl
  let redirectsFollowed = 0
  for (;;) {
    const response = await request(currentUrl, { headers, signal })
    if (!REDIRECT_STATUSES.has(response.status)) {
      return readBody(response, currentUrl, limits)
    }
    let target
    try {
      target = redirectTarget(response, currentUrl, redirectsFollowed, limits.maxRedirects)
    } finally {
      // 不跟随这条重定向时也要把正文流放掉：否则连接和传输资源会被这条响应占着。
      await response.body?.cancel().catch(() => {})
    }
    currentUrl = target
    redirectsFollowed += 1
  }
}

function redirectTarget(response, currentUrl, redirectsFollowed, maxRedirects) {
  if (redirectsFollowed >= maxRedirects) {
    throw webError(`exceeded the maximum of ${maxRedirects} redirects`, 'WEB_REDIRECT_BLOCKED')
  }
  const location = response.headers.get('location')
  if (location === null) {
    throw webError('redirect response carried no location header', 'WEB_REDIRECT_BLOCKED')
  }
  const target = new URL(location, currentUrl)
  if (!isSameOrigin(target, new URL(currentUrl))) {
    throw webError(
      `cross-origin redirect to ${target.origin} is not followed automatically`,
      'WEB_REDIRECT_BLOCKED',
    )
  }
  return target.toString()
}

async function readBody(response, finalUrl, limits) {
  const contentType = response.headers.get('content-type')
  const kind = classifyContentType(contentType)
  if (kind === undefined) {
    // 类型不支持就直接不读了：先把正文流取消，别把连接挂在那里。
    await response.body?.cancel().catch(() => {})
    throw webError(
      `unsupported content type ${contentType ?? '(missing)'}`,
      'WEB_UNSUPPORTED_CONTENT_TYPE',
    )
  }
  const { bytes, truncatedByBytes } = await readCapped(response, limits.maxResponseBytes)
  const decoded = decode(bytes, contentType)
  const truncatedByChars = decoded.length > limits.maxBodyChars
  return {
    url: finalUrl,
    statusCode: response.status,
    body: { kind, content: truncatedByChars ? decoded.slice(0, limits.maxBodyChars) : decoded },
    truncated: truncatedByBytes || truncatedByChars,
  }
}

async function readCapped(response, maxResponseBytes) {
  const chunks = []
  let total = 0
  let truncatedByBytes = false
  for await (const chunk of response.body ?? []) {
    const buffer = Buffer.from(chunk)
    const remaining = maxResponseBytes - total
    if (buffer.byteLength > remaining) {
      chunks.push(buffer.subarray(0, remaining))
      total += remaining
      truncatedByBytes = true
      break
    }
    chunks.push(buffer)
    total += buffer.byteLength
  }
  return { bytes: Buffer.concat(chunks), truncatedByBytes }
}

function decode(bytes, contentType) {
  const charset = parseCharset(contentType)
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function parseCharset(contentType) {
  const match = /charset=([^;]+)/i.exec(contentType ?? '')
  return match === null ? 'utf-8' : match[1].trim().replace(/^["']|["']$/g, '')
}

function classifyContentType(contentType) {
  const mime = (contentType ?? '').replace(/;.*$/s, '').trim().toLowerCase()
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'
  if (mime.startsWith('text/')) return 'text'
  if (mime === 'application/json' || mime === 'application/xml') return 'text'
  if (mime.endsWith('+json') || mime.endsWith('+xml')) return 'text'
  return undefined
}

function isSameOrigin(left, right) {
  return left.protocol === right.protocol && left.hostname === right.hostname && left.port === right.port
}

function webError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}
