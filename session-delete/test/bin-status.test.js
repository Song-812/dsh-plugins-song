// binStatus 判定表（删前只读探测的事实 → 回收站健康度）：纯函数，全用假数据测。
// 桥脚本只负责采集事实（binProbe），这张表是唯一的判定出处。
import assert from 'node:assert/strict'
import test from 'node:test'

import { decideBinStatus } from '../lib/bin-status.js'

test('NukeOnDelete=1 → suspect：这一卷被配置成跳过回收站、直通永久删除', () => {
  assert.equal(decideBinStatus({ nukeOnDelete: 1, recycleQueryOk: true, error: '' }), 'suspect')
})

test('SHQueryRecycleBin 失败 → suspect：回收站服务本身异常', () => {
  assert.equal(decideBinStatus({ nukeOnDelete: 0, recycleQueryOk: false, error: '' }), 'suspect')
  assert.equal(decideBinStatus({ nukeOnDelete: null, recycleQueryOk: false, error: '' }), 'suspect')
})

test('正常（没配置 NukeOnDelete 且回收站应答）→ ok', () => {
  assert.equal(decideBinStatus({ nukeOnDelete: 0, recycleQueryOk: true, error: '' }), 'ok')
  assert.equal(decideBinStatus({ nukeOnDelete: null, recycleQueryOk: true, error: '' }), 'ok')
})

test('探测段抛异常 → unknown：error 在场就承认自己不知道', () => {
  assert.equal(decideBinStatus({
    volumeRoot: 'C:\\', volumeGuid: '', nukeOnDelete: null, recycleQueryOk: false,
    error: 'Get-Volume exploded',
  }), 'unknown')
})

test('压根没有探测事实（桥没带回 binProbe）→ unknown', () => {
  assert.equal(decideBinStatus(undefined), 'unknown')
  assert.equal(decideBinStatus(null), 'unknown')
})

test('NukeOnDelete=1 是直接证据：即使探测段随后异常也报 suspect，不降级成 unknown', () => {
  assert.equal(decideBinStatus({ nukeOnDelete: 1, recycleQueryOk: false, error: 'later step died' }), 'suspect')
})

test('探测对象在、但没确认回收站应答 → suspect：宁可多提醒，不假装没事', () => {
  assert.equal(decideBinStatus({}), 'suspect')
})
