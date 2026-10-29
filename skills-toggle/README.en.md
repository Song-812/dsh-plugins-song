# Skills Sidebar · dsh-skills-toggle

English | [简体中文](README.md)

Adds a **Skills** page to the DSH sidebar: per-skill toggles for **model-invocable** and **manual-only**, arranged in three sections — My skills / This project / ChatCut.
Supports group collapse, a per-group bulk knob, drag reorder, and search. Display preferences (including legacy custom titles/group names that are still shown but no longer editable) live in the plugin’s own state file. Toggles write `SKILL.md` front matter, with registry checks and automatic rollback.

- Author: Song-812
- Version: 0.3.1
- License: MIT

## Two toggles

| Toggle | When off |
| --- | --- |
| **Model** | The model cannot see or call the skill (takes effect on the next step) |
| **Manual** | The skill also disappears from the `/` skill menu in the composer |

The two toggles are independent: turning off Manual alone still leaves the skill available to the model.

## Arranging the page

| Control | Role |
| --- | --- |
| **Six-dot grip (row)** | Hold ~300ms to drag and reorder **within a group**; edges auto-scroll |
| **Group-head grip** | Drags the whole group, including its rows |
| **Collapse / expand** | UI only — does not touch skill files; collapse state is remembered |
| **Bulk knob (group head)** | Turn a whole group on or off; failures are skipped and counted; knob direction latches |
| **Search** | Matches original names, legacy custom titles, and descriptions |
| **Restore defaults** | Clears order/collapse display prefs after confirm; does not touch skill-file toggles |

> Pencil editors for titles, descriptions, and group names have been **removed**. Legacy custom names already in the state file still display, but cannot be edited.

## Three sections

- **My skills**: `~/.dsh/skills`
- **This project**: `<project>/.dsh/skills`, plus managed official runtime skill roots
- **ChatCut**: ChatCut Desktop skills under `~/.agents/skills`

ChatCut membership is decided on the host half (manifest file or `chatcut-` prefix) and shipped with the inventory. Those skills do not also appear under “This project”.

## How it works

DSH has no per-skill toggle API, but discovery honors `SKILL.md` front matter:

| Key | On | Off |
| --- | --- | --- |
| `disable-model-invocation` | **Delete the line** (absent = allowed) | Write `true` |
| `user-invocable` | Write `true` (or restore the author’s original line) | Write `false` |

Turning a skill back on tries to restore the author’s original line byte-for-byte when one existed.

## Safety (short)

1. **Read-back after every write**; mismatch restores prior bytes and marks the row red.
2. **Cross-check the DSH registry**; if nothing changed, the row is disabled with a reason.
3. **Only managed skill paths** may be written; everything else is rejected.
4. **Atomic replace** (temp file then rename); BOM / CRLF / quoting / indentation are preserved where possible.
5. The HTTP API sits on DSH’s `/api` channel (Host/Origin fence + browser auth).

## Where display prefs live

Only in the plugin’s own state file `~/.dsh/skills-toggle.json` under `prefs` (titles, group titles, order, collapsed). It does **not** write skill bodies, the profile’s `cordis.patch.yml`, or other plugins’ files.

Switch machines or delete the state file and the arrangement is gone; toggles stored in `SKILL.md` are unaffected.

## Layout

| Path | Role |
| --- | --- |
| `lib/index.js` | Host half: inventory, front-matter edits, state file (`prefs`), `/api/skills-toggle` |
| `lib/client.js` | Client half: the sidebar Skills page — handwritten, no build |
| `cordis.patch.yml` | Plugin row declaration |
| `test/*.mjs` | Offline tests (including host/client smokes) |

## Install & develop

Install this directory from the DSH plugin panel, or point `plugin_manager install_bundle` at it.

Refresh the page after changing `lib/client.js`. **Restart DSH** (or re-enable the plugin row) after changing `lib/index.js`.

```bash
cd skills-toggle
npm test   # node --test (runs everything under test/, including host/client smokes)
```

`node --test` runs `*.test.mjs`. The two smoke scripts cover the host half (temp-dir round trip) and the client half (fake React / mini renderer). Neither needs a live DSH or a browser.

## Known limitations

- Without an active session, registry verification is unavailable; toggles still work, and the header shows unverified.
- The client `/` menu is session-cached: after turning Manual off, the current session’s menu may need a refresh or preset switch.
- Same-named skills in different directories cannot be verified one-by-one and are locked; the bulk knob skips them.
- Turning off a project skill edits files inside the project; `git` may show changes.
- ChatCut skills come from another app: turning them off really edits those `SKILL.md` files; a ChatCut update may overwrite the marks.
- Drag feel depends on a real pointer; offline tests cover logic, not desktop hand-feel.

## License

MIT. See [LICENSE](../LICENSE) at the repository root. © Song-812
