/**
 * 模型出网的分流判定：默认直连、名单走代理、本机不走、以及「该不该让位」。
 *
 * 名单文件本身的读写与域名匹配在 whitelist.test.mjs 里，这里只管「走哪条路」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasDshProxyConfigured, routeFor } from '../lib/egress-routing.js'

test('空名单时一切直连', () => {
  assert.equal(routeFor('https://api.openai.com', new Set()), 'direct')
})

test('名单里的域名走代理', () => {
  assert.equal(routeFor('https://api.openai.com', new Set(['api.openai.com'])), 'proxy')
})

test('名单里写 openai.com 时子域名也算命中', () => {
  assert.equal(routeFor('https://api.openai.com', new Set(['openai.com'])), 'proxy')
})

test('后缀相近但不是子域名时不命中', () => {
  assert.equal(routeFor('https://notopenai.com', new Set(['openai.com'])), 'direct')
})

test('带路径与端口的地址同样按主机判定', () => {
  assert.equal(routeFor('https://api.openai.com:443/v1/models', new Set(['openai.com'])), 'proxy')
})

test('本机地址永远直连，即使写进了名单', () => {
  const whitelist = new Set(['127.0.0.1', 'localhost'])
  assert.equal(routeFor('http://127.0.0.1:7897', whitelist), 'direct')
  assert.equal(routeFor('http://localhost:8080/v1', whitelist), 'direct')
})

test('非 http/https 协议直连', () => {
  assert.equal(routeFor('ftp://api.openai.com', new Set(['api.openai.com'])), 'direct')
})

test('无法解析的地址按直连处理', () => {
  assert.equal(routeFor('这不是地址', new Set(['api.openai.com'])), 'direct')
})

test('DSH 自己配了代理环境变量时让位', () => {
  assert.equal(hasDshProxyConfigured({}), false)
  assert.equal(hasDshProxyConfigured({ https_proxy: 'http://127.0.0.1:7897' }), true)
  assert.equal(hasDshProxyConfigured({ HTTPS_PROXY: 'http://127.0.0.1:7897' }), true)
  assert.equal(hasDshProxyConfigured({ all_proxy: 'http://127.0.0.1:7897' }), true)
})

test('代理变量为空串或空白时不算配置过', () => {
  assert.equal(hasDshProxyConfigured({ https_proxy: '' }), false)
  assert.equal(hasDshProxyConfigured({ https_proxy: '   ' }), false)
})
