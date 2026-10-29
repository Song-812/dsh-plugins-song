// 宿主半加固回归：写队列（并发保存）、profile 目录解析、路由注册交回清理。
// 全程只用系统临时目录，绝不碰真实 ~/.dsh。
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, readdirSync, utimesSync, existsSync } from 'node:fs'
import fsDefault from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { __test__, handle, apply, STATE_FILE_NAME } from '../lib/index.js'

let failures = 0
const check = (name, ok, extra = '') => {
  if (ok) console.log(`PASS ${name}`)
  else { failures += 1; console.log(`FAIL ${name}${extra === '' ? '' : `  →  ${extra}`}`) }
}

const { queueWrite, pickProfileDir, profileDirFromPluginPath } = __test__
const post = (home, prefs) => handle(new Request('http://x/api/plugins-panel', {
  method: 'POST',
  body: JSON.stringify({ action: 'prefs', prefs }),
}), home)

// ───────────────────────────── 修复 1a：写队列按 home 串行 ─────────────────────────────
check('queueWrite 已导出', typeof queueWrite === 'function', String(typeof queueWrite))
if (typeof queueWrite === 'function') {
  const chainHome = path.join(os.tmpdir(), 'panel-chain-home')
  const order = []
  await Promise.all([
    queueWrite(chainHome, async () => { order.push('a1'); await new Promise((resolve) => setTimeout(resolve, 12)); order.push('a2') }),
    queueWrite(chainHome, async () => { order.push('b1') }),
  ])
  check('同一 home 的写任务严格按提交顺序串行', JSON.stringify(order) === '["a1","a2","b1"]', JSON.stringify(order))

  // 不同 home 互不阻塞：A 还没写完时 B 可以立刻完成。
  const freeOrder = []
  const slow = queueWrite(path.join(os.tmpdir(), 'panel-chain-slow'), async () => {
    freeOrder.push('slow-start')
    await new Promise((resolve) => setTimeout(resolve, 20))
    freeOrder.push('slow-end')
  })
  const fast = queueWrite(path.join(os.tmpdir(), 'panel-chain-fast'), async () => { freeOrder.push('fast') })
  await Promise.all([slow, fast])
  check('不同 home 的写链互不阻塞', freeOrder.indexOf('fast') < freeOrder.indexOf('slow-end'), JSON.stringify(freeOrder))

  // 写任务抛错也不能卡死整条链：下一个任务照常执行。
  const afterError = []
  const boom = queueWrite(chainHome, async () => { throw new Error('boom') }).catch(() => {})
  const following = queueWrite(chainHome, async () => { afterError.push('ran') })
  await Promise.all([boom, following])
  check('队列中任务失败后链仍继续', JSON.stringify(afterError) === '["ran"]', JSON.stringify(afterError))
}

// ───────────────────────────── 修复 1b：并发两次保存的顺序与完整性 ─────────────────────────────
const saveHome = mkdtempSync(path.join(os.tmpdir(), 'panel-save-'))
delete process.env.DSH_PROFILE_DIR
delete process.env.DSH_PROFILE
mkdirSync(path.join(saveHome, 'profiles', 'desktop'), { recursive: true })
writeFileSync(path.join(saveHome, 'profiles', 'desktop', 'package.json'), '{"dependencies":{}}', 'utf8')

// mock fs 抓取 writeJson 用过的临时名：两次保存必须互不相同（旧代码共用固定 .tmp 会撞名）。
const seenTmp = []
const realWriteFileSync = fsDefault.writeFileSync
fsDefault.writeFileSync = (file, ...rest) => { seenTmp.push(String(file)); return realWriteFileSync(file, ...rest) }
let firstAnswer
let secondAnswer
try {
  ;[firstAnswer, secondAnswer] = await Promise.all([
    post(saveHome, { titles: { a: '第一次' } }),
    post(saveHome, { collapsed: { self: true } }),
  ])
} finally {
  fsDefault.writeFileSync = realWriteFileSync
}
check('并发两次保存都成功', firstAnswer.status === 200 && secondAnswer.status === 200, `${firstAnswer.status}/${secondAnswer.status}`)
check('两次保存使用互不相同的临时名', seenTmp.length === 2 && seenTmp[0] !== seenTmp[1], JSON.stringify(seenTmp))
const savedDisk = JSON.parse(readFileSync(path.join(saveHome, STATE_FILE_NAME), 'utf8'))
const secondBody = await secondAnswer.json()
check('并发保存后磁盘内容完整且等于后写入的那份', JSON.stringify(savedDisk.prefs) === JSON.stringify(secondBody.prefs), JSON.stringify(savedDisk.prefs))
check('保存后没有 .tmp 文件残留', readdirSync(saveHome).filter((name) => name.startsWith(STATE_FILE_NAME)).length === 1, JSON.stringify(readdirSync(saveHome)))

// ───────────────────────────── 修复 1c：写失败时清理临时文件 ─────────────────────────────
const failHome = mkdtempSync(path.join(os.tmpdir(), 'panel-fail-'))
mkdirSync(path.join(failHome, STATE_FILE_NAME)) // 让 rename 目标变成非空目录 → 写入必失败
writeFileSync(path.join(failHome, STATE_FILE_NAME, 'blocker'), 'x', 'utf8')
const failAnswer = await post(failHome, { titles: { a: '写不进去' } })
check('写失败时返回 500 而不是未处理异常', failAnswer.status === 500, String(failAnswer.status))
check('写失败后没有临时文件残留', readdirSync(failHome).filter((name) => name.startsWith(`${STATE_FILE_NAME}.tmp`)).length === 0, JSON.stringify(readdirSync(failHome)))

// ───────────────────────────── 修复 2：profile 目录解析 ─────────────────────────────
check('pickProfileDir 已导出', typeof pickProfileDir === 'function', String(typeof pickProfileDir))
if (typeof pickProfileDir === 'function') {
  // 情况一：DSH_PROFILE_DIR 有值 → 直接用它（去首尾空白）。
  const envHome = mkdtempSync(path.join(os.tmpdir(), 'panel-env-'))
  check('DSH_PROFILE_DIR 有值时直接采用', pickProfileDir(envHome, { DSH_PROFILE_DIR: '  C:/somewhere  ' }).dir === 'C:/somewhere', JSON.stringify(pickProfileDir(envHome, { DSH_PROFILE_DIR: '  C:/somewhere  ' })))

  // 情况二：只有 DSH_PROFILE 有值 → home/profiles/<名>。
  check('DSH_PROFILE 有值时拼到 profiles 下', pickProfileDir(envHome, { DSH_PROFILE: 'beta' }).dir === path.join(envHome, 'profiles', 'beta'), JSON.stringify(pickProfileDir(envHome, { DSH_PROFILE: 'beta' })))

  // 情况三：环境变量都缺时，优先从插件加载路径推断 profiles/<name>/node_modules/...。
  const multiHome = mkdtempSync(path.join(os.tmpdir(), 'panel-multi-'))
  const desktopDir = path.join(multiHome, 'profiles', 'desktop')
  const otherDir = path.join(multiHome, 'profiles', 'other')
  for (const dir of [desktopDir, otherDir]) mkdirSync(path.join(dir, 'node_modules', 'dsh-plugins-panel', 'lib'), { recursive: true })
  writeFileSync(path.join(desktopDir, 'package.json'), '{"dependencies":{"dsh-wechat":"link:x"}}', 'utf8')
  writeFileSync(path.join(otherDir, 'package.json'), '{"dependencies":{}}', 'utf8')
  // other 更新更晚；若仍按 mtime 会误选 other。推断应固定到 desktop。
  const oldTime = new Date('2026-01-01T00:00:00Z')
  const newTime = new Date('2026-10-01T00:00:00Z')
  utimesSync(desktopDir, oldTime, oldTime)
  utimesSync(otherDir, newTime, newTime)
  const pluginFile = path.join(desktopDir, 'node_modules', 'dsh-plugins-panel', 'lib', 'index.js')
  writeFileSync(pluginFile, '// stub', 'utf8')
  const inferred = pickProfileDir(multiHome, {}, pluginFile)
  check('环境变量缺失时从插件路径推断 profile，不看 mtime', inferred.dir === desktopDir && inferred.source === 'plugin-path', JSON.stringify(inferred))
  check('profileDirFromPluginPath 能认出 profiles/*/node_modules', profileDirFromPluginPath(pluginFile) === desktopDir, String(profileDirFromPluginPath(pluginFile)))

  // 情况四：环境变量缺失且无法推断 → 回退 desktop，并带 warning。
  const emptyHome = mkdtempSync(path.join(os.tmpdir(), 'panel-empty-'))
  mkdirSync(path.join(emptyHome, 'profiles'), { recursive: true })
  const fallback = pickProfileDir(emptyHome, {}, path.join(emptyHome, 'somewhere', 'index.js'))
  check('环境变量缺失、无法推断时回退 desktop', fallback.dir === path.join(emptyHome, 'profiles', 'desktop') && fallback.source === 'fallback-desktop', JSON.stringify(fallback))
  check('回退时写出 warning', typeof fallback.warning === 'string' && fallback.warning.length > 0, String(fallback.warning))
  const absent = pickProfileDir(path.join(emptyHome, 'absent'), {}, path.join(emptyHome, 'absent', 'x.js'))
  check('profiles 目录都不存在时也回退 desktop', absent.dir === path.join(emptyHome, 'absent', 'profiles', 'desktop'), JSON.stringify(absent))

  // DSH_PROFILE_DIR / DSH_PROFILE 返回结构是 {dir,source}
  check('DSH_PROFILE_DIR 有值时直接采用（结构）', pickProfileDir(envHome, { DSH_PROFILE_DIR: '  C:/somewhere  ' }).dir === 'C:/somewhere')
  check('DSH_PROFILE 有值时拼到 profiles 下（结构）', pickProfileDir(envHome, { DSH_PROFILE: 'beta' }).dir === path.join(envHome, 'profiles', 'beta'))

  rmSync(envHome, { recursive: true, force: true })
  rmSync(multiHome, { recursive: true, force: true })
  rmSync(emptyHome, { recursive: true, force: true })
}

// ───────────────────────────── 修复 4：路由注册把清理函数交回 ─────────────────────────────
const cleanup = () => {}
let registerCalls = 0
let injectResult
const fakeCtx = {
  inject: (deps, callback) => {
    const result = callback({
      connection: {
        fetch: {
          register: (spec) => {
            registerCalls += 1
            check('注册的路由与方法正确', spec.path === '/api/plugins-panel' && JSON.stringify(spec.methods) === JSON.stringify(['GET', 'POST']) && typeof spec.fetch === 'function', JSON.stringify({ path: spec.path, methods: spec.methods }))
            return cleanup
          },
        },
      },
    })
    injectResult = result
  },
}
apply(fakeCtx)
check('connection 注入执行了一次', registerCalls === 1, String(registerCalls))
check('fetch.register 返回的清理函数被交回给框架', injectResult === cleanup, String(typeof injectResult))

// register 不返回函数时也不能崩，且不交回任何东西。
let injectResultPlain
apply({
  inject: (deps, callback) => {
    injectResultPlain = callback({ connection: { fetch: { register: () => undefined } } })
  },
})
check('fetch.register 无返回值时不交回也不报错', injectResultPlain === undefined, String(typeof injectResultPlain))

rmSync(saveHome, { recursive: true, force: true })
rmSync(failHome, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
