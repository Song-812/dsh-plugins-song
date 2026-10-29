/**
 * 插件的装配逻辑，与 Cordis 框架解耦，所以可以直接测。
 *
 * 两件事：启用时把 `web` 那行的 `fetchProvider` 改成自己；停用时把这一行**交还**
 * 内置实现。
 *
 * 两个方向都以 `configEditor` 为首选，但**都能退回文件**：启用/停用插件这个动作本身
 * 就在 DSH 的 HMR 事务里，在事务里改配置会报
 *   HMR transactions cannot be nested
 * 失败会把配置停在旧值，于是：关的时候 `fetchProvider` 指向一个没加载的抓取器，
 * 抓网页整个坏掉（2026-10-14 实测）；开的时候配置留在内置实现上，网页那半静默不走
 * 代理（2026-10-17 实测）。文件级写入绕开了那层限制，细节见 lib/profile-web-config.js。
 *
 * 走过弯路留下的教训：失败一定要记进诊断，不能静默吞掉——最早那次失败没记录，
 * 完全看不出问题在哪。
 */
import { createFetcher } from './fetch-url.js'
import { createProvider, PROVIDER_ID } from './provider.js'
import {
  claimFetchProviderInFile,
  handBackFetchProviderInFile,
  resolvePatchFilePath,
} from './profile-web-config.js'
import {
  BUILTIN_PROVIDER_ID,
  CONFIG_WRITE_RETRY_DELAY_MS,
  FETCH_LIMITS,
  WEB_ENTRY_ID,
} from './config.js'

export function install(
  ctx,
  {
    whitelistPath,
    loadTransports,
    diagnose = () => {},
    patchFilePath = resolvePatchFilePath(),
    configRetryDelayMs = CONFIG_WRITE_RETRY_DELAY_MS,
    proxyUrl,
    providerOptions = {},
  },
) {
  const provider = createProvider({
    whitelistPath,
    fetchDirect: createLazyFetcher(loadTransports, 'direct'),
    fetchViaProxy: createLazyFetcher(loadTransports, 'proxy'),
    onWarn: diagnose,
    ...(proxyUrl === undefined ? {} : { proxyUrl }),
    ...providerOptions,
  })
  ctx.web.registerFetchProvider(provider)
  ctx.effect(() => () => handBackFetchProvider({ patchFilePath, diagnose, delayMs: configRetryDelayMs }))
  return { provider, ready: claimFetchProvider(ctx, { patchFilePath, diagnose, retryDelayMs: configRetryDelayMs }) }
}

/**
 * 启用时把配置指向自己。
 *
 * 先走 `configEditor`（DSH 的正当途径，开机装载时不在事务里，能成）；它若被 HMR
 * 事务挡住，就退回文件写入——否则从面板里打开插件会静默留在内置抓取器上。
 *
 * 文件写两遍（和交还同一个理由）：DSH 自己也会往这个文件写它的配置快照，
 * 2026-10-17 实测外部写回会被它盖掉一次；隔一会儿再写一遍（幂等）就稳了。
 */
async function claimFetchProvider(ctx, { patchFilePath, diagnose, retryDelayMs }) {
  const epoch = nextConfigEpoch()
  let status = 'unavailable'
  try {
    status = await writeFetchProvider(ctx, PROVIDER_ID, diagnose)
  } catch (error) {
    diagnose({ step: 'claim-via-config-editor-failed', message: describeError(error) })
  }
  if (status === 'applied' || status === 'already') return { kind: 'config-editor' }
  // 若抓取器已被其他插件接管：不抢，也不再用文件回退去动它。
  if (status === 'third-party') return { kind: 'third-party' }

  // 没接管成功（没编辑器 / 找不到 web 行 / 抛错）→ 走文件回退。
  await claimViaFileOnce({ patchFilePath, diagnose, step: 'claim-via-file' })
  if (retryDelayMs <= 0) return { kind: 'file' }
  await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
  if (currentConfigEpoch() !== epoch) {
    // 等待期间又有人动了这个配置（比如马上停用）：第二遍写入会盖掉对方，放弃。
    diagnose({ step: 'claim-confirm-skipped', reason: 'superseded' })
    return { kind: 'file' }
  }
  await claimViaFileOnce({ patchFilePath, diagnose, step: 'claim-via-file-confirmed' })
  return { kind: 'file' }
}

async function claimViaFileOnce({ patchFilePath, diagnose, step }) {
  try {
    const { changed } = await claimFetchProviderInFile(patchFilePath, {
      from: BUILTIN_PROVIDER_ID,
      to: PROVIDER_ID,
    })
    diagnose({ step, file: patchFilePath, changed })
  } catch (error) {
    diagnose({ step: 'claim-via-file-failed', file: patchFilePath, message: describeError(error) })
  }
}

/**
 * 停用（或卸载）时把 `web` 那行的 `fetchProvider` 交还内置实现。
 *
 * 写两遍是为了和 DSH 自己那次 `disabled: true` 的写入错开：先写一遍，隔一会儿再
 * 写一遍确认；第二遍是幂等的（值已经不是我们时直接跳过）。
 */
async function handBackFetchProvider({ patchFilePath, diagnose, delayMs }) {
  const epoch = nextConfigEpoch()
  await handBackOnce({ patchFilePath, diagnose, step: 'handed-back' })
  if (delayMs <= 0) return
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  if (currentConfigEpoch() !== epoch) {
    // 重载场景：旧实例交还后，新实例已经接管。这时再「确认交还」会把新实例刚写好的配置改回去。
    diagnose({ step: 'hand-back-confirm-skipped', reason: 'superseded' })
    return
  }
  await handBackOnce({ patchFilePath, diagnose, step: 'handed-back-confirmed' })
}

async function handBackOnce({ patchFilePath, diagnose, step }) {
  try {
    const { changed } = await handBackFetchProviderInFile(patchFilePath, {
      from: PROVIDER_ID,
      to: BUILTIN_PROVIDER_ID,
    })
    diagnose({ step, file: patchFilePath, changed })
  } catch (error) {
    diagnose({ step: 'hand-back-failed', file: patchFilePath, message: describeError(error) })
  }
}

function describeError(error) {
  return String(error?.message ?? error)
}

/**
 * 「谁最后动过 fetchProvider 配置」的序号。接管与交还各自开始时领一个号；
 * 延迟 400ms 的第二遍写入醒来后若发现号已经被别人领走，就不再写。
 * 放在 globalThis 上：即便模块被重新加载出第二份，新旧实例仍看得到同一个序号。
 */
const CONFIG_EPOCH_KEY = Symbol.for('dsh-proxy-connect.config-write-epoch')

function nextConfigEpoch() {
  globalThis[CONFIG_EPOCH_KEY] = (globalThis[CONFIG_EPOCH_KEY] ?? 0) + 1
  return globalThis[CONFIG_EPOCH_KEY]
}

function currentConfigEpoch() {
  return globalThis[CONFIG_EPOCH_KEY] ?? 0
}

/**
 * 到第一次真的抓取时才去拿 undici：模块导入失败不该挡住 DSH 启动，
 * 而 transport 建一次就复用，保住连接池。
 */
function createLazyFetcher(loadTransports, kind) {
  let fetcherPromise
  return async (request, signal) => {
    fetcherPromise ??= loadTransports().then((transports) =>
      createFetcher({ request: transports[kind].request, ...FETCH_LIMITS }),
    )
    return (await fetcherPromise)(request.url, signal)
  }
}

/**
 * 把 `web` 那一行的 fetchProvider 写成目标值；已经是它就什么都不做。
 *
 * 三处容易踩的语义，都靠 diagnose 在真实 DSH 里验过：
 *   1. entries() 给的是**启动时的快照**，且行只有 `id`（如 `include:web`）、没有
 *      patchId；web 还必须先在 profile 里存在，configEditor 才够得着它。
 *   2. edit(entry, change) 里 change 收到与返回的都是**那一行的 config 对象本身**，
 *      不含外层 `config:` 键——按「整个 entry」理解会写出嵌套 config，把配置弄废。
 *   3. 这个写操作在插件的加载/卸载过程中会被 HMR 事务拒绝（见文件头注释）。
 */
async function writeFetchProvider(ctx, providerId, diagnose) {
  const editor = ctx.get('configEditor')
  diagnose({ step: 'editor', present: editor !== undefined })
  // 取不到编辑器 ≠ 接管成功：以前这里静默返回，上层就当成功了，文件回退永远不跑。
  if (editor === undefined) return 'unavailable'

  const entries = editor.entries()
  const entry = entries.find((item) => matchWebEntry(item))
  diagnose({
    step: 'entry',
    total: entries.length,
    sample: entries.slice(0, 3).map(shapeOf),
    webish: entries.filter(isWebish).map(shapeOf),
    matched: entry === undefined ? null : shapeOf(entry),
    providerId,
  })
  if (entry === undefined) return 'unavailable'

  const current = editor.configuration().find((item) => item.entry === entry)
  const explicit = current?.override?.fetchProvider
  diagnose({ step: 'current', explicit: explicit ?? null })
  if (explicit === providerId) return 'already'
  // 只接管内置值（或没显式设置）；别人家的抓取器不抢，关闭时也没资格替它做主。
  if (explicit !== undefined && explicit !== BUILTIN_PROVIDER_ID) {
    diagnose({ step: 'skip-third-party', explicit })
    return 'third-party'
  }

  await editor.edit(entry, (config, inherited) => ({
    ...(inherited ?? {}),
    ...(config ?? {}),
    fetchProvider: providerId,
  }))
  diagnose({ step: 'written', providerId })
  return 'applied'
}

/**
 * 行的标识三种都认（真实 DSH 用的是第三种）：
 *   { id: 'web' }
 *   { id: 'include:web', patchId: 'web' }
 *   { id: 'include:web' }
 */
function matchWebEntry(item) {
  if (item === null || typeof item !== 'object') return false
  if (item.patchId === WEB_ENTRY_ID) return true
  const id = typeof item.id === 'string' ? item.id : ''
  return id === WEB_ENTRY_ID || id.endsWith(`:${WEB_ENTRY_ID}`)
}

function shapeOf(item) {
  return {
    id: item?.id ?? null,
    patchId: item?.patchId ?? null,
    name: item?.name ?? null,
  }
}

function isWebish(item) {
  if (item === null || typeof item !== 'object') return false
  const text = `${item.id ?? ''}|${item.patchId ?? ''}|${item.name ?? ''}`
  return text.toLowerCase().includes('web')
}
