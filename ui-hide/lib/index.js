/**
 * dsh-ui-hide host entry.
 *
 * Serves the user's hide list from `$DSH_HOME/ui-hide.json`. This half only
 * reads and normalizes: it never writes, so a malformed edit can make the page
 * hide less, never break it. The client half turns the answer into one
 * stylesheet.
 *
 * The selector gate is the whole security story here: a selector is pasted into
 * `selector{display:none !important}`, so braces, semicolons and angle brackets
 * must never survive normalization.
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Windows 上用 PowerShell 存过的 JSON 可能带 BOM：先剥掉，否则整份配置会被当成坏的。 */
const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

export const name = 'ui-hide'

const ROUTE_PATH = '/api/ui-hide'
const CONFIG_FILE_NAME = 'ui-hide.json'
const MAX_TARGETS = 200
const FORBIDDEN_IN_SELECTOR = /[{};<>]/

/**
 * Resolve the harness home the way the built-in loader does: a non-blank
 * `$DSH_HOME` wins, otherwise `~/.dsh`.
 */
export function resolveHome() {
  const configured = process.env.DSH_HOME
  const chosen = configured !== undefined && configured.trim().length > 0
    ? configured
    : join(homedir(), '.dsh')
  return chosen === '~' ? homedir() : chosen
}

/** Trim a string field, or return the fallback when it is not a usable string. */
function textField(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

/**
 * Turn raw JSON into the only shape the client half trusts.
 *
 * Invalid entries are dropped rather than reported: the list is a display
 * preference, and a page that hides nothing is better than a page that hides
 * the wrong thing.
 */
export function normalizeConfig(raw) {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const list = Array.isArray(source.targets) ? source.targets : []
  const targets = []
  for (const entry of list) {
    if (targets.length >= MAX_TARGETS) break
    if (entry === null || typeof entry !== 'object') continue
    const selector = typeof entry.selector === 'string' ? entry.selector.trim() : ''
    if (selector === '' || FORBIDDEN_IN_SELECTOR.test(selector)) continue
    targets.push({
      id: textField(entry.id, `target-${targets.length + 1}`),
      selector,
      note: textField(entry.note, ''),
    })
  }
  return { enabled: source.enabled !== false, targets }
}

/** Read the config file; a missing or broken file means "hide nothing". */
export async function readConfigFile(filePath) {
  try {
    return normalizeConfig(JSON.parse(stripBom(await readFile(filePath, 'utf8'))))
  } catch {
    return normalizeConfig({})
  }
}

function jsonResponse(status, payload) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

export function apply(ctx) {
  const home = resolveHome()
  const configPath = join(home, CONFIG_FILE_NAME)
  ctx.inject(['connection'], (host) => {
    const dispose = host.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => jsonResponse(200, await readConfigFile(configPath)),
    })
    if (typeof dispose === 'function') return dispose
  })
}

/** Exported for the offline smoke test only; not part of the runtime surface. */
export const __test__ = { normalizeConfig, readConfigFile, resolveHome }
