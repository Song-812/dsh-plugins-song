/**
 * Offline smoke test for dsh-ui-hide's client half.
 *
 * It loads lib/client.js the way the browser module loader does (a fake
 * `window.__ModuleLoader__`), then calls apply() against a stub page and a stub
 * /api/ui-hide, so the assertions run on the real bundle instead of a rewrite.
 *
 * Run: node test\client-smoke.mjs   (from the plugin folder)
 */
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const CLIENT = new URL('../lib/client.js', import.meta.url)
const STYLE_ID = 'dsh-ui-hide-style'

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log(`PASS  ${name}`)
  else {
    failures += 1
    console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

/** A page minimal enough for the bundle: one head and createElement/getElementById. */
function makePage() {
  const headChildren = []
  const document = {
    head: {
      appendChild(node) {
        headChildren.push(node)
      },
    },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        id: '',
        textContent: '',
        remove() {
          const at = headChildren.indexOf(this)
          if (at >= 0) headChildren.splice(at, 1)
        },
      }
    },
    getElementById(id) {
      return headChildren.find((node) => node.id === id) ?? null
    },
  }
  return { document, headChildren }
}

/** Load the bundle into the given page (a fresh one by default) and return its exports. */
async function loadBundle(fetchImpl, page = makePage()) {
  const code = await readFile(CLIENT, 'utf8')
  let definition = null
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(next) {
          definition = next
        },
      },
    },
    document: page.document,
    fetch: fetchImpl,
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  if (definition === null) throw new Error('bundle did not call __ModuleLoader__.load')
  const exports = definition.factory(() => ({
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  }))
  return { exports, page }
}

/** A context stub with no services: the hide half must work even without slots. */
function makeCtx() {
  return {
    effect: (fn) => fn(),
    inject: (_deps, fn) => fn({ get: () => undefined, effect: (fn2) => fn2() }),
  }
}

/** Run the plugin against a config body on a given page, then let its fetch settle. */
async function applyWith(body, page) {
  const { exports } = await loadBundle(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }), page)
  exports.apply(makeCtx())
  await new Promise((resolve) => setTimeout(resolve, 0))
  const style = page.document.getElementById(STYLE_ID)
  return { exports, style, css: style === null ? null : style.textContent }
}

const first = await loadBundle(async () => ({ ok: false, status: 500, json: async () => ({}) }))
check('bundle 导出 name 与 apply', first.exports.name === 'ui-hide' && typeof first.exports.apply === 'function')

const off = await loadBundle(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ enabled: false, targets: [{ id: 'a', selector: 'button.a' }] }),
}))
{
  off.exports.apply(makeCtx())
  await new Promise((resolve) => setTimeout(resolve, 0))
  const style = off.page.document.getElementById(STYLE_ID)
  check('enabled:false 时样式为空', style !== null && style.textContent === '')
}

{
  const page = makePage()
  const { css } = await applyWith(
    {
      enabled: true,
      targets: [
        { id: 'more', selector: 'nav button[aria-haspopup="menu"]' },
        { id: 'views', selector: 'button[class*="viewsMore"]' },
      ],
    },
    page,
  )
  check(
    '两条合法目标各生成一条 display:none 规则',
    (css.match(/display:\s*none\s*!important/g) ?? []).length === 2 &&
      css.includes('nav button[aria-haspopup="menu"]') &&
      css.includes('button[class*="viewsMore"]'),
    css,
  )
}

{
  const page = makePage()
  const { css } = await applyWith(
    { enabled: true, targets: [{ id: 'bad', selector: 'div{x:y}' }, { id: 'empty', selector: '   ' }] },
    page,
  )
  check('非法选择器不会写进样式表', css === '' || !css.includes('div{x:y}'), css)
}

{
  const page = makePage()
  const { exports } = await loadBundle(async () => {
    throw new Error('network down')
  })
  let threw = null
  try {
    exports.apply(makeCtx())
    await new Promise((resolve) => setTimeout(resolve, 0))
  } catch (error) {
    threw = error
  }
  const style = page.document.getElementById(STYLE_ID)
  check(
    '请求失败时不抛错且不留下规则',
    threw === null && (style === null || style.textContent === ''),
    threw === null ? '' : String(threw),
  )
}

console.log(failures === 0 ? '\n所有检查通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
