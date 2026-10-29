/**
 * 集成测试：用真的 undici 和真的本地 HTTP 服务器，验证 transport 层和整条决策链。
 *
 * 这一层补上 undici-transport.js 的缺口——它的单元测试做不了（要真 undici），
 * 但它是否真的能连、真的以连接类错误码上报、真的能触发登记，这里都验。
 *
 * 注意：不能用 127.0.0.1:1 这类端口来模拟「连不上」，fetch 标准有一份不安全端口
 * 黑名单，会在网络层之前就报 bad port。这里改成动态取一个高位端口、拿到后立刻关闭。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDirectTransport, createProxyTransport } from '../lib/undici-transport.js'
import { createFetcher } from '../lib/fetch-url.js'
import { createProvider } from '../lib/provider.js'
import { loadWhitelist } from '../lib/whitelist.js'
import { FETCH_LIMITS } from '../lib/config.js'

const undici = await import('undici')

/** 取一个系统分配过的合法端口，然后立刻关掉，用来代表「这个地址没人监听」。 */
async function closedAddressUrl() {
  const probe = createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address()
  await new Promise((resolve) => probe.close(resolve))
  return `http://127.0.0.1:${port}/`
}

async function startLocalSite(t) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<p>本地站点</p>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}/`
}

function directTransport(t) {
  const transport = createDirectTransport({
    fetch: undici.fetch,
    Agent: undici.Agent,
    connectTimeoutMs: 2000,
  })
  t.after(() => transport.close())
  return transport
}

function proxyTransportOver(t, proxyUrl) {
  const transport = createProxyTransport({
    fetch: undici.fetch,
    ProxyAgent: undici.ProxyAgent,
    proxyUrl,
  })
  t.after(() => transport.close())
  return transport
}

function fetcherOver(transport) {
  const fetchUrl = createFetcher({ request: transport.request, ...FETCH_LIMITS })
  return (request, signal) => fetchUrl(request.url, signal)
}

function proxyResultFor(url) {
  return {
    url,
    statusCode: 200,
    body: { kind: 'text', content: '来自代理' },
    truncated: false,
  }
}

async function whitelistIn(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-proxy-connect-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return join(directory, 'whitelist.json')
}

test('直连 transport 能真的抓到本地站点', async (t) => {
  const siteUrl = await startLocalSite(t)
  const fetchUrl = createFetcher({ request: directTransport(t).request, ...FETCH_LIMITS })

  const result = await fetchUrl(siteUrl, undefined)

  assert.equal(result.statusCode, 200)
  assert.equal(result.body.kind, 'html')
  assert.equal(result.body.content, '<p>本地站点</p>')
})

test('连不上的地址以 ECONNREFUSED 上报，好让上层转代理', async (t) => {
  const url = await closedAddressUrl()
  const fetchUrl = createFetcher({ request: directTransport(t).request, ...FETCH_LIMITS })

  await assert.rejects(
    () => fetchUrl(url, undefined),
    (error) => {
      assert.equal(error.code ?? error.cause?.code, 'ECONNREFUSED')
      return true
    },
  )
})

test('整合链：直连不通 → 转代理 → 域名被登记进名单', async (t) => {
  const url = await closedAddressUrl()
  const whitelistPath = await whitelistIn(t)

  const proxyCalls = []
  const provider = createProvider({
    whitelistPath,
    fetchDirect: fetcherOver(directTransport(t)),
    fetchViaProxy: async (request) => {
      proxyCalls.push(request.url)
      return proxyResultFor(request.url)
    },
    registerAfterFailures: 1,
  })

  const result = await provider.fetch({ url }, undefined)

  assert.equal(result.body.content, '来自代理')
  assert.deepEqual(proxyCalls, [url])
  assert.ok((await loadWhitelist(whitelistPath)).has('127.0.0.1'))
})

test('整合链：登记之后同一域名直接走代理，不再试直连', async (t) => {
  const url = await closedAddressUrl()
  const whitelistPath = await whitelistIn(t)

  let directCalls = 0
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      directCalls += 1
      throw Object.assign(new Error('不应被调用'), { code: 'ECONNREFUSED' })
    },
    fetchViaProxy: async (request) => proxyResultFor(request.url),
    registerAfterFailures: 1,
  })

  await provider.fetch({ url }, undefined)
  await provider.fetch({ url }, undefined)

  assert.equal(directCalls, 1)
  assert.equal((await loadWhitelist(whitelistPath)).size, 1)
})

test('代理端口没人听（等价于 Clash 没开）时，报错点明 Clash', async (t) => {
  const url = await closedAddressUrl()
  const deadProxyUrl = await closedAddressUrl()
  const whitelistPath = await whitelistIn(t)

  const provider = createProvider({
    whitelistPath,
    fetchDirect: fetcherOver(directTransport(t)),
    fetchViaProxy: fetcherOver(proxyTransportOver(t, deadProxyUrl)),
  })

  await assert.rejects(
    () => provider.fetch({ url }, undefined),
    (error) => {
      assert.match(error.message, /Clash/)
      assert.match(error.message, /127\.0\.0\.1/)
      return true
    },
  )
  assert.equal((await loadWhitelist(whitelistPath)).size, 0)
})
