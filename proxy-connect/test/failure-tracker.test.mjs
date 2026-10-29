import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFailureTracker } from '../lib/failure-tracker.js'

test('够门槛才返回 true，并且清零重新计数', () => {
  const tracker = createFailureTracker({ threshold: 3, windowMs: 1000, now: () => 0 })
  assert.equal(tracker.record('a.com'), false)
  assert.equal(tracker.record('a.com'), false)
  assert.equal(tracker.record('a.com'), true)
  assert.equal(tracker.count('a.com'), 0)
  assert.equal(tracker.record('a.com'), false)
})

test('不同域名各算各的', () => {
  const tracker = createFailureTracker({ threshold: 2, windowMs: 1000, now: () => 0 })
  tracker.record('a.com')
  assert.equal(tracker.record('b.com'), false)
  assert.equal(tracker.record('a.com'), true)
})

test('窗口外的失败作废；clear 清掉全部', () => {
  let clock = 0
  const tracker = createFailureTracker({ threshold: 2, windowMs: 100, now: () => clock })
  tracker.record('a.com')
  clock = 500
  assert.equal(tracker.count('a.com'), 0)
  assert.equal(tracker.record('a.com'), false)
  tracker.clear('a.com')
  assert.equal(tracker.count('a.com'), 0)
})

test('记录的域名数有上限，不会无限增长', () => {
  const tracker = createFailureTracker({ threshold: 99, windowMs: 1e9, now: () => 0 })
  for (let i = 0; i < 2000; i += 1) tracker.record(`h${i}.com`)
  assert.equal(tracker.count('h0.com'), 0) // 最旧的被丢弃
  assert.equal(tracker.count('h1999.com'), 1)
})
