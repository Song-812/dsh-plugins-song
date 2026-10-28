import assert from 'node:assert/strict'
import test from 'node:test'

import { formatTokenCount } from '../lib/format.js'

test('小于一千原样显示', () => {
  assert.equal(formatTokenCount(0), '0')
  assert.equal(formatTokenCount(999), '999')
})

test('千位向上取一位小数，去掉多余的 .0', () => {
  assert.equal(formatTokenCount(1000), '1K')
  assert.equal(formatTokenCount(1500), '1.5K')
  assert.equal(formatTokenCount(12_345), '12.3K')
  assert.equal(formatTokenCount(834_000), '834K')
})

test('百万位向上取一位小数', () => {
  assert.equal(formatTokenCount(1_200_000), '1.2M')
  assert.equal(formatTokenCount(2_000_000), '2M')
})

test('读不到的数字按 0 显示', () => {
  assert.equal(formatTokenCount(null), '0')
  assert.equal(formatTokenCount(Number.NaN), '0')
  assert.equal(formatTokenCount(-5), '0')
})
