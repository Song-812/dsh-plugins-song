/** 跟随内置抓取器的取值，好让「走直连」这条路的观感和以前完全一致。 */
export const FETCH_LIMITS = {
  maxResponseBytes: 5_000_000,
  maxBodyChars: 100_000,
  maxRedirects: 5,
  userAgent: 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)',
}

/** 代理地址的默认值（Clash 混合端口）。要换别的端口见 resolveProxyUrl。 */
export const DEFAULT_PROXY_URL = 'http://127.0.0.1:7897'

/** 兼容旧写法：等同默认值。真正生效的地址以 resolveProxyUrl 的结果为准。 */
export const PROXY_URL = DEFAULT_PROXY_URL

/** 用环境变量改代理地址时认的变量名。 */
export const PROXY_URL_ENV = 'DSH_PROXY_CONNECT_URL'

/** 插件目录里的可选配置文件名：{ "proxyUrl": "http://127.0.0.1:7890" }。 */
export const PROXY_CONFIG_FILE = 'proxy.json'

/**
 * 解析实际使用的代理地址。优先级：环境变量 DSH_PROXY_CONNECT_URL > 插件目录 proxy.json 的
 * proxyUrl > 默认的 http://127.0.0.1:7897。写成不带协议的 `127.0.0.1:7890` 会按 http 处理；
 * 不合法的值会被忽略并退回默认值（原因通过 warnings 返回，由调用方记进诊断）。
 * 只支持 http / https 代理（undici 的 ProxyAgent 不支持 socks）。
 *
 * @param options.env - 环境变量对象。
 * @param options.configPath - proxy.json 的完整路径（可省略）。
 * @param options.readFile - 同步读文件函数，测试里注入。
 * @returns `{ url, source, warnings }`，source 为 env / file / default。
 */
export function resolveProxyUrl({ env = process.env, configPath, readFile } = {}) {
  const warnings = []
  const fromEnv = normalizeProxyUrl(env?.[PROXY_URL_ENV])
  if (fromEnv.url) return { url: fromEnv.url, source: 'env', warnings }
  if (fromEnv.problem) warnings.push(`环境变量 ${PROXY_URL_ENV} 无效（${fromEnv.problem}），已忽略`)

  if (configPath && readFile) {
    let raw
    try {
      raw = readFile(configPath)
    } catch (error) {
      if (error?.code !== 'ENOENT') warnings.push(`读取 ${PROXY_CONFIG_FILE} 失败（${error?.message ?? error}），已忽略`)
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
        const fromFile = normalizeProxyUrl(parsed?.proxyUrl)
        if (fromFile.url) return { url: fromFile.url, source: 'file', warnings }
        if (fromFile.problem) warnings.push(`${PROXY_CONFIG_FILE} 里的 proxyUrl 无效（${fromFile.problem}），已忽略`)
      } catch (error) {
        warnings.push(`${PROXY_CONFIG_FILE} 不是合法的 JSON（${error?.message ?? error}），已忽略`)
      }
    }
  }
  return { url: DEFAULT_PROXY_URL, source: 'default', warnings }
}

/** 空值 → 没配置；有值就必须是 http(s) 地址。返回 { url } 或 { problem } 或 {}。 */
function normalizeProxyUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return {}
  let text = value.trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `http://${text}`
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    return { problem: '不是合法的地址' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { problem: `不支持 ${parsed.protocol} 协议，只支持 http/https 代理` }
  }
  if (parsed.hostname.length === 0) return { problem: '缺少主机名' }
  return { url: text.replace(/\/+$/, '') }
}

/**
 * 自动登记的门槛：同一个域名在窗口内直连失败（且代理那次成功）累计够这么多次，
 * 才永久写进名单。一次网络抖动不够。
 */
export const REGISTER_AFTER_FAILURES = 3
export const REGISTER_WINDOW_MS = 10 * 60 * 1000

/** 名单监听失败后的重试间隔：从 1 秒翻倍，最长 30 秒，不再每秒空转。 */
export const WATCH_RETRY_BASE_MS = 1000
export const WATCH_RETRY_MAX_MS = 30_000

/** 直连尝试的连接超时：国内站实测最慢 449ms，2 秒留足余量。 */
export const CONNECT_TIMEOUT_MS = 2000

/** DSH 内置抓取器的 provider id；停用本插件时要把配置指回它。 */
export const BUILTIN_PROVIDER_ID = 'http'

/** 承载 `fetchProvider` 配置的那一行。 */
export const WEB_ENTRY_ID = 'web'

/**
 * 「改配置」写两遍时的确认延迟（启用与停用两个方向都用）。
 *
 * 启用/停用动作里 DSH 自己也要往 profile 的 `cordis.patch.yml` 写它的配置快照，
 * 而我们的写入落在同一个文件上。先写一遍、隔一会儿再写一遍（幂等），
 * 就不怕被对方那次写入盖掉——2026-10-17 实测外部写回确实被盖掉过一次。
 */
export const CONFIG_WRITE_RETRY_DELAY_MS = 400
