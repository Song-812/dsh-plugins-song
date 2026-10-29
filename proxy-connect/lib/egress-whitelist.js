/**
 * 实时名单：内存里判定，后台跟着文件刷新。
 *
 * 为什么需要它：模型那条路原本在装载时读一次名单，改完 JSON 必须重载插件才生效，
 * 很容易忘（忘了就以为 key 填错了）。这里把"读文件"挪到请求路径之外：
 * 请求时只查内存集合，文件变了由监听刷新。
 *
 * 两条硬要求：
 *   · 名单写坏或暂时不存在时**保留上一份好名单**——否则解析失败等于空名单，
 *     openai 会突然掉回直连；
 *   · 合法的空数组是**真更新**（使用者真把名单清空，就该全部直连）。
 */
import { watch as fsWatch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { routeFor } from './egress-routing.js'
import { normalizeHost } from './whitelist.js'
import { WATCH_RETRY_BASE_MS, WATCH_RETRY_MAX_MS } from './config.js'

/** 读取失败原因 → 警告里给人看的中文说法。 */
const FAIL_REASON_TEXT = {
  invalid: '文件内容损坏（不是合法的 JSON 数组）',
  unreadable: '文件读不了',
  threw: '读取时抛错',
}

/**
 * 严格读取名单：把「读不到」和「内容是空数组」区分开。
 * @param filePath - whitelist.json 路径。
 * @returns `{ ok: true, hosts }` 或 `{ ok: false, reason }`。
 */
export async function readWhitelistStrict(filePath) {
  let raw
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    return error?.code === 'ENOENT' ? { ok: false, reason: 'missing' } : { ok: false, reason: 'unreadable' }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (!Array.isArray(parsed)) return { ok: false, reason: 'invalid' }
  return { ok: true, hosts: new Set(parsed.map(normalizeHost).filter((entry) => entry.length > 0)) }
}

/**
 * 建立一份跟着文件走的名单。
 *
 * 监听的是名单文件**所在的目录**、再按文件名过滤，而不是文件本身：
 *   · 文件还不存在时照样能监听，之后建出来会收到事件（以前监听文件会 ENOENT，
 *     于是每秒重试、每秒写一行诊断，而且建出来后也读不到）；
 *   · 名单是「临时文件 + 改名」整体替换的，盯着单个文件的监听在 Linux/macOS 上
 *     第一次替换后就失效，盯目录则一直有效。
 * 监听建失败/中途挂掉时按指数退避重建（1s→30s），诊断只在每一轮失败的第一次记一条，
 * 重建成功后补读一次文件。
 * @param options - 文件路径、读取器、监听器、防抖毫秒数与监听失败的回调。
 * @returns 判定函数、手动刷新、当前名单与释放函数。
 */
export function createLiveWhitelist({
  filePath,
  read = readWhitelistStrict,
  watch = fsWatch,
  debounceMs = 150,
  onError = () => {},
  retryBaseMs = WATCH_RETRY_BASE_MS,
  retryMaxMs = WATCH_RETRY_MAX_MS,
}) {
  const watchDir = dirname(filePath)
  const watchName = basename(filePath).toLowerCase()
  let hosts = new Set()
  let timer
  let watcher
  let disposed = false
  // 启动首读失败时内存里就是空名单，没人看得见：警告一次（文件路径 + 原因），
  // 之后文件修好或开始保留上一份好名单就不再打扰。
  let everLoaded = false
  let startupWarned = false

  const warnStartupFailure = (result) => {
    if (result?.ok !== false || everLoaded || startupWarned || result.reason === 'missing') return
    startupWarned = true
    const detail = result.reason === 'threw' ? String(result.error?.message ?? result.error) : FAIL_REASON_TEXT[result.reason] ?? result.reason
    console.warn(
      `⚠️ [代理连接] 模型出网启动时白名单读取失败（${detail}），没有上一份好名单可保留，暂时按空名单处理：${filePath}`,
    )
  }

  const refresh = async () => {
    try {
      const result = await read(filePath)
      if (result?.ok === true) {
        hosts = result.hosts
        everLoaded = true
      } else {
        warnStartupFailure(result)
      }
      return result
    } catch (error) {
      onError(error)
      const result = { ok: false, reason: 'threw', error }
      warnStartupFailure(result)
      return { ok: false, reason: 'threw' }
    }
  }

  const scheduleRefresh = () => {
    if (disposed) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      refresh()
    }, debounceMs)
    timer.unref?.()
  }

  /** 目录里任何文件变了都会来；只有名单文件（或没带文件名的事件）才触发刷新。 */
  const onFsEvent = (_event, changed) => {
    if (changed !== undefined && changed !== null && String(changed).toLowerCase() !== watchName) return
    scheduleRefresh()
  }

  let retry = null
  let attempts = 0
  let failStreak = 0
  let reported = false
  /** 同一轮连续失败只上报第一次，成功后重新计数；不能每次重试都往诊断里写。 */
  const reportOnce = (error) => {
    if (reported) return
    reported = true
    onError(error)
  }
  /** 失败或监听意外终止时，退避一会儿重建；不能只试一次，也不能每秒空转。 */
  const scheduleRetry = () => {
    if (disposed || retry !== null) return
    const delay = Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(failStreak, 16))
    failStreak += 1
    retry = setTimeout(() => {
      retry = null
      startWatch()
    }, delay)
    retry.unref?.()
  }
  const startWatch = () => {
    if (disposed) return
    attempts += 1
    try {
      watcher?.close?.()
      watcher = watch(watchDir, onFsEvent)
      // 监听本身会在出错后停止（目录删除、被替换等）：关掉并重建，否则名单再也不更新。
      watcher?.on?.('error', (error) => {
        reportOnce(error)
        try {
          watcher?.close?.()
        } catch {
          // 已经坏掉的 watcher 关不掉也无所谓，下面会重建。
        }
        watcher = undefined
        scheduleRetry()
      })
      if (retry !== null) {
        clearTimeout(retry)
        retry = null
      }
      failStreak = 0
      reported = false
      // 重建的监听不会补发「已经发生过的变化」：补读一次，否则监听失效期间改的名单会一直不生效。
      // （第一次就建成时，调用方已经读过，不必重复。）
      if (attempts > 1) void refresh()
    } catch (error) {
      reportOnce(error)
      scheduleRetry()
    }
  }
  startWatch()

  return {
    refresh,
    shouldProxy: (url) => routeFor(url, hosts) === 'proxy',
    hosts: () => hosts,
    dispose() {
      disposed = true
      clearTimeout(timer)
      if (retry !== null) {
        clearTimeout(retry)
        retry = null
      }
      watcher?.close?.()
      watcher = undefined
    },
  }
}
