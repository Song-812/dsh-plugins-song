/**
 * dsh-launch-animation · 开机素材（换壁纸 / 重算素描）
 *
 * 换一张图之后，这里负责：
 *   1. 用内置的 prepare-artwork.py（**和出厂素材完全相同的算法**：3:2 中心裁切、1536×1024、
 *      bilateralFilter → Canny → 形态学闭运算 → findContours → approxPolyDP）重算成品图与线稿；
 *   2. 把成品图（JPEG）与线稿（paths）存到插件自己的数据目录：
 *        $DSH_HOME/launch-animation/artwork/{artwork.jpg, contours.json, meta.json}
 *      —— 存数据目录而不是插件包，这样插件更新/重装都不会丢，并且随时能「恢复默认」；
 *   3. 把注入脚本里 `const BOOT = {...}` 那一行的素材换成自定义的（其余原样保留），
 *      所以「换图 → 刷新页面」就能看到新素材，不必重启 DSH。
 *
 * 依赖：本机要有带 opencv-python + numpy 的 Python（本机实测 py → Python312 带 cv2 5.0.0）。
 *      没有就明确报错，不会静默失败。
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { dataDir, resolveUnderUploads, detectImageMime } from './settings.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, 'prepare-artwork.py')
const MAX_SOURCE_BYTES = 40 * 1024 * 1024
const PRESETS = new Set(['sparse', 'medium', 'dense'])
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff'])

export function artworkDir() {
  return path.join(dataDir(), 'artwork')
}
function artworkFile() {
  return path.join(artworkDir(), 'artwork.jpg')
}
function contoursFile() {
  return path.join(artworkDir(), 'contours.json')
}
function metaFile() {
  return path.join(artworkDir(), 'meta.json')
}

let assetsCache = null
let pythonCache = null

/** 每次「换图」尝试都追加一行日志，便于排障。 */
function logFile() {
  return path.join(dataDir(), 'artwork-log.jsonl')
}
function appendLog(entry) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true })
    const line = `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`
    fs.appendFileSync(logFile(), line, 'utf8')
    // 只留最近 80 行，别无限长大
    const all = fs.readFileSync(logFile(), 'utf8').split('\n').filter((row) => row.trim() !== '')
    if (all.length > 80) fs.writeFileSync(logFile(), `${all.slice(-80).join('\n')}\n`, 'utf8')
  } catch {
    /* 日志失败不影响主流程 */
  }
}

function signature() {
  try {
    const a = fs.statSync(artworkFile())
    const c = fs.statSync(contoursFile())
    const m = fs.statSync(metaFile())
    return `${a.size}:${a.mtimeMs}:${c.size}:${c.mtimeMs}:${m.mtimeMs}`
  } catch {
    return null
  }
}

/** 读自定义素材（没有就返回 null）。带内存缓存 + mtime 签名校验。 */
export function loadCustomAssets() {
  const sig = signature()
  if (sig === null) return null
  if (assetsCache !== null && assetsCache.signature === sig) return assetsCache
  try {
    const artwork = `data:image/jpeg;base64,${fs.readFileSync(artworkFile()).toString('base64')}`
    const parsed = JSON.parse(fs.readFileSync(contoursFile(), 'utf8'))
    const contours = Array.isArray(parsed.paths) ? parsed.paths : []
    if (contours.length === 0) return null
    let meta = {}
    try {
      meta = JSON.parse(fs.readFileSync(metaFile(), 'utf8'))
    } catch {
      meta = {}
    }
    assetsCache = {
      signature: sig,
      artwork,
      contours,
      canvas: Array.isArray(parsed.canvas) ? parsed.canvas : [1536, 1024],
      preset: typeof parsed.preset === 'string' ? parsed.preset : 'dense',
      points: Number(parsed.points) || 0,
      meta,
    }
    return assetsCache
  } catch {
    return null
  }
}

/** 给设置页看的素材状态。 */
export function customState() {
  const custom = loadCustomAssets()
  if (custom === null) return { custom: false }
  return {
    custom: true,
    canvas: custom.canvas,
    preset: custom.preset,
    paths: custom.contours.length,
    points: custom.points,
    artworkBytes: Buffer.byteLength(custom.artwork, 'utf8'),
    meta: custom.meta,
  }
}

function invalidate() {
  assetsCache = null
}

/** 把注入脚本里 `const BOOT = {...};` 那一行的素材换成自定义的，其余原样保留。 */
const BOOT_MARK = 'const BOOT = '
export function composeScript(script) {
  const custom = loadCustomAssets()
  if (custom === null || typeof script !== 'string') return script
  const start = script.indexOf(BOOT_MARK)
  if (start < 0) return script
  const end = script.indexOf('\n', start)
  if (end < 0) return script
  const line = script.slice(start, end)
  const withoutSemi = line.endsWith(';') ? line.slice(0, -1) : line
  let boot
  try {
    boot = JSON.parse(withoutSemi.slice(BOOT_MARK.length))
  } catch {
    return script
  }
  boot.assets = { ...(boot.assets || {}), artwork: custom.artwork }
  boot.contours = custom.contours
  return script.slice(0, start) + BOOT_MARK + JSON.stringify(boot) + ';' + script.slice(end)
}

/* ---------- Python 侧 ---------- */

function run(exe, args) {
  return new Promise((resolve) => {
    // 2026-10-11：Windows 上 Python 的 stdout 默认编码是 gbk（本机实测 sys.stdout.encoding=gbk），
    // 而 Node 按 UTF-8 解码 → 报错文案会变成「��Ʒͼд��ʧ�ܣ�」这种乱码，
    // 设置页那行红字就白写了。强制 Python 走 UTF-8，两边才对得上。
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    execFile(exe, args, { windowsHide: true, timeout: 60000, maxBuffer: 32 * 1024 * 1024, env }, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

function candidates() {
  const list = []
  if (process.platform === 'win32') list.push({ exe: 'py', args: ['-3'] })
  list.push({ exe: 'python', args: [] })
  list.push({ exe: 'python3', args: [] })
  // 应用自带运行时里的 Python 也试一下（通常没 cv2，但万一有）
  const home = process.env.DSH_HOME || process.env.USERPROFILE || process.env.HOME || ''
  if (home !== '') {
    const runtimes = path.join(home, 'dsh-runtimes')
    try {
      for (const dir of fs.readdirSync(runtimes)) {
        const exe = path.join(runtimes, dir, 'dependencies', 'python', 'python.exe')
        if (fs.existsSync(exe)) list.push({ exe, args: [] })
      }
    } catch {
      /* 没有就算了 */
    }
  }
  return list
}

/** 找一个带 cv2 的 Python（结果缓存）。 */
export async function findPython(force = false) {
  if (pythonCache !== null && !force) return pythonCache
  const failures = []
  for (const candidate of candidates()) {
    const probe = await run(candidate.exe, [...candidate.args, '-c', 'import cv2, numpy; print(cv2.__version__)'])
    if (probe.error === null) {
      pythonCache = { ok: true, exe: candidate.exe, args: candidate.args, cv2: probe.stdout.trim(), note: `${candidate.exe}${candidate.args.join(' ')}` }
      return pythonCache
    }
    const reason = probe.error.code === 'ENOENT' ? '找不到这个命令' : String(probe.error.message || probe.error)
    failures.push(`${candidate.exe}${candidate.args.length ? ' ' + candidate.args.join(' ') : ''}：${reason}`)
  }
  pythonCache = { ok: false, error: failures.join('；') }
  return pythonCache
}

/* ---------- 换图 / 恢复默认 ---------- */

export async function setArtwork(sourcePath, preset = 'dense') {
  const raw = typeof sourcePath === 'string' ? sourcePath : ''
  // 容错：去掉首尾空白与成对引号（从资源管理器「复制文件地址」常常带引号）
  let file = raw.trim()
  while (file.length > 1 && ((file.startsWith('"') && file.endsWith('"')) || (file.startsWith("'") && file.endsWith("'")))) {
    file = file.slice(1, -1).trim()
  }
  const log = (extra) => appendLog({ file, raw, preset, ...extra })

  if (file === '') {
    log({ ok: false, error: '路径为空' })
    return { ok: false, error: '请提供 uploads 目录内的图片路径（请用设置页上传）' }
  }
  const gated = resolveUnderUploads(file)
  if (!gated) {
    log({ ok: false, error: 'outside-uploads', file })
    return { ok: false, error: '自定义素材只接受插件 uploads 目录内的文件，请用设置页上传' }
  }
  file = gated
  if (!PRESETS.has(preset)) {
    log({ ok: false, error: '档位不合法' })
    return { ok: false, error: '档位只能是 sparse / medium / dense' }
  }

  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    log({ ok: false, error: '文件不存在' })
    return { ok: false, error: `找不到这个文件：${file}` }
  }
  if (!stat.isFile()) {
    log({ ok: false, error: '不是文件' })
    return { ok: false, error: '这个路径不是文件' }
  }
  if (stat.size > MAX_SOURCE_BYTES) {
    log({ ok: false, error: '文件过大', bytes: stat.size })
    return { ok: false, error: `图片太大（${Math.round(stat.size / 1048576)} MB），上限 40 MB` }
  }
  const ext = path.extname(file).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    log({ ok: false, error: '格式不支持', ext })
    return { ok: false, error: `不支持的格式：${ext || '（没有扩展名）'}` }
  }
  if (!detectImageMime(file)) {
    log({ ok: false, error: 'not-image' })
    return { ok: false, error: '文件内容不是图片（文件头对不上）' }
  }

  const python = await findPython()
  if (!python.ok) {
    log({ ok: false, error: 'python-unavailable', detail: python.error })
    return { ok: false, error: `没有找到可用的 Python + opencv（${python.error}）。装 Python 后执行 pip install opencv-python numpy 即可。` }
  }

  const result = await run(python.exe, [...python.args, SCRIPT, file, artworkDir(), preset])
  const lastLine = result.stdout.trim().split(/\r?\n/).filter((line) => line.trim() !== '').pop() || ''
  let parsed = null
  try {
    parsed = JSON.parse(lastLine)
  } catch {
    parsed = null
  }
  if (result.error !== null || parsed === null || parsed.ok !== true) {
    log({ ok: false, error: 'pipeline-failed', detail: (parsed && parsed.error) || String(result.error && result.error.message) || result.stderr.slice(-200) })
    const detail = parsed && parsed.error
      ? parsed.error
      : (result.error !== null ? String(result.error.message || result.error) : (result.stderr.trim() || '脚本没有返回可解析的结果'))
    return { ok: false, error: detail }
  }

  try {
    fs.writeFileSync(metaFile(), `${JSON.stringify({
      source: file,
      sourceName: parsed.sourceName,
      preset: parsed.preset,
      canvas: parsed.canvas,
      artworkBytes: parsed.artwork.bytes,
      contoursBytes: parsed.contours.bytes,
      paths: parsed.contours.paths,
      points: parsed.contours.points,
      generatedAt: new Date().toISOString(),
    }, null, 2)}\n`, 'utf8')
  } catch (error) {
    return { ok: false, error: `素材已算出但写入失败：${String((error && error.message) || error)}` }
  }

  invalidate()
  log({ ok: true, python: python.note, paths: parsed.contours.paths, points: parsed.contours.points, artworkBytes: parsed.artwork.bytes })
  return { ok: true, python: python.note, completedAt: new Date().toISOString(), ...customState() }
}

export function resetArtwork() {
  try {
    fs.rmSync(artworkDir(), { recursive: true, force: true })
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
  invalidate()
  return { ok: true, ...customState() }
}
