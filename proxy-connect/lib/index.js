/**
 * 「代理连接」插件入口（Host 半）。
 *
 * 界面靠插件面板里这个插件自己的启停开关，所以这里没有任何前端代码；
 * 它只负责装配两条路，并把每一步事实写进 debug.log：
 *   1. 抓网页（plugin.js）：名单里的域名直接走代理；名单外先直连，连不上才转代理
 *      并把域名记进名单。
 *   2. 模型出网（egress.js）：名单里的域名走代理；其余一律直连（不重试、不登记）。
 * 两条路共用同一份 whitelist.json、同一个开关。
 *
 * undici 到第一次真用时才加载，所以拿不到它也不会挡住 DSH 启动——
 * 注册了却抓不动，比不注册更容易被发现，实测阶段会专门验这一条。
 */
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONNECT_TIMEOUT_MS, PROXY_CONFIG_FILE, resolveProxyUrl } from './config.js'
import { installEgress } from './egress.js'
import { install } from './plugin.js'
import { createDirectTransport, createProxyTransport } from './undici-transport.js'

export const name = 'proxy-connect'
export const inject = ['web']

const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const WHITELIST_PATH = join(PLUGIN_DIR, 'whitelist.json')
const DEBUG_LOG = join(PLUGIN_DIR, 'debug.log')
const PROXY_CONFIG_PATH = join(PLUGIN_DIR, PROXY_CONFIG_FILE)

export function apply(ctx) {
  resetDebugLog()

  // 代理地址：环境变量 DSH_PROXY_CONNECT_URL > 插件目录 proxy.json > 默认 127.0.0.1:7897。
  const proxy = resolveProxyUrl({
    env: process.env,
    configPath: PROXY_CONFIG_PATH,
    readFile: (file) => readFileSync(file, 'utf8'),
  })
  const proxyUrl = proxy.url
  recordDebug({ step: 'proxy-url', proxyUrl, source: proxy.source })
  for (const warning of proxy.warnings) {
    recordDebug({ step: 'proxy-url-warning', message: warning })
    ctx.logger?.warn?.(`代理连接：${warning}`)
  }

  const web = install(ctx, {
    whitelistPath: WHITELIST_PATH,
    loadTransports: () => loadTransports(proxyUrl),
    diagnose: recordDebug,
    proxyUrl,
  })
  web.ready.catch((error) => {
    recordDebug({ step: 'failed', message: describeError(error) })
    ctx.logger?.warn?.(`代理连接：接管抓取器失败（${describeError(error)}）`)
  })

  const egress = installEgress(ctx, {
    whitelistPath: WHITELIST_PATH,
    proxyUrl,
    diagnose: recordDebug,
  })
  egress.ready.catch((error) => {
    recordDebug({ step: 'egress-failed', message: describeError(error) })
    ctx.logger?.warn?.(`代理连接：模型出网接管失败（${describeError(error)}）`)
  })

  // 停用/卸载时把 undici 的连接池真正关掉；否则反复启停会留着两套 Agent。
  ctx.effect(() => () => { void closeTransports() }, 'proxy-connect: transports')
}

/** 关闭已经建出来的直连/代理 transport（没建过就什么都不做）。 */
async function closeTransports() {
  const pending = transportsPromise
  if (pending === undefined) return
  // 先摘掉引用再关：关闭是异步的，这期间若重新启用，必须拿到一套新连接池，
  // 否则新实例会永久绑定到正在关闭的旧 transport 上。
  transportsPromise = undefined
  try {
    const transports = await pending
    await Promise.allSettled([
      transports.direct?.close?.(),
      transports.proxy?.close?.(),
    ])
  } catch {
    // 加载失败时本来就没有连接池。
  }
}

function describeError(error) {
  return String(error?.message ?? error)
}

let transportsPromise

function loadTransports(proxyUrl) {
  transportsPromise ??= import('undici')
    .then(({ Agent, ProxyAgent, fetch }) => ({
      direct: createDirectTransport({ fetch, Agent, connectTimeoutMs: CONNECT_TIMEOUT_MS }),
      proxy: createProxyTransport({ fetch, ProxyAgent, proxyUrl }),
    }))
    .catch((error) => {
      transportsPromise = undefined
      throw error
    })
  return transportsPromise
}

/** 每次加载只留这一次的记录：诊断是给「现在为什么不对」用的，不是流水账。 */
function resetDebugLog() {
  try {
    writeFileSync(DEBUG_LOG, '', 'utf8')
  } catch {
    // 诊断写不进去不该影响插件工作
  }
}

function recordDebug(record) {
  try {
    appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${JSON.stringify(record)}\n`, 'utf8')
  } catch {
    // 同上
  }
}
