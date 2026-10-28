import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalSessionId, isSafeSessionId, sessionIdVariants } from '../lib/session-id.js'

test('裸 UUID 是合法 id（0.2.x 内核就是这样）', () => {
  assert.equal(isSafeSessionId('02164c8b-93a4-4d75-bf16-429db71894e5'), true)
})

test('带 session- 前缀的老 id 也合法', () => {
  assert.equal(isSafeSessionId('session-1c2e5647-cac6-489c-aa10-c835bf4497ad'), true)
})

test('带路径成分的 id 一律拒绝', () => {
  assert.equal(isSafeSessionId('../evil'), false)
  assert.equal(isSafeSessionId('a/b'), false)
  assert.equal(isSafeSessionId('..'), false)
  assert.equal(isSafeSessionId(''), false)
  assert.equal(isSafeSessionId('a b'), false)
})

test('去掉 session- 前缀后变成 .. / . / 空 的 id 也拒绝（路径穿越）', () => {
  assert.equal(isSafeSessionId('session-..'), false)
  assert.equal(isSafeSessionId('session-.'), false)
  assert.equal(isSafeSessionId('session-'), false)
})

test('派生出的磁盘名永远不能是 . / .. / 空，非法 id 一个变体都不给', () => {
  for (const id of ['session-..', 'session-.', 'session-', '..', '.', '../evil', '']) {
    assert.deepEqual(sessionIdVariants(id), [])
  }
  for (const name of sessionIdVariants('abc-123')) {
    assert.ok(name !== '' && name !== '.' && name !== '..', `派生出了危险名字：${name}`)
  }
})

test('两种命名都要去找：带前缀的补一个不带的，不带前缀的补一个带的', () => {
  assert.deepEqual(
    sessionIdVariants('session-abc-123'),
    ['session-abc-123', 'abc-123'],
  )
  assert.deepEqual(
    sessionIdVariants('abc-123'),
    ['abc-123', 'session-abc-123'],
  )
})
test('规范 id：两种写法归一到同一个锁键', () => {
  assert.equal(canonicalSessionId('session-abc'), 'abc')
  assert.equal(canonicalSessionId('abc'), 'abc')
  assert.equal(canonicalSessionId(''), '')
  assert.equal(canonicalSessionId(undefined), '')
})