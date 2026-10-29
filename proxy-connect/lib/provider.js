/**
 * 抓取 provider：决定这一次走直连还是走代理。
 *
 * 规则（设计约定）：名单里的域名直接走代理；名单外的先直连，
 * 只有压根没连上才转代理；转成功**且同一域名在窗口内累计失败够次数**，
 * 才把它永久登记下来（一次网络抖动不算，见 failure-tracker.js）。
 * 代理这条路也没成时，报错要说清是「代理没起来」而不是含糊的网络故障。
 */
import { addHost, covers, loadWhitelist } from './whitelist.js'
import { isCancellation, isProxyUnreachable, shouldFallback } from './fallback.js'
import { PROXY_URL, REGISTER_AFTER_FAILURES, REGISTER_WINDOW_MS } from './config.js'
import { createFailureTracker } from './failure-tracker.js'

export const PROVIDER_ID = 'proxy-connect'

export function createProvider({
  whitelistPath,
  fetchDirect,
  fetchViaProxy,
  onWarn = () => {},
  proxyUrl = PROXY_URL,
  registerAfterFailures = REGISTER_AFTER_FAILURES,
  registerWindowMs = REGISTER_WINDOW_MS,
  now = Date.now,
}) {
  const tracker = createFailureTracker({ threshold: registerAfterFailures, windowMs: registerWindowMs, now })
  return {
    id: PROVIDER_ID,
    available: () => true,
    async fetch(request, signal) {
      const host = hostOf(request.url)
      if (await isWhitelisted(whitelistPath, host)) {
        return await attemptProxy(request, signal, fetchViaProxy, proxyUrl)
      }
      let direct
      try {
        direct = await fetchDirect(request, signal)
      } catch (error) {
        if (!shouldFallback(error)) throw error
        const result = await attemptProxy(request, signal, fetchViaProxy, proxyUrl)
        // 代理通了而直连不通：记一次失败，累计到门槛才永久登记（单次抖动不进名单）。
        if (tracker.record(host)) {
          // 登记只是顺手记一笔：名单读不了/写坏了，也不能把已经拿到的网页丢掉。
          try {
            await addHost(whitelistPath, host)
            onWarn({ step: 'whitelist-added', host })
          } catch (error) {
            onWarn({ step: 'whitelist-add-failed', host, message: String(error?.message ?? error) })
          }
        } else {
          onWarn({ step: 'direct-failure-counted', host, count: tracker.count(host), need: registerAfterFailures })
        }
        return result
      }
      tracker.clear(host) // 直连通了：之前攒的失败作废
      return direct
    },
  }
}

/** 代理这条路的失败要能看出「代理没起来」，而不是一个孤零零的网络错误码。 */
async function attemptProxy(request, signal, fetchViaProxy, proxyUrl) {
  try {
    return await fetchViaProxy(request, signal)
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error
    if (isCancellation(error)) throw error
    throw proxyFailureError(request.url, error, proxyUrl)
  }
}

function proxyFailureError(url, proxyError, proxyUrl) {
  const hint = isProxyUnreachable(proxyError)
    ? `代理 ${proxyUrl} 连不上——Clash 大概没开着（或代理地址不对）`
    : `代理 ${proxyUrl} 这一步仍然失败`
  const wrapped = new Error(`抓取 ${url} 失败：${hint}。（原始错误：${describe(proxyError)}）`)
  wrapped.code = 'PROXY_SWITCH_PROXY_FAILED'
  wrapped.cause = proxyError
  return wrapped
}

function describe(error) {
  return String(error?.code ?? error?.message ?? error)
}

async function isWhitelisted(whitelistPath, host) {
  return covers(await loadWhitelist(whitelistPath), host)
}

function hostOf(url) {
  return new URL(url).hostname
}
