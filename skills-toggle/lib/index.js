/**
 * dsh-skills-toggle host entry.
 *
 * Serves the sidebar "技能" page with three things:
 *   1. an inventory of every skill file under the managed roots,
 *   2. a guarded frontmatter setter that turns a skill's model/user
 *      invocation policy on or off,
 *   3. the page's own display preferences (custom titles, group names, row and
 *      group order, collapsed groups) in the state file's `prefs` field.
 *
 * The only file this host half writes besides skill frontmatter is its own
 * state file; the preferences never reach a skill file.
 *
 * The endpoint is registered through Connection's exact Fetch registry, so it
 * sits inside the same /api Host/Origin fence and browser-authentication gate
 * every other Host API method passes through.
 *
 * Facts this file is built on (verified against the shipped packages):
 *   - `@deepseek-ai/dsh-skill-filesystem` requires a leading `---` block whose
 *     `name` and `description` are non-empty strings; anything else and the
 *     skill is silently ignored.
 *   - Invocation policy comes from `disable-model-invocation` (inverse of "the
 *     model may invoke it") and `user-invocable`. An unrecognized value throws,
 *     which drops the WHOLE skill - so "off" and "broken" are different states
 *     and the inventory reports them separately.
 *   - The legacy spellings `disableModelInvocation`, `modelInvocable` and
 *     `userInvocable` are rejected outright.
 *   - Discovery is one level deep: `<root>/<name>/SKILL.md` or `<root>/<name>.md`.
 *
 * Safety properties:
 *   - Only one managed key's own line is ever edited, so BOM, CRLF/LF, quoting
 *     of other values and the body stay byte-exact.
 *   - Writes are staged to a temp file and renamed over the original.
 *   - Every write is read back and re-parsed; any mismatch restores the
 *     previous bytes and reports `reverted` instead of leaving a broken skill.
 */
import { randomBytes } from 'node:crypto'
import { lstat, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** Windows 上用 PowerShell 存过的 JSON 可能带 BOM：先剥掉，否则整份配置会被当成坏的。 */
const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

export const name = 'skills-toggle'

const ROUTE_PATH = '/api/skills-toggle'
const HOME_ENV = 'DSH_HOME'
const HOME_DIR_NAME = '.dsh'
const SKILLS_DIR_NAME = 'skills'
const STATE_FILE_NAME = 'skills-toggle.json'
const MAX_BODY_BYTES = 256 * 1024
const SKILL_FILE = 'SKILL.md'

/**
 * Bounds for the panel's display preferences. The page sends the whole `prefs`
 * object on every save, so the host half is the one place that decides how big
 * it may get; a buggy panel must not be able to bloat the state file.
 */
const MAX_TITLES = 500
const MAX_GROUPS = 50
const MAX_ORDER_ITEMS = 1000
const MAX_KEY_LENGTH = 300
const MAX_NAME_LENGTH = 200
const MAX_PROJECT_ROOTS = 100
const MAX_STATE_FILES = 2000
const MAX_FILE_KEY_LENGTH = 500

/** Frontmatter keys DSH reads for invocation policy, keyed by the UI switch name. */
const MODEL_KEY = 'disable-model-invocation'
const USER_KEY = 'user-invocable'
const KEY_OF = { model: MODEL_KEY, manual: USER_KEY }
/** Legacy spellings that make DSH drop the skill outright. */
const LEGACY_KEYS = ['disableModelInvocation', 'modelInvocable', 'userInvocable']

/**
 * The only accepted managed root is `<anything>/.dsh/skills`.
 *
 * `.agents/skills` is deliberately absent (owner decision, 2026-10-17): that is
 * ChatCut Desktop's own skill folder, and scanning it pulls its 19 chatcut-*
 * skills into the model's catalog (about 2.3k tokens per request) even though
 * DSH no longer reads that directory. Rejecting the root here also blocks the
 * frontmatter writes this panel performs, which is the point: DSH must never
 * rewrite files it does not own.
 */
const ROOT_PARENT_NAMES = new Set(['.dsh'])
/**
 * Official bundled skill roots live in a real, writable directory named
 * `office-skills` (`<install>/resources/runtime/office-skills`), with the skill
 * bundles as its direct children — there is no `skills` component. Managing it
 * lets the panel switch those bundled skills off; without it they only ever
 * appear in the `/` menu and cannot be turned off from this UI. (Packaged skills
 * inside `app.asar` stay out: their files are not writable.)
 */
const BUNDLED_ROOT_BASENAME = 'office-skills'
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * ChatCut skills: the 19 `<name>/SKILL.md` directories the ChatCut desktop app
 * installs under `<agentsHome>/skills`. Two independent signals identify them,
 * and either one is enough:
 *   1. the directory name carries the `chatcut-` prefix, and
 *   2. the directory name appears in the app's own manifest,
 *      `.chatcut-desktop-skills.json`, which sits in that same skills root.
 * The second signal is authoritative when present, because it is written by the
 * app itself; the first keeps recognition working if the manifest is missing.
 * Neither signal ever aliases the skill's frontmatter `name`, which has no
 * prefix (`chatcut-video-gen` declares `name: video-gen`).
 */
const CHATCUT_PREFIX = 'chatcut-'
const CHATCUT_MANIFEST = '.chatcut-desktop-skills.json'
const AGENTS_HOME_ENV = 'DSH_AGENTS_HOME'

/** JSON response with the no-store header the panel expects. */
function jsonResponse(status, payload) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/** Message of a thrown value, for the panel's failure notice. */
function messageOf(error) {
  return String((error && error.message) || error)
}

/** Absolute path is the root itself or a real file/dir under it (no `..` escape). */
function isInsideRoot(root, target) {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))
}

/** realpath that returns null instead of throwing (broken / missing links). */
async function realpathOrNull(target) {
  try {
    return await realpath(target)
  } catch {
    return null
  }
}

/**
 * Atomic replace: write to a sibling temp file, then rename over the target.
 * Used for both forward writes and rollback, so a crash cannot leave a truncated skill.
 */
async function writeFileAtomic(file, content) {
  const staging = `${file}.dsh-skills-toggle.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(staging, content, 'utf8')
    await rename(staging, file)
  } catch (error) {
    try {
      await unlink(staging)
    } catch {
      // Nothing to clean up.
    }
    throw error
  }
}


/** Expand the supported tilde prefixes against the operating-system home. */
function expandHomePath(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the harness home exactly as the built-in loader does: a non-blank
 * $DSH_HOME wins, otherwise ~/.dsh. Inlined on purpose: an external plugin
 * cannot assume `@deepseek-ai/dsh-home-paths` resolves inside the profile.
 */
function resolveHome() {
  const configured = process.env[HOME_ENV]
  const chosen = configured !== undefined && configured.trim().length > 0
    ? configured
    : join(homedir(), HOME_DIR_NAME)
  return resolve(expandHomePath(chosen))
}

/** Resolve the agents home the same way: $DSH_AGENTS_HOME wins, else ~/.agents. */
function resolveAgentsHome() {
  const configured = process.env[AGENTS_HOME_ENV]
  const chosen = configured !== undefined && configured.trim().length > 0
    ? configured
    : join(homedir(), '.agents')
  return resolve(expandHomePath(chosen))
}

//#region frontmatter line surgery

/**
 * Locate the leading frontmatter block and return absolute offsets, so callers
 * can splice without rewriting a byte outside it.
 *
 * Mirrors the harness parser: the first line must be exactly `---` and the
 * block ends at the next line that is exactly `---`.
 *
 * @param text - whole file content.
 * @returns block geometry, or the reason no usable block exists.
 */
function parseFrontmatter(text) {
  const bom = text.startsWith('\uFEFF') ? 1 : 0
  const firstLineEnd = text.indexOf('\n', bom)
  if (firstLineEnd < 0) return { ok: false, reason: 'no-frontmatter' }
  if (text.slice(bom, firstLineEnd).replace(/\r$/, '') !== '---') return { ok: false, reason: 'no-frontmatter' }
  const headerStart = firstLineEnd + 1
  let lineStart = headerStart
  while (lineStart <= text.length) {
    const nextNewline = text.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? text.length : nextNewline
    if (text.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      return {
        ok: true,
        bom,
        headerStart,
        headerEnd: lineStart,
        header: text.slice(headerStart, lineStart),
        eol: text.slice(headerStart, lineEnd).endsWith('\r') ? '\r\n' : '\n',
      }
    }
    if (nextNewline < 0) break
    lineStart = nextNewline + 1
  }
  return { ok: false, reason: 'unterminated-frontmatter' }
}

/**
 * Raw value of ONE top-level `key:` line inside the header, plus any
 * more-indented lines that belong to it as a YAML block value.
 *
 * "Top-level" means the key starts at column zero on purpose: an indented
 * `key:` belongs to a nested map (for example `metadata.user-invocable`) and
 * DSH never reads invocation policy from there, so mistaking it for the real
 * key would make the panel lie about a skill's state.
 *
 * @returns offsets where `start`..`end` is the value span without the final
 *   newline, `fullEnd` includes it, and `line` is the whole span verbatim.
 */
function readHeaderEntry(header, key) {
  const match = new RegExp(`^${key}[ \\t]*:([^\\r\\n]*)`, 'm').exec(header)
  if (match === null) return undefined
  const start = match.index
  let value = match[1].trim()
  let contentEnd = start + match[0].length
  let fullEnd = contentEnd
  const eol = /^(\r\n|\n|\r)/.exec(header.slice(contentEnd))
  if (eol !== null) fullEnd = contentEnd + eol[0].length

  // A YAML block value puts the real value on the following, deeper-indented
  // lines. Absorb them so the span (and any rewrite) covers the whole value.
  if (value === '') {
    const pieces = []
    for (;;) {
      const line = /^([ \t]+[^\r\n]*)/.exec(header.slice(fullEnd))
      if (line === null) break
      pieces.push(line[1].trim())
      contentEnd = fullEnd + line[0].length
      const nextEol = /^(\r\n|\n|\r)/.exec(header.slice(contentEnd))
      fullEnd = contentEnd + (nextEol === null ? 0 : nextEol[0].length)
      if (nextEol === null) break
    }
    if (pieces.length > 0) value = pieces.join(' ')
  }

  return { raw: value, start, end: contentEnd, fullEnd, line: header.slice(start, fullEnd) }
}

/**
 * Every top-level occurrence of a key. YAML rejects duplicate mapping keys, so
 * a file with two of them is already broken and must be reported, not silently
 * half-rewritten.
 */
function findHeaderEntries(header, key) {
  const entries = []
  let offset = 0
  while (offset < header.length) {
    const found = readHeaderEntry(header.slice(offset), key)
    if (found === undefined) break
    if (found.fullEnd <= 0) break
    entries.push({
      ...found,
      start: found.start + offset,
      end: found.end + offset,
      fullEnd: found.fullEnd + offset,
    })
    offset += found.fullEnd
  }
  return entries
}

/** Remove every given span, back to front so earlier offsets stay valid. */
function removeEntries(header, entries) {
  let next = header
  for (const entry of [...entries].reverse()) next = next.slice(0, entry.start) + next.slice(entry.fullEnd)
  return next
}

/**
 * Parse a frontmatter boolean exactly the way the harness does: real booleans,
 * 1/0, and the case-insensitive words true/false, yes/no, on/off. Any other
 * spelling is INVALID (the harness throws and drops the skill), never "false".
 */
function parseBoolean(raw) {
  const match = raw.trim().match(/^(?:"(true|false|yes|no|on|off|1|0)"|'(true|false|yes|no|on|off|1|0)'|(true|false|yes|no|on|off|1|0))(?:[ \t]+#.*)?$/i)
  const value = match ? (match[1] || match[2] || match[3]).toLowerCase() : ''
  if (value === 'true' || value === 'yes' || value === 'on' || value === '1') return { known: true, value: true }
  if (value === 'false' || value === 'no' || value === 'off' || value === '0') return { known: true, value: false }
  return { known: false, value: undefined }
}

/** Invocation state of one managed key inside a header. */
function readKeyState(header, key) {
  const entries = findHeaderEntries(header, key)
  if (entries.length === 0) return { present: false, raw: undefined, invalid: false, off: false, duplicate: false }
  const parsed = parseBoolean(entries[0].raw)
  // `disable-model-invocation: true` and `user-invocable: false` both mean
  // "this capability is unavailable".
  const off = key === MODEL_KEY ? parsed.value === true : parsed.value === false
  return { present: true, raw: entries[0].raw, invalid: !parsed.known, off, duplicate: entries.length > 1 }
}

/**
 * The literal each managed key needs for a given capability state.
 *
 * The two keys point opposite ways - `user-invocable: false` disables, while
 * `disable-model-invocation: true` disables - so every comparison goes through
 * {@link literalState}, never through the literal text.
 */
const KEY_RULES = {
  [MODEL_KEY]: { on: 'false', off: 'true' },
  [USER_KEY]: { on: 'true', off: 'false' },
}

/**
 * What a recorded literal means for a key. Deliberately not a lookup table: a
 * plain object's keys are strings, so indexing one with a boolean silently
 * walks the prototype chain instead of answering the question.
 */
function literalState(key, value) {
  return key === USER_KEY
    ? (value === true ? 'on' : 'off')
    : (value === true ? 'off' : 'on')
}

/**
 * Produce the new file text for one switch change, touching only that key's line.
 *
 * Restoring the recorded original beats writing a literal, because it is the
 * only way a round trip comes back byte-exact for a file whose author wrote the
 * key themselves (different quotes, spacing, or an explicit boolean). The one
 * case a literal cannot express is "the author wrote nothing": there, turning
 * the capability back on removes the line, which is the same default spelled
 * shorter.
 *
 * @param text - current file content.
 * @param key - frontmatter key to write.
 * @param enabled - whether the capability should be available.
 * @param original - recorded original line, for byte-exact restoration.
 * @returns new text plus whether it differs from the input.
 */
function writeKey(text, key, enabled, original) {
  const block = parseFrontmatter(text)
  if (!block.ok) throw new Error(`无法写入：${block.reason === 'no-frontmatter' ? '文件没有 frontmatter' : 'frontmatter 没有结束行'}`)
  const entries = findHeaderEntries(block.header, key)
  const rules = KEY_RULES[key]
  const wanted = enabled ? rules.on : rules.off
  // `disable-model-invocation` spells "on" by being absent: turning it on means
  // the line goes away, and turning it off means writing the literal `true`.
  // `user-invocable` spells both states out, so it always gets a literal.
  // Keeping each key to its own spelling is what makes the round trip exact.
  const removeLine = enabled && key === MODEL_KEY
  let header = block.header

  if (entries.length === 0) {
    if (removeLine) return finish(text, block, header)
    const separator = header === '' || header.endsWith('\n') || header.endsWith('\r') ? '' : block.eol
    header += `${separator}${key}: ${wanted}${block.eol}`
  } else {
    const first = entries[0]
    // Drop any duplicate first: YAML rejects duplicated keys, and leaving one
    // behind would mean the file still disagrees with the switch.
    header = removeEntries(header, entries.slice(1))
    const existed = original !== undefined && original !== null && original.existed === true
    const recorded = existed ? parseBoolean(original.raw) : undefined
    // Restoring the author's own bytes is right whenever turning the key on and the
    // recorded line does not contradict that. Both keys spell their states
    // oppositely, so the check has to go through `literalState` for both of them:
    // `user-invocable: false` is this key's "off" exactly like
    // `disable-model-invocation: true` is the other key's. An author who wrote the
    // off spelling explicitly - a perfectly ordinary thing to do - used to get that
    // line pasted straight back, so the write changed nothing, the read-back
    // disagreed with the switch, and the change was rolled back as
    // "写入后状态与预期不符".
    const recordedOn = recorded !== undefined && recorded !== null
      && recorded.known === true
      && literalState(key, recorded.value) === 'on'
    const restoringOn = enabled && existed && recordedOn
    if (restoringOn) {
      header = header.slice(0, first.start) + original.line + header.slice(first.fullEnd)
    } else if (enabled && !existed) {
      // Turning on a key the author never wrote: absence is that same "on"
      // default, spelled shorter, so the line stays out of the file.
      header = header.slice(0, first.start) + header.slice(first.fullEnd)
    } else {
      header = header.slice(0, first.start) + `${key}: ${wanted}` + header.slice(first.end)
    }
  }

  return finish(text, block, header)
}

/** 显示简介用的 frontmatter 键：DSH 原生技能列表读的就是它。 */
const DESC_KEY = 'description'
/** 自定义简介的长度上限。 */
const MAX_DESC_LENGTH = 500
/**
 * 把注入后的描述拆成两半：`中文翻译。（English original）`。
 * 拆不出来（纯中文 / 纯英文）就返回 null —— 那种描述整段就是原文。
 * 只认全角 `（`：注入用的是全角，而英文原文内部的括号是半角，
 * 这样 book-to-skill 那种「中文（…(PDF, EPUB)…）」的嵌套也不会切错。
 */
/**
 * 去掉 YAML 标量外面的引号。`captureOriginal` 抓到的是原始的 `key: value` 文本，
 * 作者（或我们上一次写入）用引号包过的话，这里就会多出首尾引号 ——
 * 不剥掉的话，靠「结尾是不是全角右括号」做的判定会整个失效。
 */
function unquoteYaml(value) {
  const trimmed = String(value).trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    // 单遍解码：\\ 与 \" 在同一趟扫描里按出现顺序处理。分两遍替换只有在
    // 「先 \" 后 \\」这个特定顺序下才对当前转义字母表碰巧正确，将来多一种
    // 转义或调换顺序都会让「反斜杠紧跟引号」错位（原文 A\\"B 读回 A\"B，
    // 读回校验恒不等 → 简介永远回滚）；单遍没有这个陷阱。
    return trimmed.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'")
  }
  return trimmed
}

function splitInjectedDescription(raw) {
  const trimmed = unquoteYaml(raw)
  if (!trimmed.endsWith('）')) return null
  const open = trimmed.lastIndexOf('（')
  if (open <= 0) return null
  const chinese = trimmed.slice(0, open).trim()
  const original = trimmed.slice(open + 1, -1).trim()
  if (chinese === '' || original === '') return null
  if (!/[\u4e00-\u9fa5]/.test(chinese)) return null
  if (!/[A-Za-z]{4,}/.test(original)) return null
  return { chinese, original }
}

/**
 * 取「要保留在括号里的原文」：能拆出英文原文就用它，否则整段原描述。
 * 无论走哪条路，模型的触发线索都被完整留下来。
 */
function readOriginal(raw) {
  const parts = splitInjectedDescription(raw)
  if (parts !== null) return parts.original
  const trimmed = unquoteYaml(raw)
  return trimmed === '' ? null : trimmed
}

/** Encode one value as a safe single-line YAML double-quoted scalar. */
function yamlScalar(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`
}

/**
 * 写入一行 description。custom 为空时写纯原文（= 顶掉注入的中文）。
 *
 * @param text - current file content.
 * @param custom - the user's own description, or '' to fall back to the original.
 * @param original - the original text to keep inside the parentheses.
 * @returns new text plus whether it differs from the input.
 */
function writeDescription(text, custom, original) {
  const block = parseFrontmatter(text)
  if (!block.ok) throw new Error(`无法写入：${block.reason === 'no-frontmatter' ? '文件没有 frontmatter' : 'frontmatter 没有结束行'}`)
  const entries = findHeaderEntries(block.header, DESC_KEY)
  const value = custom === '' ? original : `${custom}（${original}）`
  const line = `${DESC_KEY}: ${yamlScalar(value)}`
  let header = block.header
  if (entries.length === 0) {
    const separator = header === '' || header.endsWith('\n') || header.endsWith('\r') ? '' : block.eol
    header += `${separator}${line}${block.eol}`
  } else {
    const first = entries[0]
    header = removeEntries(header, entries.slice(1))
    header = header.slice(0, first.start) + line + header.slice(first.end)
  }
  return finish(text, block, header)
}

/**
 * 写一个技能的自定义简介：临时文件 + rename、读回校验、不符即回滚 ——
 * 与 applyChange 同一套，失败绝不会让技能变得读不出来。
 */
async function applyDescription(home, state, change, roots) {
  if (typeof change.file !== 'string' || !(await isManagedSkillFile(change.file, roots))) {
    return { status: 'error', file: change.file, message: '拒绝写入：目标不是受管技能目录里的技能文件' }
  }
  const file = resolve(change.file)
  const raw = change.description
  if (raw !== null && raw !== undefined && typeof raw !== 'string') {
    return { status: 'error', file, message: 'description 必须是字符串，或用 null 表示清空' }
  }
  const custom = raw === null || raw === undefined ? '' : raw.trim()
  if (custom.length > MAX_DESC_LENGTH) return { status: 'error', file, message: `简介太长（上限 ${MAX_DESC_LENGTH} 字）` }

  let before
  try {
    before = await readFile(file, 'utf8')
  } catch (error) {
    return { status: 'error', file, message: `读取失败: ${messageOf(error)}` }
  }

  // 多行块标量（`description: |`）拿不到可靠原文：readHeaderEntry 只吸收「值完全为空」的情况，
  // 于是 `|` 会被当成正文，空保存就把描述写成字符串 "|"，整段丢失。
  // 这种形态一律拒绝改写 —— 宁可不改，也不能把作者的描述弄丢。
  // 块标量的写法不止 `|`：`|2`（缩进指示符）、`| # 注释`、`>+` 都算。漏掉一种，
  // 就会只替换首行、把缩进正文留在原地，生成坏 YAML —— 所以整类一律拒绝。
  // 只要值的开头是 | 或 > 就是块标量（`|2-`、`>2+`、`description : |`、带注释都算），
  // 这类一律不改写：只替首行会把缩进正文留在原地，生成坏 YAML。
  if (/^[ \t]*description[ \t]*:[ \t]*[|>]/m.test(before)) {
    return { status: 'error', file, message: '这个技能的描述是多行块（description: |），面板不改写它' }
  }

  const current = captureOriginal(before, DESC_KEY)
  if (current === null) return { status: 'error', file, message: '读不到 frontmatter，放弃改写' }
  const original = readOriginal(current.existed ? current.raw : '')
  if (original === null) return { status: 'error', file, message: '这个技能没有可保留的描述，放弃改写' }

  const wanted = custom === '' ? original : `${custom}（${original}）`
  let next
  try {
    next = writeDescription(before, custom, original)
  } catch (error) {
    return { status: 'error', file, message: messageOf(error) }
  }

  if (next.changed) {
    try {
      await writeFileAtomic(file, next.text)
    } catch (error) {
      return { status: 'error', file, message: `写入失败: ${messageOf(error)}` }
    }
  }

  // Verify by reading the file back, never by trusting the buffer.
  const where = locate(file, home)
  const verified = await readSkill(file, where.root, where.source)
  if (verified.description !== wanted) {
    if (next.changed) {
      try {
        await writeFileAtomic(file, before)
      } catch (error) {
        return { status: 'error', file, message: `校验未通过，且回滚失败: ${messageOf(error)}`, skill: verified }
      }
    }
    return { status: 'reverted', file, message: '写入后 description 与预期不符，已回滚', skill: verified }
  }

  const entry = state.files[file] !== undefined ? state.files[file] : (state.files[file] = {})
  entry.desc = { existed: true, raw: original, line: null, custom }
  entry.updatedAt = Date.now()

  return { status: next.changed ? 'applied' : 'unchanged', file, description: verified.description, skill: verified }
}

/** Splice an edited header back into the file text. */
function finish(text, block, header) {
  const next = text.slice(0, block.headerStart) + header + text.slice(block.headerEnd)
  return { text: next, changed: next !== text }
}

/** Record what a key looked like before we ever touched it. */
function captureOriginal(text, key) {
  const block = parseFrontmatter(text)
  if (!block.ok) return null
  const entries = findHeaderEntries(block.header, key)
  if (entries.length === 0) return { existed: false, raw: null, line: null }
  return { existed: true, raw: entries[0].raw, line: entries[0].line }
}

//#endregion

//#region inventory

/** Plain field value from the header, decoded the way the harness decodes it. */
function headerText(header, key) {
  const entry = readHeaderEntry(header, key)
  if (entry === undefined || entry.raw.length === 0) return undefined
  // 写入端用双引号标量并转义 \\ 与 \"；这里必须用同一套解码（unquoteYaml），
  // 否则读回来的和写出去的差一个转义层级，带引号/反斜杠的简介会被误判成“写坏了”而回滚。
  return unquoteYaml(entry.raw)
}

/** The skill's own name: the frontmatter value, else the file/directory name. */
function fallbackName(file) {
  return basename(file) === SKILL_FILE ? basename(dirname(file)) : basename(file, '.md')
}

/**
 * Read one skill file into an inventory record.
 * `problems` are conditions that make DSH drop the skill; `notes` are advisory.
 */
async function readSkill(file, root, source) {
  const problems = []
  const notes = []
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    return {
      file, root, source,
      name: fallbackName(file),
      description: '',
      loadable: false,
      problems: [`读取失败: ${messageOf(error)}`],
      notes,
      model: { present: false, invalid: false, off: false },
      manual: { present: false, invalid: false, off: false },
    }
  }

  const block = parseFrontmatter(text)
  if (!block.ok) {
    return {
      file, root, source,
      name: fallbackName(file),
      description: '',
      loadable: false,
      problems: [block.reason === 'no-frontmatter'
        ? '缺少 frontmatter，DSH 会忽略这个技能'
        : 'frontmatter 缺少结束的 --- 行，DSH 会忽略这个技能'],
      notes,
      model: { present: false, invalid: false, off: false },
      manual: { present: false, invalid: false, off: false },
    }
  }

  const name = headerText(block.header, 'name')
  const description = headerText(block.header, 'description')
  if (name === undefined) problems.push('frontmatter 缺少 name，DSH 会忽略这个技能')
  else if (!SKILL_NAME_PATTERN.test(name)) problems.push(`name「${name}」不是合法的小写连字符名，DSH 会忽略这个技能`)
  if (description === undefined) problems.push('frontmatter 缺少 description，DSH 会忽略这个技能')
  if (name !== undefined && name !== fallbackName(file)) {
    notes.push(`frontmatter 的 name 与${basename(file) === SKILL_FILE ? '目录' : '文件'}名不一致（DSH 以 frontmatter 为准）`)
  }

  const rawDescriptionEntry = readHeaderEntry(block.header, 'description')
  const displayDescription = description === undefined
    ? ''
    : rawDescriptionEntry !== undefined && /^[|>]/.test(rawDescriptionEntry.raw)
      ? '（多行描述）'
      : description

  for (const legacy of LEGACY_KEYS) {
    if (readHeaderEntry(block.header, legacy) !== undefined) {
      problems.push(`用了废弃的键名「${legacy}」，DSH 会直接丢弃整个技能`)
    }
  }

  const model = readKeyState(block.header, MODEL_KEY)
  const manual = readKeyState(block.header, USER_KEY)
  if (model.invalid) problems.push(`disable-model-invocation 的值「${model.raw}」无法识别，整个技能会被丢弃`)
  if (manual.invalid) problems.push(`user-invocable 的值「${manual.raw}」无法识别，整个技能会被丢弃`)
  if (model.duplicate) problems.push('disable-model-invocation 在 frontmatter 里出现了多次，YAML 会拒绝这份文件')
  if (manual.duplicate) problems.push('user-invocable 在 frontmatter 里出现了多次，YAML 会拒绝这份文件')
  if (model.present && !model.invalid && model.off) notes.push('技能文件自己关掉了模型调用')
  if (manual.present && !manual.invalid && manual.off) notes.push('技能文件自己关掉了手动调用')

  return {
    file, root, source,
    name: name !== undefined ? name : fallbackName(file),
    description: displayDescription,
    loadable: problems.length === 0,
    problems,
    notes,
    model: { present: model.present, invalid: model.invalid, off: model.off },
    manual: { present: manual.present, invalid: manual.invalid, off: manual.off },
  }
}

/** Enumerate one managed root, one level deep, the way DSH discovers skills. */
async function scanRoot(root, source) {
  const skills = []
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return { skills, missing: true }
    return { skills, missing: false, error: messageOf(error) }
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    // Never follow directory/file symlinks out of a managed root.
    if (typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      const skillDir = join(root, entry.name)
      try {
        const dirMeta = await lstat(skillDir)
        if (dirMeta.isSymbolicLink()) continue
      } catch {
        continue
      }
      const file = join(skillDir, SKILL_FILE)
      try {
        const info = await lstat(file)
        if (info.isSymbolicLink()) continue
        if (info.isFile()) skills.push(await readSkill(file, root, source))
      } catch {
        // A directory without SKILL.md is not a skill; DSH ignores it too.
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const file = join(root, entry.name)
      try {
        const info = await lstat(file)
        if (info.isSymbolicLink()) continue
        if (info.isFile()) skills.push(await readSkill(file, root, source))
      } catch {
        // Unreadable entry — skip.
      }
    }
  }
  skills.sort((left, right) => left.name.localeCompare(right.name))
  return { skills, missing: false }
}

/** Reject any root that is not a recognized skills directory. */
function isManagedRoot(root) {
  const absolute = resolve(root)
  const base = basename(absolute)
  // Official bundled skills only: `<install>/resources/runtime/office-skills`.
  // A random folder that merely happens to be named office-skills is not managed.
  if (base === BUNDLED_ROOT_BASENAME) {
    return basename(dirname(absolute)) === 'runtime' && basename(dirname(dirname(absolute))) === 'resources'
  }
  if (base !== SKILLS_DIR_NAME) return false
  return ROOT_PARENT_NAMES.has(basename(dirname(absolute)))
}

/** Reject any target file that is not a skill file directly inside a managed root (roots 已由调用方过白名单，userRoot 例外). */
/** Structural placement under a managed root (resolved paths, no symlink follow). */
function isStructurallyManagedSkillFile(absolute, roots) {
  const name = basename(absolute)
  const parent = dirname(absolute)
  if (name !== SKILL_FILE && !name.toLowerCase().endsWith('.md')) return false
  for (const root of roots) {
    const rootAbsolute = resolve(root)
    if (name === SKILL_FILE) {
      if (dirname(parent) === rootAbsolute && !basename(parent).startsWith('.')) return true
    } else if (parent === rootAbsolute) {
      return true
    }
  }
  return false
}

/**
 * Reject any target that is not a skill file inside a managed root.
 * Also requires the realpath (symlink-resolved) to stay under a real managed root,
 * so a directory symlink inside `skills/` cannot redirect writes outside.
 */
async function isManagedSkillFile(file, roots) {
  const absolute = resolve(file)
  if (!isStructurallyManagedSkillFile(absolute, roots)) return false
  const realFile = await realpathOrNull(absolute)
  if (realFile === null) return false
  // Skill-dir symlink: structural path is under root, but real file may escape.
  for (const root of roots) {
    const realRoot = await realpathOrNull(resolve(root))
    if (realRoot === null) continue
    if (!isInsideRoot(realRoot, realFile)) continue
    if (isStructurallyManagedSkillFile(realFile, [realRoot])) return true
  }
  return false
}

/** Which managed root owns a file, and whether it is a user or project skill. */
function locate(file, home) {
  const absolute = resolve(file)
  const userRoot = resolve(join(home, SKILLS_DIR_NAME))
  const root = basename(absolute) === SKILL_FILE ? dirname(dirname(absolute)) : dirname(absolute)
  return { root, source: root === userRoot ? 'user' : 'project' }
}

/**
 * Which skills count as ChatCut skills in this scan.
 *
 * The app's manifest wins when it can be read, because it is the app's own
 * statement of what it installed; the `chatcut-` directory prefix is the
 * fallback. The result is a set of absolute skill-file paths, which is the only
 * identifier the scan and the panel already agree on (frontmatter names are
 * unprefixed, and a ChatCut name may collide with a user skill's name).
 */
async function chatcutSkillFiles(home, skills) {
  const skillsRoot = join(resolveAgentsHome(), SKILLS_DIR_NAME)
  const manifestPath = join(skillsRoot, CHATCUT_MANIFEST)
  const fromPrefix = skills
    .filter((skill) => skill.root === skillsRoot && basename(skill.file) === SKILL_FILE && basename(dirname(skill.file)).toLowerCase().startsWith(CHATCUT_PREFIX))
    .map((skill) => skill.file)

  let manifestNames
  let manifestError
  try {
    const parsed = JSON.parse(stripBom(await readFile(manifestPath, 'utf8')))
    const entries = parsed !== null && typeof parsed === 'object' ? parsed.entries : undefined
    if (entries !== null && typeof entries === 'object') {
      manifestNames = Object.keys(entries).filter((item) => item.toLowerCase().startsWith(CHATCUT_PREFIX))
    } else {
      manifestError = '清单里没有 entries 对象'
    }
  } catch (error) {
    manifestError = error && error.code === 'ENOENT' ? '清单文件不存在' : messageOf(error)
  }

  if (manifestNames === undefined) {
    return {
      files: new Set(fromPrefix),
      report: { root: skillsRoot, manifest: manifestPath, manifestNames: 0, error: manifestError, by: 'prefix', files: fromPrefix.length },
    }
  }

  const wanted = new Set(manifestNames.map((item) => item.toLowerCase()))
  const fromManifest = skills
    .filter((skill) => skill.root === skillsRoot && basename(skill.file) === SKILL_FILE && wanted.has(basename(dirname(skill.file)).toLowerCase()))
    .map((skill) => skill.file)
  // The union matters: a ChatCut skill the app has not written into the manifest
  // yet is still a ChatCut skill, and a manifest entry whose directory is
  // currently missing simply contributes nothing.
  const files = new Set([...fromManifest, ...fromPrefix])
  return {
    files,
    report: { root: skillsRoot, manifest: manifestPath, manifestNames: manifestNames.length, error: undefined, by: 'manifest', files: files.size },
  }
}

//#endregion

//#region state

/** The panel's own display preferences: every map bounded and empty by default. */
function defaultPrefs() {
  return { titles: {}, groupTitles: {}, order: {}, collapsed: {}, descs: {} }
}

/** Preference keys are skill file paths or group ids, so they are bounded too. */
function isValidPrefKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH
}

/** A `{ key: "name" }` map: values trimmed, non-empty, truncated, and counted. */
function sanitizeNames(raw, limit) {
  const out = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  let kept = 0
  for (const [key, value] of Object.entries(raw)) {
    if (kept >= limit) break
    if (!isValidPrefKey(key) || typeof value !== 'string') continue
    const name = value.trim().slice(0, MAX_NAME_LENGTH)
    if (name === '') continue
    out[key] = name
    kept += 1
  }
  return out
}

/**
 * Keep only the panel's own display preferences, strictly:
 *   - `titles`       file -> custom name (<= 500 entries, names <= 200 chars)
 *   - `groupTitles`  group id -> group name (<= 50 entries, names <= 200 chars)
 *   - `order`        group id -> file list (<= 50 groups, <= 1000 items, each
 *                    a non-empty string <= 300 chars); the reserved key
 *                    `__groups__` carries the group order itself
 *   - `collapsed`    group id -> true (<= 50 entries; `false` is simply absent)
 * Anything else - unknown fields, other types, over-long strings - is dropped.
 */
function sanitizePrefs(raw) {
  const out = defaultPrefs()
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  out.titles = sanitizeNames(raw.titles, MAX_TITLES)
  out.descs = sanitizeNames(raw.descs, MAX_TITLES)
  out.groupTitles = sanitizeNames(raw.groupTitles, MAX_GROUPS)
  if (raw.order !== null && typeof raw.order === 'object' && !Array.isArray(raw.order)) {
    let groups = 0
    for (const [key, value] of Object.entries(raw.order)) {
      if (groups >= MAX_GROUPS) break
      if (!isValidPrefKey(key) || !Array.isArray(value)) continue
      out.order[key] = value
        .filter((item) => typeof item === 'string' && item.length > 0 && item.length <= MAX_KEY_LENGTH)
        .slice(0, MAX_ORDER_ITEMS)
      groups += 1
    }
  }
  if (raw.collapsed !== null && typeof raw.collapsed === 'object' && !Array.isArray(raw.collapsed)) {
    let kept = 0
    for (const [key, value] of Object.entries(raw.collapsed)) {
      if (kept >= MAX_GROUPS) break
      if (!isValidPrefKey(key) || value !== true) continue
      out.collapsed[key] = true
      kept += 1
    }
  }
  // The knob's remembered direction, per section. Both booleans are kept: `false`
  // means "remembered off", which a truthiness check would silently turn into
  // "never clicked". The field only appears when a knob was actually clicked, so a
  // state file that never used it keeps its old shape.
  if (raw.bulk !== null && typeof raw.bulk === 'object' && !Array.isArray(raw.bulk)) {
    const kept = {}
    let count = 0
    for (const [key, value] of Object.entries(raw.bulk)) {
      if (count >= MAX_GROUPS) break
      if (!isValidPrefKey(key) || (value !== true && value !== false)) continue
      kept[key] = value
      count += 1
    }
    if (count > 0) out.bulk = kept
  }
  return out
}


/** Bound and scrub the original-bytes ledger so junk fields cannot bloat the state file. */
function sanitizeFiles(raw) {
  const out = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  let kept = 0
  for (const [key, value] of Object.entries(raw)) {
    if (kept >= MAX_STATE_FILES) break
    if (typeof key !== 'string' || key.length === 0 || key.length > MAX_FILE_KEY_LENGTH) continue
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = {}
    for (const switchKey of ['model', 'manual']) {
      const rec = value[switchKey]
      if (rec !== null && typeof rec === 'object' && !Array.isArray(rec)) {
        entry[switchKey] = {
          existed: rec.existed === true,
          raw: typeof rec.raw === 'string' ? rec.raw.slice(0, 500) : null,
          line: typeof rec.line === 'string' ? rec.line.slice(0, 500) : null,
        }
      }
    }
    if (value.desc !== null && typeof value.desc === 'object' && !Array.isArray(value.desc)) {
      entry.desc = {
        existed: value.desc.existed === true,
        raw: typeof value.desc.raw === 'string' ? value.desc.raw.slice(0, MAX_DESC_LENGTH) : null,
        line: typeof value.desc.line === 'string' ? value.desc.line.slice(0, 500) : null,
        custom: typeof value.desc.custom === 'string' ? value.desc.custom.slice(0, MAX_DESC_LENGTH) : '',
      }
    }
    if (typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)) {
      entry.updatedAt = value.updatedAt
    }
    if (Object.keys(entry).length === 0) continue
    out[key] = entry
    kept += 1
  }
  return out
}

/** Remembered project roots: managed only, unique, capped. */
function sanitizeProjectRoots(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    if (out.length >= MAX_PROJECT_ROOTS) break
    if (typeof item !== 'string' || item.length === 0 || item.length > MAX_KEY_LENGTH) continue
    let absolute
    try {
      absolute = resolve(expandHomePath(item))
    } catch {
      continue
    }
    if (!isManagedRoot(absolute) || seen.has(absolute)) continue
    seen.add(absolute)
    out.push(absolute)
  }
  return out
}

/** Load the small state file that remembers edits, seen roots and preferences. */
async function loadState(home) {
  try {
    const parsed = JSON.parse(stripBom(await readFile(join(home, STATE_FILE_NAME), 'utf8')))
    if (parsed !== null && typeof parsed === 'object') {
      const prefs = sanitizePrefs(parsed.prefs)
      // Migration, one way only: the ChatCut section's collapsed flag used to be
      // a top-level `chatcutCollapsed`. Its one real home is now
      // `prefs.collapsed.chatcut`, but a state file written before this version
      // still carries the old field, so it is read back into the new place
      // instead of being dropped. `saveState` keeps the old field mirrored, so
      // nothing that reads the old shape loses anything either.
      if (prefs.collapsed.chatcut !== true && parsed.chatcutCollapsed === true) prefs.collapsed.chatcut = true
      return {
        version: 1,
        files: sanitizeFiles(parsed.files),
        projectRoots: sanitizeProjectRoots(parsed.projectRoots),
        prefs,
        chatcutCollapsed: prefs.collapsed.chatcut === true,
        chatcutToggle: parsed.chatcutToggle !== null && typeof parsed.chatcutToggle === 'object' ? parsed.chatcutToggle : {},
        diagnostics: parsed.diagnostics !== null && typeof parsed.diagnostics === 'object' ? parsed.diagnostics : {},
      }
    }
  } catch {
    // Missing or unreadable state simply means "nothing remembered yet".
  }
  return { version: 1, files: {}, projectRoots: [], prefs: defaultPrefs(), chatcutCollapsed: false, chatcutToggle: {}, diagnostics: {} }
}

/**
 * One write chain per home. A read-modify-write cycle on a single JSON file is
 * not atomic, and this host half has several writers (the request breadcrumbs,
 * the frontmatter bookkeeping and the panel's preferences), so both the
 * breadcrumbs and the preferences are serialised through this queue: a GET that
 * merely reports "I loaded" must never overwrite a preference saved a moment
 * earlier. `handle` takes the same chain, which makes a whole request one
 * atomic read-modify-write.
 */
const writeChains = new Map()

function queueWrite(home, task) {
  const previous = writeChains.get(home) ?? Promise.resolve()
  const next = previous.then(task, task)
  writeChains.set(home, next.then(() => undefined, () => undefined))
  return next
}

/**
 * Persist the state file, best effort: a failure must not break a toggle.
 * Always called from inside a `queueWrite` section, never on its own.
 */
async function saveState(home, state) {
  const prefs = sanitizePrefs(state.prefs)
  const files = sanitizeFiles(state.files)
  const projectRoots = sanitizeProjectRoots(state.projectRoots)
  // Keep the in-memory copy trimmed too, so a long-lived process does not grow forever.
  state.files = files
  state.projectRoots = projectRoots
  const payload = `${JSON.stringify({
    version: 1,
    files,
    projectRoots,
    // The panel's display preferences live under `prefs`. The old top-level
    // `chatcutCollapsed` is kept as a mirror of `prefs.collapsed.chatcut` so an
    // older client half keeps honouring the section's fold.
    chatcutCollapsed: prefs.collapsed.chatcut === true,
    chatcutToggle: state.chatcutToggle !== null && typeof state.chatcutToggle === 'object' ? state.chatcutToggle : {},
    prefs,
    diagnostics: state.diagnostics,
  }, null, 2)}\n`
  // 原子写：直接覆盖会先截断，写一半失败就把整份记忆（含原文还原记录）弄没。
  const file = join(home, STATE_FILE_NAME)
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temp, payload, 'utf8')
    await rename(temp, file)
    return true
  } catch {
    try {
      await unlink(temp)
    } catch {
      // 临时文件可能压根没建出来。
    }
    return false
  }
}

//#endregion

//#region actions

/** Build the inventory for the user root plus every requested/remembered project root. */
async function buildInventory(home, requestedRoots, state) {
  const userRoot = resolve(join(home, SKILLS_DIR_NAME))
  const roots = [{ root: userRoot, source: 'user' }]
  const seen = new Set([userRoot])
  const rejected = []

  for (const candidate of [...requestedRoots, ...state.projectRoots]) {
    if (typeof candidate !== 'string' || candidate.length === 0) continue
    const absolute = resolve(expandHomePath(candidate))
    if (seen.has(absolute)) continue
    seen.add(absolute)
    if (!isManagedRoot(absolute)) {
      rejected.push(candidate)
      continue
    }
    roots.push({ root: absolute, source: 'project' })
  }

  const skills = []
  const rootReports = []
  for (const item of roots) {
    const report = await scanRoot(item.root, item.source)
    rootReports.push({ root: item.root, source: item.source, missing: report.missing === true, error: report.error })
    for (const skill of report.skills) {
      const recorded = state.files[skill.file]
      skill.edited = recorded !== undefined
      skill.editedAt = recorded !== undefined && typeof recorded.updatedAt === 'number' ? recorded.updatedAt : undefined
      // 面板里写过的自定义简介：只存在状态文件里，界面用它预填输入框（没写过就是 undefined）。
      skill.descCustom = recorded !== undefined && recorded.desc !== undefined && typeof recorded.desc.custom === 'string'
        ? recorded.desc.custom
        : undefined
      skills.push(skill)
    }
  }

  // Tag every ChatCut skill, so the panel can lift them out of their root's
  // group into their own section without re-deriving the rule itself.
  const chatcut = await chatcutSkillFiles(home, skills)
  for (const skill of skills) skill.chatcut = chatcut.files.has(skill.file)

  return {
    userRoot,
    roots: rootReports,
    skills,
    rejected,
    chatcut: { ...chatcut.report, count: skills.filter((skill) => skill.chatcut === true).length },
  }
}

/**
 * Flip one switch with a staged write, a read-back verification and a rollback
 * on any mismatch, so a failure can never leave a skill unreadable.
 */
async function applyChange(home, state, change, roots) {
  const key = KEY_OF[change.key]
  if (key === undefined) return { status: 'error', file: change.file, message: `未知开关: ${String(change.key)}` }
  if (typeof change.enabled !== 'boolean') return { status: 'error', file: change.file, message: 'enabled 必须是布尔值' }
  if (typeof change.file !== 'string' || !(await isManagedSkillFile(change.file, roots))) {
    return { status: 'error', file: change.file, message: '拒绝写入：目标不是受管技能目录里的技能文件' }
  }
  const file = resolve(change.file)

  let before
  try {
    before = await readFile(file, 'utf8')
  } catch (error) {
    return { status: 'error', file, key: change.key, message: `读取失败: ${messageOf(error)}` }
  }

  const recorded = state.files[file] !== undefined ? state.files[file][change.key] : undefined
  const original = recorded !== undefined && recorded !== null ? recorded : captureOriginal(before, key)

  let next
  try {
    next = writeKey(before, key, change.enabled, original)
  } catch (error) {
    return { status: 'error', file, key: change.key, message: messageOf(error) }
  }

  if (next.changed) {
    // 恢复记录必须先落盘；否则技能已改动却无法在下一次操作时还原原写法。
    const previousEntry = state.files[file]
    state.files[file] = {
      ...(previousEntry ?? {}),
      [change.key]: original !== undefined && original !== null ? original : { existed: false, raw: null, line: null },
      updatedAt: Date.now(),
    }
    const expectedRecord = state.files[file][change.key]
    const safeRecord = sanitizeFiles(state.files)[file]?.[change.key]
    const recordFits = safeRecord !== undefined
      && safeRecord.existed === expectedRecord.existed
      && safeRecord.raw === expectedRecord.raw
      && safeRecord.line === expectedRecord.line
    if (!recordFits || !(await saveState(home, state))) {
      if (previousEntry === undefined) delete state.files[file]
      else state.files[file] = previousEntry
      return { status: 'error', file, key: change.key, message: '状态记录无法完整保存，未修改技能文件' }
    }
    try {
      await writeFileAtomic(file, next.text)
    } catch (error) {
      return { status: 'error', file, key: change.key, message: `写入失败: ${messageOf(error)}` }
    }
  }

  // Verify by reading the file back and re-parsing it, never by trusting the buffer.
  const where = locate(file, home)
  const verified = await readSkill(file, where.root, where.source)
  const actualOff = change.key === 'model' ? verified.model.off : verified.manual.off
  const invalid = change.key === 'model' ? verified.model.invalid : verified.manual.invalid
  const wantedOff = change.enabled === false

  if (invalid || actualOff !== wantedOff) {
    if (next.changed) {
      try {
        await writeFileAtomic(file, before)
      } catch (error) {
        return { status: 'error', file, key: change.key, message: `校验未通过，且回滚失败: ${messageOf(error)}`, skill: verified }
      }
    }
    return {
      status: 'reverted',
      file,
      key: change.key,
      message: invalid
        ? '写入后 frontmatter 无法识别，已回滚以免整个技能被丢弃'
        : '写入后状态与预期不符，已回滚',
      skill: verified,
    }
  }

  const entry = state.files[file] !== undefined ? state.files[file] : (state.files[file] = {})
  entry[change.key] = original !== undefined && original !== null ? original : { existed: false, raw: null, line: null }
  entry.updatedAt = Date.now()

  return { status: next.changed ? 'applied' : 'unchanged', file, key: change.key, skill: verified }
}

//#endregion

/** Read and size-check a JSON request body. */
async function readBody(request) {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('请求体过大')
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('请求体过大')
  const parsed = JSON.parse(stripBom(text))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('请求体必须是对象')
  return parsed
}

/**
 * Best-effort diagnostic breadcrumb. It records when the host half was loaded
 * and what the panel last asked for, which is exactly what tells a maintainer
 * whether the plugin is really running instead of silently skipped.
 */
async function noteLoad(home) {
  return queueWrite(home, async () => {
    try {
      const state = await loadState(home)
      state.diagnostics = {
        ...state.diagnostics,
        loadedAt: new Date().toISOString(),
        loadedRoute: ROUTE_PATH,
        home,
      }
      await saveState(home, state)
    } catch {
      // Diagnostics must never be able to break the plugin.
    }
  })
}

/**
 * Serve one panel request. Connection already applied the fence and
 * authentication. The whole read-modify-write cycle runs inside the home's
 * write chain, so two concurrent requests can never interleave their loads and
 * saves and lose one another's changes.
 */
function handle(request, home) {
  return queueWrite(home, () => handleRequest(request, home))
}

async function handleRequest(request, home) {
  // The route is registered for GET and POST only, so this is a belt-and-braces
  // guard: a method this handler does not understand is refused instead of being
  // mistaken for a body-carrying POST.
  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse(405, { error: 'only GET and POST are supported' })
  }
  const state = await loadState(home)

  if (request.method === 'GET') {
    // Read-only: do not rewrite the state file on every panel open / poll.
    const inventory = await buildInventory(home, [], state)
    return jsonResponse(200, { ok: true, ...inventory, prefs: state.prefs, chatcutCollapsed: state.prefs.collapsed.chatcut === true })
  }

  let body
  try {
    body = await readBody(request)
  } catch (error) {
    return jsonResponse(400, { error: messageOf(error) })
  }

  state.diagnostics = {
    ...state.diagnostics,
    lastCallAt: new Date().toISOString(),
    lastMethod: request.method,
  }

  const requested = Array.isArray(body.roots) ? body.roots.filter((item) => typeof item === 'string') : []

  // Remember every project root the panel reports, so a project whose skills are
  // all switched off can still be listed - and switched back on - later.
  // Cap + scrub via sanitizeProjectRoots on save; also refuse to grow past the max here.
  let remembered = false
  const userRoot = resolve(join(home, SKILLS_DIR_NAME))
  for (const candidate of requested) {
    const absolute = resolve(expandHomePath(candidate))
    if (!isManagedRoot(absolute) || absolute === userRoot) continue
    if (state.projectRoots.includes(absolute)) continue
    if (state.projectRoots.length >= MAX_PROJECT_ROOTS) break
    state.projectRoots.push(absolute)
    remembered = true
  }
  state.diagnostics.lastAction = typeof body.action === 'string' ? body.action : undefined
  if (remembered) await saveState(home, state)

  if (body.action === 'list') {
    const inventory = await buildInventory(home, requested, state)
    state.diagnostics.lastInventory = { skills: inventory.skills.length, roots: inventory.roots.length }
    await saveState(home, state)
    return jsonResponse(200, { ok: true, ...inventory, prefs: state.prefs, chatcutCollapsed: state.prefs.collapsed.chatcut === true })
  }

  if (body.action === 'apply') {
    const changes = Array.isArray(body.changes) ? body.changes : []
    if (changes.length === 0) return jsonResponse(400, { error: 'changes 不能为空' })
    if (changes.length > 200) return jsonResponse(400, { error: '一次最多处理 200 项' })
    const roots = [...new Set([
      userRoot,
      ...requested.map((item) => resolve(expandHomePath(item))).filter(isManagedRoot),
      ...state.projectRoots.filter(isManagedRoot),
    ])]
    const results = []
    for (const change of changes) {
      // Each change re-reads from disk, so a batch can never act on stale bytes.
      results.push(await applyChange(home, state, change, roots))
    }
    await saveState(home, state)
    const inventory = await buildInventory(home, requested, state)
    return jsonResponse(200, { ok: true, results, ...inventory, prefs: state.prefs, chatcutCollapsed: state.prefs.collapsed.chatcut === true })
  }

  if (body.action === 'desc') {
    // 简介写进技能自己的 frontmatter：DSH 原生技能列表读的就是 description，
    // 所以内置的 `/` 面板会跟着变；原文留在括号里，模型判断不受影响。
    const roots = [...new Set([
      userRoot,
      ...requested.map((item) => resolve(expandHomePath(item))).filter(isManagedRoot),
      ...state.projectRoots.filter(isManagedRoot),
    ])]
    const result = await applyDescription(home, state, body, roots)
    await saveState(home, state)
    const inventory = await buildInventory(home, requested, state)
    return jsonResponse(200, { ok: true, result, ...inventory, prefs: state.prefs, chatcutCollapsed: state.prefs.collapsed.chatcut === true })
  }

  if (body.action === 'prefs') {
    // A pure panel preference: it never touches a skill file. The panel sends
    // the whole object, so the host half replaces its copy instead of merging -
    // that is what makes "restore defaults" (an all-empty object) work.
    state.prefs = sanitizePrefs(body.prefs)
    state.chatcutCollapsed = state.prefs.collapsed.chatcut === true
    // 偏好是用户亲手改的：写不进去必须报失败，不能返回 200 让对方以为存上了。
    if (!(await saveState(home, state))) {
      return jsonResponse(500, { ok: false, error: '状态文件写入失败' })
    }
    return jsonResponse(200, { ok: true, prefs: state.prefs, chatcutCollapsed: state.chatcutCollapsed })
  }

  if (body.action === 'chatcut-collapse') {
    // The pre-0.3.0 spelling of one display preference, kept working for a
    // client half that has not been reloaded yet: it writes the same field the
    // new `prefs` payload does.
    if (typeof body.collapsed !== 'boolean') return jsonResponse(400, { error: 'collapsed 必须是布尔值' })
    const collapsed = { ...state.prefs.collapsed }
    if (body.collapsed === true) collapsed.chatcut = true
    else delete collapsed.chatcut
    state.prefs = { ...state.prefs, collapsed }
    state.chatcutCollapsed = body.collapsed === true
    await saveState(home, state)
    return jsonResponse(200, { ok: true, chatcutCollapsed: state.chatcutCollapsed, prefs: state.prefs })
  }

  if (body.action === 'report') {
    // The panel reports what it rendered, so a maintainer can confirm the UI
    // half really ran without needing anyone to click a switch.
    state.diagnostics.lastUiReport = {
      at: new Date().toISOString(),
      ...sanitizeReport(body.ui),
    }
    await saveState(home, state)
    return jsonResponse(200, { ok: true })
  }

  return jsonResponse(400, { error: `未知操作: ${String(body.action)}` })
}

/** Keep only primitive report fields, so a panel bug cannot bloat the state file. */
function sanitizeReport(report) {
  if (report === null || typeof report !== 'object') return {}
  const clean = {}
  for (const [key, value] of Object.entries(report)) {
    if (typeof value === 'number' || typeof value === 'boolean') clean[key] = value
    else if (typeof value === 'string') clean[key] = value.slice(0, 200)
    else if (Array.isArray(value)) clean[key] = value.slice(0, 50).map((item) => String(item).slice(0, 80))
  }
  return clean
}

export function apply(ctx) {
  const home = resolveHome()
  // A load breadcrumb: it is how the maintainer tells "the plugin is running"
  // apart from "the loader skipped it", which is silent by design.
  void noteLoad(home)
  ctx.inject(['connection'], (host) => {
    const dispose = host.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: (request) => handle(request, home),
    })
    // 防御式清理：register 若返回清理函数（与 DSH 其它注册一致），原样交回
    // 框架 —— 插件卸载时路由才能真正注销，不然后台还挂着旧 fetch 处理器；
    // 不是函数就不交（老宿主上无清理器时保持原行为）。
    if (typeof dispose === 'function') return dispose
  })
}

/** Exported for the offline core test only; not part of the runtime surface. */
export const __test__ = {
  parseFrontmatter,
  readHeaderEntry,
  findHeaderEntries,
  readKeyState,
  parseBoolean,
  writeKey,
  captureOriginal,
  readSkill,
  scanRoot,
  isManagedRoot,
  isManagedSkillFile,
  isStructurallyManagedSkillFile,
  isInsideRoot,
  sanitizeFiles,
  sanitizeProjectRoots,
  writeFileAtomic,
  buildInventory,
  applyChange,
  loadState,
  saveState,
  handle,
  resolveHome,
  resolveAgentsHome,
  chatcutSkillFiles,
  defaultPrefs,
  sanitizePrefs,
  queueWrite,
}
