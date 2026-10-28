import assert from 'node:assert/strict'
import test from 'node:test'

import { deleteDecision } from '../lib/decide.js'

test('正在跑的会话不能删', () => {
  assert.deepEqual(
    deleteDecision({ running: true, onDisk: true }),
    { deletable: false, reason: 'running' },
  )
})

test('磁盘上没有目录的是空白会话，不能删', () => {
  assert.deepEqual(
    deleteDecision({ running: false, onDisk: false }),
    { deletable: false, reason: 'blank' },
  )
})

test('正在跑优先于空白：先说跑着', () => {
  assert.deepEqual(
    deleteDecision({ running: true, onDisk: false }),
    { deletable: false, reason: 'running' },
  )
})

test('有目录又没在跑就能删', () => {
  assert.deepEqual(
    deleteDecision({ running: false, onDisk: true }),
    { deletable: true, reason: null },
  )
})
