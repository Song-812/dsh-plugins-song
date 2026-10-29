/**
 * undici 适配层：把「直连」和「走代理」包成同一个 request 签名。
 *
 * 这一层刻意做薄，vendor 细节不外泄，也不在这里做任何决策。
 * 它没有单元测试：undici 只有 DSH 运行时里才有、本地 npm 装不到，
 * 所以它的正确性靠装进 DSH 之后的实测覆盖（见说明.txt 的验证记录）。
 */

/** 直连：连接阶段单独限时，超时按「连不上」上报，好让上层转代理。 */
export function createDirectTransport({ fetch, Agent, connectTimeoutMs }) {
  const dispatcher = new Agent({ connect: { timeout: connectTimeoutMs } })
  return {
    request: (url, { headers, signal }) =>
      fetch(url, { method: 'GET', redirect: 'manual', headers, signal, dispatcher }),
    close: () => dispatcher.close(),
  }
}

/** 走代理：域名交给代理解析，所以本地不做地址固定。 */
export function createProxyTransport({ fetch, ProxyAgent, proxyUrl }) {
  const dispatcher = new ProxyAgent(proxyUrl)
  return {
    request: (url, { headers, signal }) =>
      fetch(url, { method: 'GET', redirect: 'manual', headers, signal, dispatcher }),
    close: () => dispatcher.close(),
  }
}
