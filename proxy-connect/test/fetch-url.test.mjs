import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFetcher } from '../lib/fetch-url.js'

const LIMITS = {
  maxResponseBytes: 5_000_000,
  maxBodyChars: 100_000,
  maxRedirects: 5,
  userAgent: 'test-agent',
}

/** 用假的 transport 顶替 undici：只回答预设 URL，并记录访问顺序。 */
function stubRequest(handlers) {
  const urls = []
  return {
    urls,
    request: async (url) => {
      urls.push(url)
      const handler = handlers[url]
      if (handler === undefined) throw new Error(`stub 未定义 ${url}`)
      return handler()
    },
  }
}

function response(body, { status = 200, contentType = 'text/html; charset=utf-8' } = {}) {
  return new Response(body, { status, headers: { 'content-type': contentType } })
}

function redirect(location, status = 302) {
  return new Response(null, { status, headers: { location, 'content-type': 'text/html' } })
}

test('HTML 响应标记为 html', async () => {
  const stub = stubRequest({ 'https://a.test/': () => response('<p>hi</p>') })
  const fetchUrl = createFetcher({ request: stub.request, ...LIMITS })

  const result = await fetchUrl('https://a.test/', undefined)

  assert.equal(result.body.kind, 'html')
  assert.equal(result.body.content, '<p>hi</p>')
  assert.equal(result.statusCode, 200)
  assert.equal(result.truncated, false)
})

test('纯文本响应标记为 text', async () => {
  const stub = stubRequest({ 'https://a.test/': () => response('plain', { contentType: 'text/plain' }) })
  const fetchUrl = createFetcher({ request: stub.request, ...LIMITS })

  const result = await fetchUrl('https://a.test/', undefined)

  assert.equal(result.body.kind, 'text')
  assert.equal(result.body.content, 'plain')
})

test('不支持的内容类型抛出 WEB_UNSUPPORTED_CONTENT_TYPE', async () => {
  const stub = stubRequest({ 'https://a.test/': () => response('x', { contentType: 'image/png' }) })
  const fetchUrl = createFetcher({ request: stub.request, ...LIMITS })

  await assert.rejects(
    () => fetchUrl('https://a.test/', undefined),
    (error) => error.code === 'WEB_UNSUPPORTED_CONTENT_TYPE',
  )
})

test('非 2xx 也返回结果而不是抛错', async () => {
  const stub = stubRequest({ 'https://a.test/': () => response('nope', { status: 404 }) })
  const fetchUrl = createFetcher({ request: stub.request, ...LIMITS })

  const result = await fetchUrl('https://a.test/', undefined)

  assert.equal(result.statusCode, 404)
})

test('同源重定向会被跟随', async () => {
  const stub = stubRequest({
    'https://a.test/': () => redirect('/next', 301),
    'https://a.test/next': () => response('<p>done</p>'),
  })
  const fetchUrl = createFetcher({ request: stub.request, ...LIMITS })

  const result = await fetchUrl('https://a.test/', undefined)

  assert.equal(result.url, 'https://a.test/next')
  assert.equal(result.body.content, '<p>done</p>')
})

test('跨源重定向被拒绝', async () => {
  const stub = stubRequest({ 'https://a.test/': () => redirect('https://b.test/') })
  const fetchUrl = createFetcher({ request: stub.request, ...LIMITS })

  await assert.rejects(
    () => fetchUrl('https://a.test/', undefined),
    (error) => error.code === 'WEB_REDIRECT_BLOCKED',
  )
})

test('超过最大重定向次数被拒绝', async () => {
  const stub = stubRequest({
    'https://a.test/': () => redirect('/loop'),
    'https://a.test/loop': () => redirect('/loop'),
  })
  const fetchUrl = createFetcher({ request: stub.request, ...LIMITS, maxRedirects: 1 })

  await assert.rejects(
    () => fetchUrl('https://a.test/', undefined),
    (error) => error.code === 'WEB_REDIRECT_BLOCKED',
  )
})

test('正文超过字符上限时截断并标记', async () => {
  const stub = stubRequest({ 'https://a.test/': () => response('x'.repeat(500), { contentType: 'text/plain' }) })
  const fetchUrl = createFetcher({ request: stub.request, ...LIMITS, maxBodyChars: 100 })

  const result = await fetchUrl('https://a.test/', undefined)

  assert.equal(result.body.content.length, 100)
  assert.equal(result.truncated, true)
})

test('正文超过字节上限时截断并标记', async () => {
  const stub = stubRequest({ 'https://a.test/': () => response('x'.repeat(500), { contentType: 'text/plain' }) })
  const fetchUrl = createFetcher({ request: stub.request, ...LIMITS, maxResponseBytes: 100 })

  const result = await fetchUrl('https://a.test/', undefined)

  assert.equal(result.body.content.length, 100)
  assert.equal(result.truncated, true)
})
