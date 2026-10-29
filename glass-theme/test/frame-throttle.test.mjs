import test from 'node:test'
import assert from 'node:assert/strict'

const mod = await import('../src/client/theme/frame-throttle.ts')

/** 手动驱动的假 rAF：回调攒进 pending，runFrame() 模拟「到下一帧」。 */
function fakeRaf() {
  const pending = new Map()
  let next = 1
  return {
    scheduler: {
      request(callback) {
        const id = next++
        pending.set(id, callback)
        return id
      },
      cancel(handle) {
        pending.delete(handle)
      },
    },
    get pendingCount() {
      return pending.size
    },
    runFrame() {
      const batch = [...pending.values()]
      pending.clear()
      for (const callback of batch) callback()
    },
  }
}

test('同一帧多次触发只 flush 一次', () => {
  const raf = fakeRaf()
  let flushes = 0
  const throttle = mod.createFrameThrottle(() => { flushes++ }, raf.scheduler)

  throttle.schedule()
  throttle.schedule()
  throttle.schedule()

  assert.equal(raf.pendingCount, 1)
  assert.equal(flushes, 0)

  raf.runFrame()
  assert.equal(flushes, 1)
})

test('flush 之后再触发会开新的一帧', () => {
  const raf = fakeRaf()
  let flushes = 0
  const throttle = mod.createFrameThrottle(() => { flushes++ }, raf.scheduler)

  throttle.schedule()
  raf.runFrame()
  assert.equal(flushes, 1)

  throttle.schedule()
  throttle.schedule()
  assert.equal(raf.pendingCount, 1)

  raf.runFrame()
  assert.equal(flushes, 2)
})

test('dispose 取消未执行的 flush，之后 schedule 不再排队', () => {
  const raf = fakeRaf()
  let flushes = 0
  const throttle = mod.createFrameThrottle(() => { flushes++ }, raf.scheduler)

  throttle.schedule()
  raf.runFrame()
  assert.equal(flushes, 1)

  throttle.schedule()
  throttle.dispose()
  assert.equal(raf.pendingCount, 0)

  raf.runFrame()
  assert.equal(flushes, 1)

  throttle.schedule()
  assert.equal(raf.pendingCount, 0)
})

test('flush 抛错不影响下一次 schedule', () => {
  const raf = fakeRaf()
  let flushes = 0
  const throttle = mod.createFrameThrottle(() => {
    flushes++
    throw new Error('boom')
  }, raf.scheduler)

  throttle.schedule()
  assert.throws(() => raf.runFrame(), /boom/)

  const raf2 = fakeRaf()
  const calm = mod.createFrameThrottle(() => { flushes++ }, raf2.scheduler)
  calm.schedule()
  raf2.runFrame()
  assert.equal(flushes, 2)
})
