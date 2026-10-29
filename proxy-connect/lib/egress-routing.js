/**
 * 模型出网的分流判定：**默认直连**，只有名单里的域名才走代理。
 *
 * 与抓网页那条路的语义一致（`provider.js`）：名单 = 要走代理的域名。
 * 不同点在失败处理：模型请求不做「直连失败再转代理」——那会让国内端点也有机会
 * 被拖慢，与设计目标相反；名单外的域名就是直连，快慢与 Clash 开没开无关。
 *
 * 纯函数为主，只有「是否让位」需要读环境变量，所以能脱离 DSH 运行时测试。
 */
import { covers } from './whitelist.js'

/**
 * DSH 自己那套出网代理策略（@deepseek-ai/dsh-http-proxy）认的环境变量名。
 *
 * 检测到任何一个有值就让位：那种情况下 DSH 已经在进程级接管出网，
 * 本插件再装一个只会互相覆盖，谁后装谁说了算，行为不可预期。
 */
export const PROXY_ENV_NAMES = [
  'https_proxy',
  'HTTPS_PROXY',
  'http_proxy',
  'HTTP_PROXY',
  'all_proxy',
  'ALL_PROXY',
]

/** 只允许这两种协议经代理：其余协议连代理都没法描述。 */
const PROXYABLE_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * 判定一个地址走哪条路。
 *
 * 本机地址与非 http(s) 协议永远直连；其余看名单（按域名后缀匹配，子域名一并覆盖）。
 * @param url - 请求地址，字符串或 URL 都收。
 * @param whitelist - 域名集合。
 * @returns `direct` 或 `proxy`。
 */
export function routeFor(url, whitelist) {
  let parsed
  try {
    parsed = url instanceof URL ? url : new URL(String(url))
  } catch {
    return 'direct'
  }
  if (!PROXYABLE_PROTOCOLS.has(parsed.protocol)) return 'direct'
  const host = parsed.hostname.toLowerCase()
  if (isLoopbackHost(host)) return 'direct'
  return covers(whitelist, host) ? 'proxy' : 'direct'
}

/** DSH 的 Web UI、本地桥接、MCP 本机端点都在 loopback 上，永远不绕代理。 */
function isLoopbackHost(host) {
  if (host === 'localhost' || host === '0.0.0.0') return true
  if (host === '::1' || host === '[::1]') return true
  return /^127\./.test(host)
}

/**
 * DSH 是否已经自己配好了出网代理。
 * @param env - 环境变量对象，默认取当前进程。
 * @returns 任一代理变量有非空值时为 true。
 */
export function hasDshProxyConfigured(env = process.env) {
  return PROXY_ENV_NAMES.some((name) => {
    const value = env?.[name]
    return typeof value === 'string' && value.trim().length > 0
  })
}
