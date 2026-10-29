/**
 * 「分诊台」的契约（模型出网那一半）。
 *
 * 关键要求：**每次请求都重新判定**，不能按 origin 缓存——
 * 名单改完要立刻生效，包括之前失败过的域名（undici 按 origin 缓存连接，
 * 只换名单不换判定时机是救不了它的）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installSelectiveDispatcher } from '../lib/egress-dispatcher.js'

const PROXY_URL = 'http://127.0.0.1:7897'

function fakeUndici() {
  const calls = []
  const slot = { current: { name: '原出口' } }

  class Dispatcher {
    dispatch() {
      throw new Error('基类的 dispatch 不该被直接调用')
    }
  }

  class Agent {
    constructor(options) {
      this.options = options
      this.closed = 0
      this.destroyed = 0
      calls.push({ kind: 'agent', inst: this })
    }

    dispatch(options) {
      calls.push({ kind: 'direct', origin: options.origin })
      return true
    }

    close() {
      this.closed += 1
      return Promise.resolve()
    }

    destroy() {
      this.destroyed += 1
      return Promise.resolve()
    }
  }

  class ProxyAgent {
    constructor(input) {
      this.input = input
      this.closed = 0
      this.destroyed = 0
      calls.push({ kind: 'proxy-agent', inst: this })
    }

    dispatch(options) {
      calls.push({ kind: 'proxy', origin: options.origin })
      return true
    }

    close() {
      this.closed += 1
      return Promise.resolve()
    }

    destroy() {
      this.destroyed += 1
      return Promise.resolve()
    }
  }

  return {
    calls,
    slot,
    undici: {
      Dispatcher,
      Agent,
      ProxyAgent,
      getGlobalDispatcher: () => slot.current,
      setGlobalDispatcher: (d) => {
        slot.current = d
      },
    },
  }
}

/** 可切换的判定替身：`allowed` 里有的才走代理。 */
function routesFor(allowed) {
  const state = { allowed: new Set(allowed), seen: [] }
  return {
    state,
    routes: {
      shouldProxy: (url) => {
        state.seen.push(url)
        const host = new URL(url).hostname
        for (const entry of state.allowed) {
          if (host === entry || host.endsWith(`.${entry}`)) return true
        }
        return false
      },
    },
  }
}

test('装上后全局出口变成分诊台', async () => {
  const { slot, undici } = fakeUndici()
  const { routes } = routesFor([])
  const before = slot.current
  const { dispose } = installSelectiveDispatcher({ undici, routes, proxyUrl: PROXY_URL })
  assert.notEqual(slot.current, before)
  await dispose()
})

test('名单命中走代理、不命中走直连', () => {
  const { calls, undici } = fakeUndici()
  const { routes } = routesFor(['api.openai.com'])
  const { agent } = installSelectiveDispatcher({ undici, routes, proxyUrl: PROXY_URL })

  agent.dispatch({ origin: 'https://api.openai.com', path: '/v1/models' }, {})
  agent.dispatch({ origin: 'https://api.deepseek.com', path: '/v1/models' }, {})

  assert.deepEqual(
    calls.filter((c) => c.kind === 'proxy' || c.kind === 'direct').map((c) => c.kind),
    ['proxy', 'direct'],
  )
})

test('判定用的是完整地址（origin + path）', () => {
  const { undici } = fakeUndici()
  const { state, routes } = routesFor([])
  const { agent } = installSelectiveDispatcher({ undici, routes, proxyUrl: PROXY_URL })

  agent.dispatch({ origin: 'https://api.anthropic.com', path: '/v1/messages' }, {})

  assert.deepEqual(state.seen, ['https://api.anthropic.com/v1/messages'])
})

test('同一 origin 在名单改变后立刻改走另一条（不按 origin 缓存判定）', () => {
  const { calls, undici } = fakeUndici()
  const { state, routes } = routesFor([])
  const { agent } = installSelectiveDispatcher({ undici, routes, proxyUrl: PROXY_URL })

  agent.dispatch({ origin: 'https://api.anthropic.com', path: '/v1/messages' }, {})
  state.allowed = new Set(['anthropic.com'])
  agent.dispatch({ origin: 'https://api.anthropic.com', path: '/v1/messages' }, {})

  assert.deepEqual(
    calls.filter((c) => c.kind === 'proxy' || c.kind === 'direct').map((c) => c.kind),
    ['direct', 'proxy'],
  )
})

test('dispatch 的返回值原样传回', () => {
  const { undici } = fakeUndici()
  const { routes } = routesFor([])
  const { agent } = installSelectiveDispatcher({ undici, routes, proxyUrl: PROXY_URL })

  assert.equal(agent.dispatch({ origin: 'https://api.deepseek.com', path: '/' }, {}), true)
})

test('关闭分诊台会同时关掉内部两条通道', async () => {
  const { calls, undici } = fakeUndici()
  const { routes } = routesFor([])
  const { agent, dispose } = installSelectiveDispatcher({ undici, routes, proxyUrl: PROXY_URL })

  await agent.close()

  const channels = calls.filter((c) => c.kind === 'agent' || c.kind === 'proxy-agent').map((c) => c.inst)
  assert.deepEqual(
    channels.map((inst) => inst.closed),
    channels.map(() => 1),
  )
  await dispose()
})

test('卸载后全局出口还回原来那个', async () => {
  const { slot, undici } = fakeUndici()
  const { routes } = routesFor([])
  const before = slot.current
  const { dispose } = installSelectiveDispatcher({ undici, routes, proxyUrl: PROXY_URL })
  await dispose()
  assert.equal(slot.current, before)
})

test('其他组件后来接管出口时卸载不覆盖它',async()=>{
  const {slot,undici}=fakeUndici();const previous={dispatch:()=>true};slot.current=previous;const {routes}=routesFor([]);const {dispose}=installSelectiveDispatcher({undici,routes,proxyUrl:PROXY_URL});const later={dispatch:()=>true};slot.current=later;await dispose();assert.equal(slot.current,later);
});
test('其他组件保留旧出口引用时，卸载后它仍能转发到原出口',async()=>{
  const {slot,undici}=fakeUndici();let called=0;const previous={dispatch:()=>{called++;return true}};slot.current=previous;const {routes}=routesFor([]);const {agent,dispose}=installSelectiveDispatcher({undici,routes,proxyUrl:PROXY_URL});slot.current={dispatch:()=>true};await dispose();assert.equal(agent.dispatch({origin:'https://example.invalid',path:'/'},{}),true);assert.equal(called,1);
});

test('重复卸载不会重复关闭出口',async()=>{
  const {calls,undici}=fakeUndici();const {routes}=routesFor([]);const {dispose}=installSelectiveDispatcher({undici,routes,proxyUrl:PROXY_URL});await Promise.all([dispose(),dispose()]);const channels=calls.filter(c=>c.kind==='agent'||c.kind==='proxy-agent').map(c=>c.inst);assert.deepEqual(channels.map(c=>c.closed),[1,1]);
});
