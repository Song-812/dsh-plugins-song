import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProvider } from '../lib/provider.js'
import { loadWhitelist, addHost } from '../lib/whitelist.js'

const REQUEST = { url: 'https://www.google.com/' }
const RESULT = {
  url: 'https://www.google.com/',
  statusCode: 200,
  body: { kind: 'text', content: 'ok' },
  truncated: false,
}

async function tempWhitelistPath(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-proxy-connect-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return join(dir, 'whitelist.json')
}

function codedError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

test('名单里的域名直接走代理，不试直连', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  await addHost(whitelistPath, 'www.google.com')
  const calls = []
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      calls.push('direct')
      return RESULT
    },
    fetchViaProxy: async () => {
      calls.push('proxy')
      return RESULT
    },
  })

  await provider.fetch(REQUEST, undefined)

  assert.deepEqual(calls, ['proxy'])
})

test('名单里写 openai.com 时 api.openai.com 也算命中（后缀匹配）', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  await addHost(whitelistPath, 'openai.com')
  const calls = []
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      calls.push('direct')
      return RESULT
    },
    fetchViaProxy: async () => {
      calls.push('proxy')
      return RESULT
    },
  })

  await provider.fetch({ url: 'https://api.openai.com/v1/models' }, undefined)

  assert.deepEqual(calls, ['proxy'])
})

test('后缀相近但不是子域名时不命中（notopenai.com）', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  await addHost(whitelistPath, 'openai.com')
  const calls = []
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      calls.push('direct')
      return RESULT
    },
    fetchViaProxy: async () => {
      calls.push('proxy')
      return RESULT
    },
  })

  await provider.fetch({ url: 'https://notopenai.com/v1/models' }, undefined)

  assert.deepEqual(calls, ['direct'])
})

test('名单外的域名先走直连', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  const calls = []
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      calls.push('direct')
      return RESULT
    },
    fetchViaProxy: async () => {
      calls.push('proxy')
      return RESULT
    },
  })

  await provider.fetch(REQUEST, undefined)

  assert.deepEqual(calls, ['direct'])
})

test('直连成功后不登记域名', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => RESULT,
    fetchViaProxy: async () => RESULT,
  })

  await provider.fetch(REQUEST, undefined)

  assert.equal((await loadWhitelist(whitelistPath)).size, 0)
})

test('直连失败后转代理；累计够次数（默认 3 次）才把域名登记下来', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  const calls = []
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      calls.push('direct')
      throw codedError('ECONNREFUSED')
    },
    fetchViaProxy: async () => {
      calls.push('proxy')
      return RESULT
    },
  })

  const result = await provider.fetch(REQUEST, undefined)
  assert.deepEqual(calls, ['direct', 'proxy'])
  assert.equal(result.statusCode, 200)
  // 第一次、第二次：网页照样拿到，但名单里还没有这个域名。
  assert.equal((await loadWhitelist(whitelistPath)).has('www.google.com'), false)
  await provider.fetch(REQUEST, undefined)
  assert.equal((await loadWhitelist(whitelistPath)).has('www.google.com'), false)
  // 第三次：确认直连不通，登记。
  await provider.fetch(REQUEST, undefined)
  assert.ok((await loadWhitelist(whitelistPath)).has('www.google.com'))

  // 登记后直接走代理，不再试直连。
  calls.length = 0
  await provider.fetch(REQUEST, undefined)
  assert.deepEqual(calls, ['proxy'])
})

test('一次直连抖动不会把域名永久写进名单', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  let direct = 0
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      direct += 1
      if (direct === 1) throw codedError('ECONNRESET')
      return RESULT
    },
    fetchViaProxy: async () => RESULT,
  })

  for (let i = 0; i < 5; i += 1) await provider.fetch(REQUEST, undefined)

  assert.equal((await loadWhitelist(whitelistPath)).size, 0)
})

test('直连成功会清掉之前攒的失败次数', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  const script = ['fail', 'fail', 'ok', 'fail', 'fail']
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      if (script.shift() === 'fail') throw codedError('ECONNREFUSED')
      return RESULT
    },
    fetchViaProxy: async () => RESULT,
  })

  for (let i = 0; i < 5; i += 1) await provider.fetch(REQUEST, undefined)

  // 5 次里失败 4 次，但被一次成功隔开，每段都不到 3 次。
  assert.equal((await loadWhitelist(whitelistPath)).size, 0)
})

test('超出时间窗的旧失败不计入', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  let clock = 0
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      throw codedError('ECONNREFUSED')
    },
    fetchViaProxy: async () => RESULT,
    registerWindowMs: 1000,
    now: () => clock,
  })

  await provider.fetch(REQUEST, undefined)
  clock = 600
  await provider.fetch(REQUEST, undefined)
  clock = 1500 // 第一次已经过期，窗口内只剩 2 次（600、1500）
  await provider.fetch(REQUEST, undefined)
  assert.equal((await loadWhitelist(whitelistPath)).size, 0)

  clock = 1550 // 600、1500、1550 三次都在窗口内
  await provider.fetch(REQUEST, undefined)
  assert.ok((await loadWhitelist(whitelistPath)).has('www.google.com'))
})

test('不属于「连不上」的错误既不转代理也不计数', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  let proxyCalls = 0
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      throw codedError('ERR_INVALID_URL')
    },
    fetchViaProxy: async () => {
      proxyCalls += 1
      return RESULT
    },
    registerAfterFailures: 1,
  })

  await assert.rejects(() => provider.fetch(REQUEST, undefined))
  assert.equal(proxyCalls, 0)
  assert.equal((await loadWhitelist(whitelistPath)).size, 0)
})

test('已有名单条目不受影响：新域名累计够次数才追加，原有条目原样保留', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  await addHost(whitelistPath, 'openai.com')
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      throw codedError('ECONNREFUSED')
    },
    fetchViaProxy: async () => RESULT,
    registerAfterFailures: 2,
  })

  await provider.fetch(REQUEST, undefined)
  assert.deepEqual([...(await loadWhitelist(whitelistPath))], ['openai.com'])
  await provider.fetch(REQUEST, undefined)
  assert.deepEqual([...(await loadWhitelist(whitelistPath))].sort(), ['openai.com', 'www.google.com'])
})

test('代理地址可配置：报错里写的是实际配置的地址，而不是写死的 7897', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  const proxyFailure = codedError('ECONNREFUSED')
  const provider = createProvider({
    whitelistPath,
    proxyUrl: 'http://127.0.0.1:7890',
    fetchDirect: async () => {
      throw codedError('ECONNREFUSED')
    },
    fetchViaProxy: async () => {
      throw proxyFailure
    },
  })

  await assert.rejects(
    () => provider.fetch(REQUEST, undefined),
    (error) => {
      assert.match(error.message, /127\.0\.0\.1:7890/)
      assert.doesNotMatch(error.message, /7897/)
      return true
    },
  )
})

test('代理也连不上时，报错要点明 Clash 没开、并保留原始原因', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  const proxyFailure = codedError('ECONNREFUSED')
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      throw codedError('ECONNREFUSED')
    },
    fetchViaProxy: async () => {
      throw proxyFailure
    },
  })

  await assert.rejects(
    () => provider.fetch(REQUEST, undefined),
    (error) => {
      assert.match(error.message, /Clash/)
      assert.match(error.message, /127\.0\.0\.1:7897/)
      assert.equal(error.cause, proxyFailure)
      return true
    },
  )
  assert.equal((await loadWhitelist(whitelistPath)).size, 0)
})

test('代理失败的其它原因不硬说成 Clash 没开', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  const proxyFailure = codedError('UND_ERR_HEADERS_TIMEOUT')
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      throw codedError('ECONNREFUSED')
    },
    fetchViaProxy: async () => {
      throw proxyFailure
    },
  })

  await assert.rejects(
    () => provider.fetch(REQUEST, undefined),
    (error) => {
      assert.doesNotMatch(error.message, /Clash/)
      assert.equal(error.cause, proxyFailure)
      return true
    },
  )
})

test('不该回退的错误直接抛出，不试代理也不登记', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  const calls = []
  const policyFailure = codedError('WEB_FETCH_TOO_LARGE')
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      calls.push('direct')
      throw policyFailure
    },
    fetchViaProxy: async () => {
      calls.push('proxy')
      return RESULT
    },
  })

  await assert.rejects(
    () => provider.fetch(REQUEST, undefined),
    (error) => error === policyFailure,
  )
  assert.deepEqual(calls, ['direct'])
  assert.equal((await loadWhitelist(whitelistPath)).size, 0)
})

test('名单文件中途写坏时，名单内域名沿用上一份好名单仍走代理', async (t) => {
  const whitelistPath = await tempWhitelistPath(t)
  await addHost(whitelistPath, 'www.google.com')
  const calls = []
  const provider = createProvider({
    whitelistPath,
    fetchDirect: async () => {
      calls.push('direct')
      return RESULT
    },
    fetchViaProxy: async () => {
      calls.push('proxy')
      return RESULT
    },
  })

  await provider.fetch(REQUEST, undefined)
  await writeFile(whitelistPath, '{ 写坏了', 'utf8')
  await provider.fetch(REQUEST, undefined)

  assert.deepEqual(calls, ['proxy', 'proxy'], '名单写坏后不该掉回直连')
})

test('命中代理时取消应保持取消状态，不伪装成代理故障', async t => {
  const whitelistPath=await tempWhitelistPath(t);await addHost(whitelistPath,'example.invalid');const error=new Error('cancelled');error.name='AbortError';const provider=createProvider({whitelistPath,fetchDirect:async()=>{throw Error('unexpected')},fetchViaProxy:async()=>{throw error}});await assert.rejects(()=>provider.fetch({url:'https://example.invalid/'},undefined),e=>e===error&&e.name==='AbortError');
});
test('直连失败后转代理，再取消仍应保持取消状态', async t => {
  const whitelistPath=await tempWhitelistPath(t);await addHost(whitelistPath,'other.invalid');const error=new Error('cancelled');error.name='AbortError';const provider=createProvider({whitelistPath,fetchDirect:async()=>{throw codedError('ECONNRESET')},fetchViaProxy:async()=>{throw error}});await assert.rejects(()=>provider.fetch({url:'https://example.invalid/'},undefined),e=>e===error&&e.name==='AbortError');
});

test('被包装的取消错误仍被识别为取消',async t=>{
  const whitelistPath=await tempWhitelistPath(t);await addHost(whitelistPath,'example.invalid');const inner=new Error('cancelled');inner.name='AbortError';const wrapped=new Error('request stopped',{cause:inner});const provider=createProvider({whitelistPath,fetchDirect:async()=>{throw Error('unexpected')},fetchViaProxy:async()=>{throw wrapped}});await assert.rejects(()=>provider.fetch({url:'https://example.invalid/'},undefined),e=>e===wrapped);
});
