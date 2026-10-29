/**
 * 模型出网这一半的装配：建实时名单 → 拿 undici → 装分诊台 → 注册卸载。
 *
 * 与抓网页那一半（plugin.js）各管一条路、共用同一份 whitelist.json；
 * 两半都由 index.js 装配。
 *
 * 名单是**实时**的：装载时读一次，之后由文件监听刷新——改完 JSON 立刻生效，
 * 不用重载插件。写坏或暂时不见时保留上一份好名单（细节见 egress-whitelist.js）。
 *
 * 「让位」判断很重要：DSH 若已通过环境变量配好出网代理，就不要再装一个，
 * 否则两套策略互相覆盖，谁后装谁说了算。
 */
import { PROXY_URL } from './config.js'
import { installSelectiveDispatcher } from './egress-dispatcher.js'
import { hasDshProxyConfigured } from './egress-routing.js'
import { createLiveWhitelist } from './egress-whitelist.js'

/**
 * 装上模型出网的分诊台。
 * @param ctx - 插件上下文（只用到 `effect`）。
 * @param options - 名单路径、代理地址、环境变量、undici 加载器与诊断回调。
 * @returns `ready`：装上或让位的结果；失败时 reject（由调用方记进诊断）。
 */
export function installEgress(
  ctx,
  {
    whitelistPath,
    proxyUrl = PROXY_URL,
    env = process.env,
    loadUndici = loadUndiciModule,
    diagnose = () => {},
    watch,
  },
) {
  if (hasDshProxyConfigured(env)) {
    diagnose({ step: 'stand-aside', reason: 'DSH 已配置出网代理环境变量' })
    return { ready: Promise.resolve({ kind: 'stand-aside' }) }
  }
  return { ready: install(ctx, { whitelistPath, proxyUrl, loadUndici, diagnose, watch }) }
}

async function install(ctx, { whitelistPath, proxyUrl, loadUndici, diagnose, watch }) {
  const routes = createLiveWhitelist({
    filePath: whitelistPath,
    ...(watch === undefined ? {} : { watch }),
    onError: (error) => diagnose({ step: 'whitelist-watch-failed', message: String(error?.message ?? error) }),
  })

  // 清理动作要**最先**注册：undici 加载要等一会儿（实测约 2 秒），这期间插件被关掉的话，
  // 关掉的这一刻就得能收拾干净，而不是等装完才注册、结果没人撤。
  let disposed = false
  let installed = null
  ctx.effect(() => async () => {
    disposed = true
    routes.dispose()
    const current = installed
    installed = null
    if (current !== null) await current.dispose()
  })

  try {
    await routes.refresh()
    const hosts = [...routes.hosts()]
    diagnose({ step: 'whitelist-loaded', hosts })

    const undici = await loadUndici()
    if (disposed) {
      // 等 undici 的时候已经被关掉了：不再装全局出口，免得没人去撤。
      diagnose({ step: 'egress-cancelled', reason: '装配过程中插件已被停用' })
      return { kind: 'cancelled' }
    }
    installed = installSelectiveDispatcher({ undici, routes, proxyUrl })
    diagnose({ step: 'egress-installed', proxyUrl, hosts })
    return { kind: 'installed', hosts }
  } catch (error) {
    // undici 加载失败等：别把文件监听和重试定时器留在后台。
    routes.dispose()
    throw error
  }
}

function loadUndiciModule() {
  return import('undici')
}
