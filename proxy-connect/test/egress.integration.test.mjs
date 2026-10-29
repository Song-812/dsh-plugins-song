/**
 * 集成测试：真的 undici、真的网络，验「默认直连 + 名单走代理」这条链路。
 *
 * 这里回答的是用户最关心的那个问题：Clash 关掉（代理端口没人听）时，
 * 不在名单里的国内端点是不是照样能通；名单里的国外端点是不是快速失败而不是傻等。
 * 网络本身不通（离线）时跳过，而不是把环境问题报成插件问题。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import * as undici from 'undici'
import { installSelectiveDispatcher } from '../lib/egress-dispatcher.js'
import { routeFor } from '../lib/egress-routing.js'

/** 用户的 Clash 混合端口。 */
const CLASH_URL = 'http://127.0.0.1:7897'

/** 名单里的拟真目标（OpenAI 模型列表；不带 key 时稳定返回 401）。 */
const WHITELISTED_URL = 'https://api.openai.com/v1/models'

/** 不在名单里的国内端点（同样不带 key，稳定返回 401）。 */
const DOMESTIC_URL = 'https://api.deepseek.com/v1/models'

/** 国内端点直连要多久才算「还通着」：超过这个数就是被代理拖走了。 */
const DIRECT_DEADLINE_MS = 5000

function installed(t, { whitelist, proxyUrl }) {
  const routes = { shouldProxy: (url) => routeFor(url, whitelist) === 'proxy' }
  const handle = installSelectiveDispatcher({ undici, routes, proxyUrl })
  t.after(() => handle.dispose())
  return handle
}

/** 取一个系统分配过、随后即关闭的端口，代表「这个地址没人监听」。 */
async function closedProxyUrl() {
  const probe = createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address()
  await new Promise((resolve) => probe.close(resolve))
  return `http://127.0.0.1:${port}`
}

function listening(url) {
  const { hostname, port } = new URL(url)
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port: Number(port) })
    socket.setTimeout(1000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}

async function reachableDirectly(url) {
  try {
    await undici.fetch(url, { signal: AbortSignal.timeout(DIRECT_DEADLINE_MS) })
    return true
  } catch {
    return false
  }
}

test('Clash 没开（代理端口没人听）时，不在名单里的国内端点照样直连', async (t) => {
  if (!(await reachableDirectly(DOMESTIC_URL))) {
    t.skip('当前网络到不了国内端点，跳过')
    return
  }
  installed(t, { whitelist: new Set(['api.openai.com']), proxyUrl: await closedProxyUrl() })

  const started = Date.now()
  const response = await undici.fetch(DOMESTIC_URL, { signal: AbortSignal.timeout(DIRECT_DEADLINE_MS) })
  const elapsed = Date.now() - started

  assert.equal(response.status, 401)
  assert.ok(elapsed < DIRECT_DEADLINE_MS, `直连被拖慢了：${elapsed}ms`)
})

test('Clash 没开时，名单里的国外端点快速失败，而不是傻等超时', async (t) => {
  installed(t, { whitelist: new Set(['api.openai.com']), proxyUrl: await closedProxyUrl() })

  const started = Date.now()
  await assert.rejects(() => undici.fetch(WHITELISTED_URL, { signal: AbortSignal.timeout(20000) }))
  assert.ok(Date.now() - started < DIRECT_DEADLINE_MS, '失败得太慢，说明没走代理端口')
})

test('Clash 开着时，名单里的国外端点经代理拿到响应', async (t) => {
  if (!(await listening(CLASH_URL))) {
    t.skip('Clash 未运行，跳过')
    return
  }
  installed(t, { whitelist: new Set(['api.openai.com']), proxyUrl: CLASH_URL })

  const response = await undici.fetch(WHITELISTED_URL, { signal: AbortSignal.timeout(15000) })

  assert.equal(response.status, 401)
})
