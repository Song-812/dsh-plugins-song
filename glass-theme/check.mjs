// 产物自检：不启动 DSH；检查构建结果、关键声明，并做几项修后回归探针。
// 双模：node check.mjs 直接跑（打印 CHECK OK / CHECK FAILED），或被 run-all.mjs import 后调用 run()。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname)

export async function run() {
  const failures = []
  const check = (condition, message) => {
    if (!condition) failures.push(message)
  }
  const exists = (file) => fs.existsSync(path.join(root, file))
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

  check(exists('lib/index.js'), '缺少 lib/index.js（先 npm run build）')
  check(exists('lib/client.js'), '缺少 lib/client.js（先 npm run build）')
  check(exists('壁纸/默认壁纸.jpg'), '缺少出厂壁纸 壁纸/默认壁纸.jpg')
  for (const font of ['space-grotesk-1.woff2', 'space-grotesk-2.woff2', 'space-grotesk-3.woff2']) {
    check(exists(`assets/fonts/${font}`), `缺少字体 assets/fonts/${font}`)
  }

  if (exists('lib/client.js')) {
    const client = read('lib/client.js')
    check(client.includes('__ModuleLoader__'), 'client 不是 loader 工厂格式')
    check(client.includes("id: 'dsh-glass-theme'"), 'client 工厂 id 不是 dsh-glass-theme')
    check(client.includes('settings.section'), 'client 没有注册 settings.section')
    check(client.includes('data-glass-bg'), 'client 缺背景层')
    check(client.includes('/api/glass-theme'), 'client 没访问主机路由')
    check(client.includes('item.labels'), 'client toast 未接 Confirm/Cancel 标签')
    check(client.includes('Restore defaults') || client.includes('confirm:'), 'client 缺英文词典')
    check(client.includes('Scroll content'), 'client 滚动条缺英文 aria')
  }

  if (exists('lib/index.js')) {
    const host = read('lib/index.js')
    check(host.includes('/api/glass-theme'), 'host 没有注册 /api/glass-theme 路由')
    check(host.includes('默认壁纸'), 'host 缺出厂壁纸名')
    check(host.includes('queueWrite') || host.includes('writeChains'), 'host 缺壁纸写锁')
    check(host.includes('.tmp-'), 'host state 未原子写')
    check(!host.includes('path: WALLPAPER_DIR') && !host.includes('path:WALLPAPER_DIR'), 'host reveal 仍回绝对路径')
    check(host.includes('50 * 1024 * 1024') || host.includes('52428800'), 'host 上传上限未降到 50MB')
  }

  const pkg = JSON.parse(read('package.json'))
  check(pkg.name === 'dsh-glass-theme', 'package.json 包名不对')
  check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'package.json 缺 dsh.bundle.patch')
  check(pkg.dsh?.client?.platform === 'web', 'package.json 缺 dsh.client.platform')
  check(pkg.exports?.['./client'] === './lib/client.js', 'package.json 的 ./client 导出不对')
  check(exists('cordis.patch.yml'), '缺少 cordis.patch.yml')
  check(exists('locale/zh.json'), '缺少 locale/zh.json')
  check(exists('locale/en.json'), '缺少 locale/en.json')

  const en = JSON.parse(read('locale/en.json'))
  const zh = JSON.parse(read('locale/zh.json'))
  check(en.confirm === 'Confirm' && en.cancel === 'Cancel', 'en.json 缺 Confirm/Cancel')
  check(zh.confirm === '确认' && zh.cancel === '取消', 'zh.json 缺确认/取消')
  check(typeof en.blurTitle === 'string' && typeof zh.blurTitle === 'string', 'locale 缺设置页文案')

  const baks = []
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.bak/i.test(entry.name)) baks.push(path.relative(root, full))
    }
  }
  walk(root)
  check(baks.length === 0, `仍有 bak 文件：${baks.slice(0, 5).join(', ')}${baks.length > 5 ? '…' : ''}`)

  for (const file of ['lib/index.js', 'lib/client.js']) {
    if (!exists(file)) continue
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' })
    check(result.status === 0, `node --check ${file} 失败：${(result.stderr || '').trim()}`)
  }

  // AVIF 魔数探针（不启动 DSH）
  try {
    // Node 原生 TS 可能不可用；用 esbuild 打一小包
    const require = createRequire(import.meta.url)
    let detect
    try {
      const esbuild = require('esbuild')
      const built = esbuild.buildSync({
        entryPoints: [path.join(root, 'src/shared/wallpaper.ts')],
        bundle: true,
        write: false,
        platform: 'neutral',
        format: 'esm',
      })
      const mod = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
      detect = mod.detectMediaFromMagic
    } catch (error) {
      check(false, `无法加载 wallpaper 魔数：${error}`)
    }
    if (typeof detect === 'function') {
      const avif = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0])
      const avis = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73, 0, 0, 0, 0])
      const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0])
      check(detect(avif) === 'image', 'AVIF 魔数应识别为 image')
      check(detect(avis) === 'image', 'AVIS 魔数应识别为 image')
      check(detect(mp4) === 'video', 'mp4 魔数应识别为 video')
    }
  } catch (error) {
    check(false, `AVIF 探针异常：${error}`)
  }

  const failedCount = failures.length
  return {
    label: '玻璃主题',
    packageName: 'dsh-glass-theme',
    pluginDir: root,
    ok: failedCount === 0,
    failed: failedCount,
    passed: 0,
    checks: failures.length
      ? failures.map((message, i) => ({ id: `fail:${i + 1}`, status: 'fail', detail: message }))
      : [{ id: 'scan', status: 'pass', detail: '构建产物、声明、locale、AVIF 魔数全部通过' }],
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await run()
  if (!result.ok) {
    process.stderr.write(`CHECK FAILED (${result.failed})\n`)
    for (const item of result.checks) process.stderr.write(`  - ${item.detail}\n`)
    process.exit(1)
  }
  process.stdout.write('CHECK OK\n')
}
