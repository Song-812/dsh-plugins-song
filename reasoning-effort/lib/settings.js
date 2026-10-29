/**
 * dsh-reasoning-effort 加速档配置读写。
 *
 * 存放位置：$DSH_HOME/reasoning-effort/settings.json（纯文本、可手改）。
 * 只碰自己的目录，不写 profile、不写别人的文件 —— 与其他插件同一套做法。
 *
 * 为什么不走 DSH 的 settings 服务：加速档是**插件自有数据**，而
 *   ① DSH 的 settings namespace 没有给插件自注册的口子（查过 addNamespace 等，
 *      唯一命中的是 PDF 库，无关）；
 *   ② 插件自己的 entry config 虽然正规，但 configEditor 没有 Remote 方法，
 *      浏览器半边写不到它。
 * 所以照抄其他插件的做法：host 侧读写本地 json + 注册 HTTP 路由，client fetch。
 *
 * ⚠️ 这份配置只由浏览器半边读取，因此**改完要刷新页面才生效**（不像
 *    llm-pi-ai 那些走 settings 的改动有 HMR 约 2 秒热生效）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULTS = Object.freeze({
  /** 普通版模型：闪电从它切出去、再切回来的目标 */
  turboBaseModelId: 'mimo-v2.6-pro',
  /** 加速版模型：闪电切进去的那个 */
  turboModelId: 'mimo-v2.6-pro-ultraspeed',
  /** flash 这类没有加速版的模型上，闪电能否点（false = 置灰，与产品约定一致） */
  boltOnFlash: false,
  /** 从模型选择器里隐藏的模型 id。ultraspeed 默认藏（只留闪电入口），
      用户随时能把它删掉、让它重新出现在列表里（隐藏列表可编辑）。 */
  hiddenModels: ['mimo-v2.6-pro-ultraspeed'],
})

export function homeDir() {
  const value = process.env.DSH_HOME
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : path.join(os.homedir(), '.dsh')
}

export function dataDir() {
  return path.join(homeDir(), 'reasoning-effort')
}

export function settingsFile() {
  return path.join(dataDir(), 'settings.json')
}

function normalize(raw) {
  const source = typeof raw === 'object' && raw !== null ? raw : {}
  const str = (value, fallback) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback)
  return {
    turboBaseModelId: str(source.turboBaseModelId, DEFAULTS.turboBaseModelId),
    turboModelId: str(source.turboModelId, DEFAULTS.turboModelId),
    boltOnFlash: source.boltOnFlash === true,
    // 空数组是合法值（= 一个都不藏）；只有「压根不是数组」才回落默认
    hiddenModels: Array.isArray(source.hiddenModels)
      ? source.hiddenModels.filter((value) => typeof value === 'string' && value.trim() !== '').map((value) => value.trim())
      : [...DEFAULTS.hiddenModels],
  }
}

export function loadSettings() {
  try {
    return normalize(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')))
  } catch {
    // 走 normalize 而不是直接展开 DEFAULTS：后者会把 hiddenModels 这个数组
    // 以**同一个引用**交给调用方，改它会污染 DEFAULTS。
    return normalize({})
  }
}

/** 合并写入：只覆盖传进来的字段，其余保持原值；返回归一化后的完整配置。 */
export function saveSettings(patch) {
  const next = normalize({ ...loadSettings(), ...(typeof patch === 'object' && patch !== null ? patch : {}) })
  fs.mkdirSync(dataDir(), { recursive: true })
  writeFileAtomic(settingsFile(), `${JSON.stringify(next, null, 2)}\n`)
  return next
}

/**
 * 原子写：先写同目录临时文件，再整体替换。
 *
 * 直接 writeFileSync 会先把目标截断：写一半失败（磁盘满、进程被杀）时配置就变成空文件
 * 或半截 JSON，下次读取会静默回落默认值 —— 相当于配置被悄悄清空。
 */
function writeFileAtomic(file, text) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(temp, text, 'utf8')
    fs.renameSync(temp, file)
  } catch (error) {
    try { fs.unlinkSync(temp); } catch { /* 临时文件可能压根没建出来 */ }
    throw error
  }
}