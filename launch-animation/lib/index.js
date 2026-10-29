/**
 * dsh-launch-animation 宿主半边（DSH 插件）
 *
 * 只做三件事，别的一概不做：
 *   1. 读自己的开关（$DSH_HOME/launch-animation/settings.json）；关掉就**一行都不注入**；
 *   2. 把动画包作为官方 index 注入行推给页面（style + global 覆盖 + script）；
 *   3. 提供 /api/launch-animation 给设置页读写配置。
 *
 * 边界：
 *   - 不碰 DSH 自身文件、不碰别人的插件、不写 profile；
 *   - 注入脚本自己在 Shadow DOM 里跑，卸载时把覆盖层与监听全摘干净（见 assets/animation/bootstrap.js）；
 *   - 素材（线稿 + 成品图 + 灰鲸）在构建时就内联进 payload.json，运行时零网络请求。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULTS,
  TRANSPARENT_PIXEL,
  clearUploads,
  dataDir,
  identityImageDataUrl,
  identityImageState,
  loadSettings,
  saveSettings,
  saveSettingsQueued,
  settingsFile,
} from './settings.js'
import { composeScript, customState, findPython, loadCustomAssets, resetArtwork, setArtwork } from './artwork.js'

export const name = 'launch-animation'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const ROUTE_PATH = '/api/launch-animation'
const MAX_BODY_BYTES = 16 * 1024
/** 上传换图专用：dataURL 是 base64（原图 ×4/3），32 MB 足够装下 20 MB 的原图 + JSON 包裹。 */
const UPLOAD_MAX_BYTES = 32 * 1024 * 1024
const UPLOAD_LIMITS = { identity: 8 * 1024 * 1024, artwork: 20 * 1024 * 1024 }

/** 设置页缩略图用：按文件头认图，不信扩展名也不信前端报的 MIME。 */
const IMAGE_MAGIC = [
  { mime: 'image/png', ext: '.png', test: (b) => b.length > 3 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: '.webp', test: (b) => b.length > 11 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 11) === 'WEB' },
  { mime: 'image/gif', ext: '.gif', test: (b) => b.length > 5 && b.toString('ascii', 0, 4) === 'GIF8' },
  { mime: 'image/bmp', ext: '.bmp', test: (b) => b.length > 3 && b.toString('ascii', 0, 2) === 'BM' },
]

/** 出厂缩略图（没换过图时设置页显示的那两张），读一次进内存。 */
const PREVIEW_FILES = {
  identity: { file: path.join(HERE, '..', 'assets', 'brand-whale.png'), mime: 'image/png' },
  artwork: { file: path.join(HERE, '..', 'assets', 'artwork.jpg'), mime: 'image/jpeg' },
}
const previewCache = new Map()

function defaultPreview(kind) {
  if (previewCache.has(kind)) return previewCache.get(kind)
  const entry = PREVIEW_FILES[kind]
  let value = null
  try {
    if (entry) value = `data:${entry.mime};base64,${fs.readFileSync(entry.file).toString('base64')}`
  } catch {
    value = null
  }
  previewCache.set(kind, value)
  return value
}

let cachedPayload = null

/** 构建产物只读一次并缓存（约 650 KB，含内联素材）。 */
function payload() {
  if (cachedPayload === null) {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'payload.json')
    cachedPayload = JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  return cachedPayload
}

/** 身份图：brand → 用包内构建时内联的灰鲸；custom → 读 uploads 内自定义图；none → 透明像素（身份段只剩雷达与字标）。 */
function avatarFor(settings) {
  if (settings.identityMode === 'none') return TRANSPARENT_PIXEL
  if (settings.identityMode === 'custom') return identityImageDataUrl(settings) || undefined
  return undefined // brand：交给包内默认值，省一次 base64
}

/** 按当前配置生成注入行。插件停用 = 一行都不注入；设置页没有关闭开关，装上就一直生效。 */
function injectionRows(settings) {
  const bundle = payload()
  // ⚠️ 2026-10-08 第四次修复：这里原本还推一条 { kind: 'style' } 行，把同一份 CSS 也塞进页面 <head>。
  // 那条行**完全多余**（引导层已经把 CSS 放进 Shadow DOM，样式不会外泄），而且会污染整个界面：
  // 它的 `.preview-heading, .preview-note, .controls, .traffic, #image-settings { display:none !important }`
  // 与其它 `.shade` / `.sync` 规则，正好撞上其他插件里未加前缀的同名类，
  // 结果把其他界面元素藏掉、底色覆盖掉。现在页面级只留 global 覆盖 + script 两行。
  const rows = []
  const override = {
    settings: {
      mode: settings.mode,
      showSkipHint: settings.showSkipHint,
      identityMode: settings.identityMode,
      captionMode: settings.captionMode,
    },
  }
  const avatar = avatarFor(settings)
  if (avatar) override.avatar = avatar
  rows.push({ kind: 'global', name: '__DSH_LAUNCH_OVERRIDE__', value: override })
  rows.push({ kind: 'script', placement: 'body', text: composeScript(bundle.script) })
  return rows
}

/** 客户端半边回报的诊断：落在插件自己的数据目录里，只保留最近几次。 */
const DIAGNOSTICS_LIMIT = 5

export function diagnosticsFile() {
  return path.join(path.dirname(settingsFile()), 'diagnostics.json')
}

function saveDiagnostic(report) {
  const file = diagnosticsFile()
  let history = []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (parsed && Array.isArray(parsed.reports)) history = parsed.reports
  } catch {
    history = []
  }
  history.push(typeof report === 'object' && report !== null ? report : {})
  while (history.length > DIAGNOSTICS_LIMIT) history.shift()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ updatedAt: new Date().toISOString(), reports: history }, null, 2) + '\n', 'utf8')
  return { ok: true, reports: history.length, file }
}

const ASSETS_PATH = ROUTE_PATH + '/assets'

/** 注入脚本启动时会来取一次：有自定义素材就返回，没有就 {custom:false}（几毫秒，几乎不影响开机速度）。 */
function assetsResponse() {
  const custom = loadCustomAssets()
  if (custom === null) return jsonResponse(200, { custom: false })
  return jsonResponse(200, {
    custom: true,
    artwork: custom.artwork,
    contours: custom.contours,
    canvas: custom.canvas,
    preset: custom.preset,
    paths: custom.contours.length,
    points: custom.points,
    meta: custom.meta,
  })
}

async function handleAssets(request) {
  if (request.method !== 'GET') return jsonResponse(405, { ok: false, error: '只支持 GET' })
  return assetsResponse()
}

function jsonResponse(status, body) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

async function statusPayload() {
  const settings = loadSettings()
  const bundle = payload()
  return {
    ok: true,
    settings,
    settingsFile: settingsFile(),
    diagnosticsFile: diagnosticsFile(),
    payload: {
      generatedAt: bundle.generatedAt,
      preset: bundle.preset,
      canvas: bundle.canvas,
      paths: bundle.paths,
      points: bundle.points,
      cssBytes: Buffer.byteLength(bundle.css, 'utf8'),
      scriptBytes: Buffer.byteLength(bundle.script, 'utf8'),
    },
    identityImage: identityImageState(settings),
    artwork: customState(),
    python: await findPython(),
  }
}

async function readBody(request) {
  const size = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > UPLOAD_MAX_BYTES) {
    throw new Error(`请求体过大（${size(declared)}），上限 ${size(UPLOAD_MAX_BYTES)}`)
  }
  const text = await request.text()
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > UPLOAD_MAX_BYTES) {
    throw new Error(`请求体过大（${size(bytes)}），上限 ${size(UPLOAD_MAX_BYTES)}`)
  }
  const body = JSON.parse(text)
  // 上传换图才允许大体积；改设置 / 诊断上报这些老动作仍然卡在 16 KB
  if (body && body.action !== 'upload' && bytes > MAX_BODY_BYTES) {
    throw new Error('请求体过大')
  }
  return body
}

/** 设置页缩略图：换过图给自定义的，没换过给出厂的（灰鲸 / 少女图）。 */
function previewResponse(kind) {
  if (kind === 'identity') {
    const settings = loadSettings()
    const custom = settings.identityMode === 'custom' ? identityImageDataUrl(settings) : null
    return { ok: true, custom: Boolean(custom), dataUrl: custom || defaultPreview('identity') }
  }
  if (kind === 'artwork') {
    const custom = loadCustomAssets()
    return { ok: true, custom: Boolean(custom), dataUrl: custom ? custom.artwork : defaultPreview('artwork') }
  }
  return { ok: false, error: 'kind 只能是 identity 或 artwork' }
}

/**
 * 上传换图：前端把图读成 dataURL 发过来 → 这里解码、验大小、按文件头认格式 →
 * 落到插件自己的数据目录（$DSH_HOME/launch-animation/uploads/）→
 *   头像：写进 settings（identityMode=custom）
 *   开机素材：丢给既有的素材管线重算线稿（需要 Python + opencv，失败原样报原因）
 */
async function handleUpload(body) {
  const kind = body.kind === 'artwork' ? 'artwork' : 'identity'
  const data = typeof body.data === 'string' ? body.data : ''
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(data)
  if (match === null) return { ok: false, error: '收到的不是 base64 图片数据' }

  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0) return { ok: false, error: '图片内容为空' }

  const limit = UPLOAD_LIMITS[kind]
  if (buffer.length > limit) {
    return { ok: false, error: `图片太大（${(buffer.length / 1048576).toFixed(1)} MB），上限 ${(limit / 1048576).toFixed(0)} MB` }
  }

  const detected = IMAGE_MAGIC.find((entry) => entry.test(buffer))
  if (!detected) {
    return { ok: false, error: `文件内容不是图片（声明 ${match[1] || '未知类型'}，但文件头对不上）` }
  }

  const dir = path.join(dataDir(), 'uploads')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${detected.ext}`)
  try {
    fs.writeFileSync(file, buffer)
  } catch (error) {
    return { ok: false, error: `写入插件数据目录失败：${String((error && error.message) || error)}` }
  }

  if (kind === 'identity') {
    const settings = await saveSettingsQueued({ identityMode: 'custom', identityImage: file })
    const state = identityImageState(settings)
    if (!state.ok) return { ok: false, error: `图片存好了但用不了（${state.reason}）：${file}` }
    return { ok: true, kind, file, settings, identityImage: state }
  }

  const result = await setArtwork(file)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, kind, file, artwork: result }
}

async function handle(request) {
  if (request.method === 'GET') return jsonResponse(200, await statusPayload())
  if (request.method !== 'POST') return jsonResponse(405, { ok: false, error: '只支持 GET 与 POST' })

  let body
  try {
    body = await readBody(request)
  } catch (error) {
    return jsonResponse(400, { ok: false, error: String((error && error.message) || error) })
  }
  if (typeof body !== 'object' || body === null) return jsonResponse(400, { ok: false, error: '请求体必须是 JSON 对象' })

  if (body.action === 'preview') {
    try {
      return jsonResponse(200, previewResponse(body.kind))
    } catch (error) {
      return jsonResponse(500, { ok: false, error: String((error && error.message) || error) })
    }
  }

  if (body.action === 'upload') {
    try {
      return jsonResponse(200, await handleUpload(body))
    } catch (error) {
      return jsonResponse(500, { ok: false, error: String((error && error.message) || error) })
    }
  }

  if (body.action === 'resetAll') {
    try {
      const settings = await saveSettingsQueued({ ...DEFAULTS })
      const artwork = resetArtwork()
      const uploads = clearUploads()
      const out = { ok: artwork.ok !== false && uploads.ok !== false, settings, settingsFile: settingsFile(), artwork, uploads }
      if (artwork.ok === false) out.error = `设置已恢复，但开机素材没还原：${artwork.error}`
      else if (uploads.ok === false) out.error = `设置已恢复，但 uploads 清理失败：${uploads.error}`
      return jsonResponse(200, out)
    } catch (error) {
      return jsonResponse(500, { ok: false, error: String((error && error.message) || error) })
    }
  }

  if (body.action === 'report') {
    try {
      return jsonResponse(200, saveDiagnostic(body.report ?? {}))
    } catch (error) {
      return jsonResponse(500, { ok: false, error: String((error && error.message) || error) })
    }
  }

  if (body.action === 'artwork') {
    try {
      return jsonResponse(200, await setArtwork(body.sourcePath, body.preset ?? 'dense'))
    } catch (error) {
      return jsonResponse(500, { ok: false, error: String((error && error.message) || error) })
    }
  }

  if (body.action === 'artworkReset') {
    try {
      return jsonResponse(200, resetArtwork())
    } catch (error) {
      return jsonResponse(500, { ok: false, error: String((error && error.message) || error) })
    }
  }

  try {
    const settings = await saveSettingsQueued(body.settings ?? body)
    return jsonResponse(200, { ok: true, settings, settingsFile: settingsFile(), identityImage: identityImageState(settings) })
  } catch (error) {
    return jsonResponse(500, { ok: false, error: String((error && error.message) || error) })
  }
}

/**
 * 插件入口。
 * @param {object} ctx 宿主 cordis 上下文
 */
export function apply(ctx) {
  // prepend：把我们的行插到注入表最前，抢在其它插件的 script 行（可能需要 await 加载）之前执行，
  // 这样「开机卡片」在浏览器真正绘制之前就已经被覆盖层盖住了。
  ctx.on('webserver/index-inject', (table) => {
    const rows = injectionRows(loadSettings())
    if (rows.length) table.unshift(...rows)
  }, { prepend: true })

  ctx.inject(['connection'], (host) => {
    const disposers = []
    const cleanup = () => {
      for (const dispose of disposers.splice(0).reverse()) {
        try { dispose() } catch { /* 继续清理剩余接口 */ }
      }
    }
    try {
      const mainDispose = host.connection.fetch.register({
        path: ROUTE_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => handle(request),
      })
      if (typeof mainDispose === 'function') disposers.push(mainDispose)
      const assetsDispose = host.connection.fetch.register({
        path: ASSETS_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => handleAssets(request),
      })
      if (typeof assetsDispose === 'function') disposers.push(assetsDispose)
      return cleanup
    } catch (error) {
      cleanup()
      throw error
    }
  })
}
