import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldFallback, isProxyUnreachable } from '../lib/fallback.js'

function codedError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

test('连接被拒要回退', () => {
  assert.equal(shouldFallback(codedError('ECONNREFUSED')), true)
})

test('连接超时要回退', () => {
  assert.equal(shouldFallback(codedError('UND_ERR_CONNECT_TIMEOUT')), true)
})

test('DNS 解析失败要回退', () => {
  assert.equal(shouldFallback(codedError('ENOTFOUND')), true)
})

test('错误码挂在 cause 上同样要回退', () => {
  const outer = new Error('fetch failed')
  outer.cause = codedError('ECONNRESET')
  assert.equal(shouldFallback(outer), true)
})

test('用户取消不回退', () => {
  const aborted = new Error('aborted')
  aborted.name = 'AbortError'
  assert.equal(shouldFallback(aborted), false)
})

test('策略类拒绝不回退', () => {
  assert.equal(shouldFallback(codedError('WEB_FETCH_TOO_LARGE')), false)
})

test('没有错误码的未知错误不回退', () => {
  assert.equal(shouldFallback(new Error('boom')), false)
})

test('空值不回退', () => {
  assert.equal(shouldFallback(undefined), false)
})

test('连接被拒说明代理端口没人听', () => {
  assert.equal(isProxyUnreachable(codedError('ECONNREFUSED')), true)
})

test('代理主机名解析不了也算代理没起来', () => {
  assert.equal(isProxyUnreachable(codedError('ENOTFOUND')), true)
})

test('目标站不回响应不算代理没起来——端口是通的', () => {
  assert.equal(isProxyUnreachable(codedError('UND_ERR_HEADERS_TIMEOUT')), false)
})

test('连接被重置不算代理没起来——端口听过一次', () => {
  assert.equal(isProxyUnreachable(codedError('ECONNRESET')), false)
})

test('空值不算代理没起来', () => {
  assert.equal(isProxyUnreachable(undefined), false)
})
