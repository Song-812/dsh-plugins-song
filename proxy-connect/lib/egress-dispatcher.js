/**
 * 把「分诊台」装成进程的全局出网出口（模型、HTTP MCP、其他插件等 Node 侧流量）。
 *
 * 做法是**每次请求都重新判定**：分诊台本身是个 Dispatcher 包装层，
 * 命中名单就转发给 ProxyAgent（走 Clash），否则转发给 Agent（直连，连接池照常复用）。
 *
 * 为什么不按 origin 缓存判定：undici 的 Agent 会按 origin 缓存连接，
 * 名单改完对"之前失败过、已经缓存了直连连接"的域名不生效——那正是最需要它生效的场景。
 * 包装层每次 dispatch 都问一遍，名单一变立刻改道，也不打断已有连接。
 *
 * undici 由外面注入，所以既能脱离 DSH 运行时测试，也能在卸载时精确归还。
 */
/**
 * 安装选择性 dispatcher。
 * @param input - undici 模块、判定函数、代理地址。
 * @returns 分诊台实例与卸载函数。
 */
export function installSelectiveDispatcher({ undici, routes, proxyUrl }) {
  const { Dispatcher, Agent, ProxyAgent, getGlobalDispatcher, setGlobalDispatcher } = undici
  const previous = getGlobalDispatcher()
  const direct = new Agent()
  const proxied = new ProxyAgent({ uri: proxyUrl })
  let disposed = false
  let disposePromise

  class SelectiveDispatcher extends Dispatcher {
    dispatch(options, handler) {
      // 后安装的组件可能保留了这个出口；卸载后转交原出口，避免留下已关闭的死引用。
      if (disposed) return previous.dispatch(options, handler)
      const target = `${options.origin}${options.path ?? ''}`
      return routes.shouldProxy(target) ? proxied.dispatch(options, handler) : direct.dispatch(options, handler)
    }

    close(callback) {
      return settle([direct.close(), proxied.close()], callback)
    }

    destroy(error, callback) {
      const reason = typeof error === 'function' ? undefined : error
      const done = typeof error === 'function' ? error : callback
      return settle([direct.destroy(reason), proxied.destroy(reason)], done)
    }
  }

  const agent = new SelectiveDispatcher()
  setGlobalDispatcher(agent)
  return {
    agent,
    dispose() {
      if (disposePromise) return disposePromise
      disposed = true
      if (getGlobalDispatcher() === agent) setGlobalDispatcher(previous)
      disposePromise = settle([direct.close(), proxied.close()])
      return disposePromise
    },
  }
}

/**
 * 同时等两条通道收尾；调用方给了回调就按回调用法回，否则返回 Promise。
 * undici 的 Dispatcher 两种用法都有，包装层必须都认。
 */
function settle(promises, callback) {
  const all = Promise.all(promises)
  if (typeof callback !== 'function') return all
  all.then(
    () => callback(null),
    (error) => callback(error),
  )
  return undefined
}
