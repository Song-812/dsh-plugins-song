// deleteSession 的两道运行状态检查之间隔着一次磁盘扫描（TOCTOU 窗口）；
// 回收站桥回传的 permanent 也必须如实透传，并驱动 /check 的「将永久删除」提示。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const scratch = join(process.env.TEMP ?? 'C:\\', `dsh-session-delete-delete-test-${process.pid}`)
await mkdir(scratch, { recursive: true })
process.env.DSH_HOME = join(scratch, 'home-0')

const { __test__ } = await import('../lib/index.js')
const { deleteSession, inspectSession } = __test__

let homeSeq = 1
/** 每个用例换一个全新的 DSH_HOME，互不沾染。 */
async function freshHome() {
  const home = join(scratch, `home-${homeSeq++}`)
  process.env.DSH_HOME = home
  await mkdir(join(home, 'sessions', 'default'), { recursive: true })
  return home
}

/** 在 home 里种一个会话目录（带一个文件，保证它「有内容、可删」）。 */
async function seedSession(home, id) {
  const dir = join(home, 'sessions', 'default', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'chat.md'), 'hi', 'utf8')
  return dir
}

/**
 * 造一个 agents 状态按调用次序变化的假 ctx：
 * 第 1 次取 idle，之后取 running —— 模拟「判定通过之后、送回收站之前会话被启动」。
 */
function ctxWithAgents(statuses) {
  let call = 0
  return {
    get(name) {
      if (name !== 'agents') return undefined
      return {
        get() {
          const status = statuses[Math.min(call, statuses.length - 1)]
          call += 1
          return { status }
        },
      }
    },
    logger: { info() {}, warn() {} },
    emit() {},
  }
}

test.after(async () => {
  await rm(scratch, { recursive: true, force: true })
})

test('TOCTOU：两次运行状态检查之间会话被启动，必须拒绝且不碰回收站桥', async () => {
  const home = await freshHome()
  const id = '02164c8b-93a4-4d75-bf16-429db71894e5'
  const dir = await seedSession(home, id)
  const ctx = ctxWithAgents(['idle', 'running'])
  let bridgeCalls = 0
  const bridge = async (action, paths) => {
    bridgeCalls += 1
    return { ok: true, deleted: paths, failed: [] }
  }

  await assert.rejects(
    () => deleteSession(ctx, id, { bridge }),
    (error) => error.code === 'session-running',
  )
  assert.equal(bridgeCalls, 0, '复查发现会话在跑，就不该再碰回收站桥')
  assert.equal(existsSync(dir), true, '正在跑的会话目录必须原封不动')
})

for (const mode of ['throws', 'missing', 'no-get', 'bad-status', 'second-check-fails']) {
  test(`运行状态不可确认时拒绝删除且不调用回收站桥：${mode}`, async () => {
    const home = await freshHome()
    const id = '02164c8b-93a4-4d75-bf16-429db71894e5'
    const dir = await seedSession(home, id)
    const ctx = ctxWithAgents(['idle'])
    let checks = 0
    ctx.get = () => {
      checks += 1
      if (mode === 'second-check-fails' && checks === 1) return { get: () => ({ status: 'idle' }) }
      if (mode === 'missing') return undefined
      if (mode === 'no-get') return {}
      if (mode === 'bad-status') return { get: () => ({}) }
      throw Error('agents unavailable')
    }
    let bridgeCalls = 0
    await assert.rejects(() => deleteSession(ctx, id, { bridge: async () => {
      bridgeCalls += 1
      return { ok: false, deleted: [], failed: [], error: 'fixture: no deletion' }
    } }), error => error.code === 'session-state-unavailable')
    assert.equal(bridgeCalls, 0)
    assert.equal(existsSync(dir), true)
  })
}

test('状态服务异常时检查接口不能给出可删除结论', async () => {
  const home = await freshHome()
  const id = '02164c8b-93a4-4d75-bf16-429db71894e5'
  await seedSession(home, id)
  const ctx = ctxWithAgents(['idle'])
  ctx.get = () => { throw Error('agents unavailable') }
  await assert.rejects(() => inspectSession(ctx, id), error => error.code === 'session-state-unavailable')
})

// 注意：lastBinStatus 是模块级状态、整个测试文件共享，这条必须排在任何一次成功删除之前。
test('还没删过任何会话时，/check 的 binStatus 是 unknown：没有探测事实就如实说不知道', async () => {
  const home = await freshHome()
  await seedSession(home, '02164c8b-93a4-4d75-bf16-429db71894e6')
  const ctx = ctxWithAgents(['idle'])

  const verdict = await inspectSession(ctx, '02164c8b-93a4-4d75-bf16-429db71894e6')

  assert.equal(verdict.binStatus, 'unknown')
})

test('桥报告 permanent=true 时删除结果如实透传（回收站降级成了永久删除）', async () => {
  const home = await freshHome()
  const id = '11111111-aaaa-bbbb-cccc-000000000001'
  await seedSession(home, id)
  const ctx = ctxWithAgents(['idle'])
  const bridge = async (action, paths) => ({ ok: true, deleted: paths, failed: [], permanent: true })

  const result = await deleteSession(ctx, id, { bridge })

  assert.equal(result.permanent, true)
})

test('正常回收时 permanent 为 false；桥没回这个字段也按 false 处理', async () => {
  const home = await freshHome()
  const ctx = ctxWithAgents(['idle'])

  const id = '11111111-aaaa-bbbb-cccc-000000000002'
  await seedSession(home, id)
  const saidFalse = await deleteSession(ctx, id, {
    bridge: async (action, paths) => ({ ok: true, deleted: paths, failed: [], permanent: false }),
  })
  assert.equal(saidFalse.permanent, false)

  const id2 = '11111111-aaaa-bbbb-cccc-000000000003'
  await seedSession(home, id2)
  const silent = await deleteSession(ctxWithAgents(['idle']), id2, {
    bridge: async (action, paths) => ({ ok: true, deleted: paths, failed: [] }),
  })
  assert.equal(silent.permanent, false)
})

test('最近一次删除观察到永久删除后，/check 判定带 permanent 提示（确认框据此说「将永久删除」）', async () => {
  const home = await freshHome()
  const id = '22222222-aaaa-bbbb-cccc-000000000001'
  await seedSession(home, id)
  const ctx = ctxWithAgents(['idle'])
  await deleteSession(ctx, id, {
    bridge: async (action, paths) => ({ ok: true, deleted: paths, failed: [], permanent: true }),
  })

  const verdict = await inspectSession(ctx, '33333333-aaaa-bbbb-cccc-000000000009')

  assert.equal(verdict.permanent, true)
})

test('成功回收一次后，/check 的 permanent 提示自动消除', async () => {
  const home = await freshHome()
  const id = '22222222-aaaa-bbbb-cccc-000000000002'
  await seedSession(home, id)
  const ctx = ctxWithAgents(['idle'])
  await deleteSession(ctx, id, {
    bridge: async (action, paths) => ({ ok: true, deleted: paths, failed: [], permanent: false }),
  })

  const verdict = await inspectSession(ctx, '33333333-aaaa-bbbb-cccc-00000000000a')

  assert.equal(verdict.permanent, false)
})

test('deleteSession 透传删前探测得出的 binStatus：NukeOnDelete=1 → suspect', async () => {
  const home = await freshHome()
  const id = '44444444-aaaa-bbbb-cccc-000000000001'
  await seedSession(home, id)
  const ctx = ctxWithAgents(['idle'])
  const bridge = async (action, paths) => ({
    ok: true, deleted: paths, failed: [],
    binProbe: { volumeRoot: 'C:\\', volumeGuid: '{1aa6e104-4647-4836-bbae-082fc9450d76}', nukeOnDelete: 1, recycleQueryOk: true, error: '' },
  })

  const result = await deleteSession(ctx, id, { bridge })

  assert.equal(result.binStatus, 'suspect')
})

test('/check 响应带 binStatus：删过之后带上那次的探测事实判定（suspect → ok）', async () => {
  const home = await freshHome()
  const ctx = ctxWithAgents(['idle'])

  // 第一次删：探测说这一卷直通永久删除 → /check 之后带 suspect（确认框据此预警）。
  const id = '44444444-aaaa-bbbb-cccc-000000000002'
  await seedSession(home, id)
  await deleteSession(ctx, id, {
    bridge: async (action, paths) => ({
      ok: true, deleted: paths, failed: [], permanent: true,
      binProbe: { nukeOnDelete: 1, recycleQueryOk: true, error: '' },
    }),
  })
  assert.equal((await inspectSession(ctx, '55555555-aaaa-bbbb-cccc-000000000001')).binStatus, 'suspect')

  // 第二次删：探测一切正常 → /check 跟着转回 ok。
  const id2 = '44444444-aaaa-bbbb-cccc-000000000003'
  await seedSession(home, id2)
  await deleteSession(ctx, id2, {
    bridge: async (action, paths) => ({
      ok: true, deleted: paths, failed: [], permanent: false,
      binProbe: { nukeOnDelete: 0, recycleQueryOk: true, error: '' },
    }),
  })
  assert.equal((await inspectSession(ctx, '55555555-aaaa-bbbb-cccc-000000000002')).binStatus, 'ok')
})

test('探测段缺失/桥没带回 binProbe 时 binStatus 为 unknown，且不拖垮删除', async () => {
  const home = await freshHome()
  const id = '44444444-aaaa-bbbb-cccc-000000000004'
  await seedSession(home, id)
  const ctx = ctxWithAgents(['idle'])

  const result = await deleteSession(ctx, id, {
    bridge: async (action, paths) => ({ ok: true, deleted: paths, failed: [] }),
  })

  assert.equal(result.binStatus, 'unknown')
  assert.equal(result.permanent, false)
})

test('桥部分失败且仅缓存移走：不得误报成功或广播移除', async () => {
  const home=await freshHome(),id='partial-case';const dir=await seedSession(home,id);let events=0;
  const cache=join(home,'storages','session_projcache','sessions',id+'.json');await mkdir(join(home,'storages','session_projcache','sessions'),{recursive:true});await writeFile(cache,'{}');
  const ctx=ctxWithAgents(['idle']);ctx.emit=()=>{events++};
  await assert.rejects(()=>deleteSession(ctx,id,{bridge:async()=>({ok:false,deleted:[cache],failed:[],error:'fixture index failed'})}),{code:'move-failed'});
  assert.equal(existsSync(dir),true);assert.equal(events,0);
});
test('桥声称成功但未报告处理会话目录：不能误报成功', async () => {
  const home=await freshHome(),id='missing-result';const dir=await seedSession(home,id);let events=0;const ctx=ctxWithAgents(['idle']);ctx.emit=()=>{events++};
  await assert.rejects(()=>deleteSession(ctx,id,{bridge:async()=>({ok:true,deleted:[],failed:[]})}),{code:'move-failed'});
  assert.equal(existsSync(dir),true);assert.equal(events,0);
});

test('会话目录已回收，仅缓存无法回收：仍同步列表并记录警告', async () => {
  const home=await freshHome(),id='cache-only-fail';const dir=await seedSession(home,id);const cache=join(home,'storages','session_projcache','sessions',id+'.json');await mkdir(join(home,'storages','session_projcache','sessions'),{recursive:true});await writeFile(cache,'{}');
  let events=0,warnings=0;const ctx=ctxWithAgents(['idle']);ctx.emit=()=>{events++};ctx.logger.warn=()=>{warnings++};
  const result=await deleteSession(ctx,id,{bridge:async()=>({ok:false,deleted:[dir],failed:[{path:cache,error:'still on disk'}],error:'partial: still on disk: cache',permanent:false})});
  assert.equal(result.moved.includes(dir),true);assert.equal(events,1);assert.equal(warnings,1);
});
test('会话目录已报告移走但桥发生非部分处理错误：不能盲目报成功', async () => {
  const home=await freshHome(),id='unknown-bridge-fail';const dir=await seedSession(home,id);const cache=join(home,'storages','session_projcache','sessions',id+'.json');await mkdir(join(home,'storages','session_projcache','sessions'),{recursive:true});await writeFile(cache,'{}');
  let events=0;const ctx=ctxWithAgents(['idle']);ctx.emit=()=>{events++};
  await assert.rejects(()=>deleteSession(ctx,id,{bridge:async()=>({ok:false,deleted:[dir],failed:[{path:cache,error:'still on disk'}],error:'unexpected failure'})}),{code:'move-failed'});assert.equal(events,0);
});
