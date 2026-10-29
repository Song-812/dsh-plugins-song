/**
 * 回归：apply() 里 connection 注入回调曾不交回清理函数——
 * `host.connection.fetch.register(...)` 的返回值若为函数（disposer），
 * 注入回调必须把它 return 给 cordis，否则插件被禁用/卸载后路由还挂着。
 * 防御式：register 返回非函数时也不许崩。
 *
 * 注意：apply() 会 noteLoad 写状态文件，所以先把 DSH_HOME 指到临时目录，
 * 绝不碰真实的 ~/.dsh/mcp-toggle.json。
 *
 * Run: node test\route-dispose.test.mjs   (from the plugin folder)
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log(`PASS  ${name}`)
  else { failures += 1; console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const tempHome = await mkdtemp(join(tmpdir(), 'mcp-toggle-dispose-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = tempHome
try {
  const { apply } = await import(new URL('../lib/index.js', import.meta.url).href)

  const injects = []
  const ctx = {
    inject: (deps, callback) => { injects.push({ deps, callback }); return () => {} },
  }
  apply(ctx)

  const connection = injects.find((entry) => Array.isArray(entry.deps) && entry.deps.includes('connection'))
  check('apply 注册了 connection 注入', connection !== undefined)

  if (connection !== undefined) {
    // ---- register 返回 disposer：必须原样交回 --------------------------------
    const disposer = () => {}
    let registered = null
    const host = {
      connection: {
        fetch: {
          register: (spec) => { registered = spec; return disposer },
        },
      },
    }
    const returned = connection.callback(host)
    check('register 返回的清理函数被交回（return disposer）', returned === disposer, String(typeof returned))
    check('注册的路由与方法保持不变',
      registered !== null
        && registered.path === '/api/mcp-toggle'
        && JSON.stringify(registered.methods) === JSON.stringify(['GET', 'POST'])
        && typeof registered.fetch === 'function',
      JSON.stringify(registered === null ? null : { path: registered.path, methods: registered.methods }))

    // ---- 防御式：register 返回非函数也不许崩 --------------------------------
    const plainHost = { connection: { fetch: { register: () => undefined } } }
    let plainReturned
    try {
      plainReturned = connection.callback(plainHost)
      check('register 返回 undefined 时不崩且不瞎交清理函数', plainReturned === undefined, String(plainReturned))
    } catch (error) {
      check('register 返回 undefined 时不崩且不瞎交清理函数', false, String(error))
    }

    // ---- 防御式：register 抛异常时原样向上抛（不吞错误） ----------------------
    const throwingHost = { connection: { fetch: { register: () => { throw new Error('boom') } } } }
    let threw = false
    try { connection.callback(throwingHost) } catch (error) { threw = String(error).includes('boom') }
    check('register 抛异常时错误不被吞掉', threw)
  }

  // noteLoad 的写入是异步排队的：稍等一拍再删临时目录，避免删在写一半时。
  await new Promise((resolve) => setTimeout(resolve, 50))
} finally {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(tempHome, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
