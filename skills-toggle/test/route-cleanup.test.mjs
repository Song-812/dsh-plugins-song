// 路由注册的清理必须交回框架：ctx.inject 回调里 connection.fetch.register(...)
// 若返回清理函数，要原样 return —— 插件被卸载/重载时路由才能真正注销，
// 不然旧 fetch 处理器会一直挂着。
// 运行：node --test test\route-cleanup.test.mjs
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply, __test__ } from '../lib/index.js'

test('fetch.register 返回的清理函数会被交回给框架', async (t) => {
  // apply() 会把加载面包屑写进 $DSH_HOME —— 指到临时目录，绝不碰真实 home。
  const home = await mkdtemp(join(tmpdir(), 'skills-route-cleanup-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  })

  let disposed = 0
  const routes = []
  let callbackReturn
  const ctx = {
    inject: (deps, callback) => {
      assert.deepEqual(deps, ['connection'])
      callbackReturn = callback({
        connection: {
          fetch: {
            register: (route) => {
              routes.push(route)
              return () => { disposed += 1 }
            },
          },
        },
      })
    },
  }

  apply(ctx)
  // 等 noteLoad 的加载面包屑写完（queueWrite 按 home 串行），再做断言与清理。
  await __test__.queueWrite(home, async () => {})

  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, '/api/skills-toggle')
  assert.deepEqual([...routes[0].methods].sort(), ['GET', 'POST'])
  // 防御式契约：register 的返回值若是函数（清理器），inject 回调必须把它交回。
  assert.equal(typeof callbackReturn, 'function', 'inject 回调没有把 register 的清理函数交回')
  callbackReturn()
  assert.equal(disposed, 1, '交回的清理函数被调用后没有注销路由')
})

test('register 没有返回清理函数时也不报错', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'skills-route-cleanup2-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  })

  let callbackReturn = 'unset'
  const ctx = {
    inject: (deps, callback) => {
      callbackReturn = callback({
        connection: { fetch: { register: () => undefined } },
      })
    },
  }

  apply(ctx)
  await __test__.queueWrite(home, async () => {})

  assert.equal(callbackReturn, undefined)
})
