# MCP Sidebar · dsh-mcp-toggle

English | [简体中文](README.md)

Adds an **MCP** page to the DSH sidebar: lists configured MCP servers with a status light and an enable/disable switch each.
Supports group collapse, a per-group bulk knob, drag reorder, and search. Display preferences (including legacy custom titles/group names that are still shown but no longer editable) live in the plugin’s own state file. Toggles call the official `pluginManager.setPluginEnabled` Remote and hot-reload the row — no DSH restart.

- Author: Song-812
- Version: 0.2.0
- License: MIT

## Status light & switch

| Control | Role |
| --- | --- |
| **Status light** | 🟢 Enabled with tools registered / 🟠 Enabled but no tools (possible disconnect, reconnecting, or a server that exposes none) / ⚪ Disabled / 🔴 Row failed to start |
| **Switch** | Enable or disable that MCP server (official Remote; takes effect immediately) |

## Arranging the page

| Control | Role |
| --- | --- |
| **Six-dot grip (row)** | Hold ~300ms to drag and reorder **within a group**; edges auto-scroll |
| **Group-head grip** | Drags the whole group (usually one group today; release snaps back) |
| **Collapse / expand** | UI only; collapse state is remembered |
| **Bulk knob (group head)** | Turn a whole group on or off; unread/failed rows are skipped and counted; knob direction latches |
| **Search** | Matches original name, legacy custom title, row id, and address (case-insensitive; query is not persisted) |
| **Restore defaults** | Clears custom titles / order / collapse prefs after confirm; does not touch server enable state |

> Pencil editors for titles and group names have been **removed**. Legacy custom names already in the state file still display, but cannot be edited. Edit the state file directly, or use Restore defaults.

## How it works

| Piece | Source |
| --- | --- |
| Inventory & enable state | `remote.pluginManager.listPlugins()`, filtered to `moduleName === "@deepseek-ai/dsh-mcp-client"` |
| Titles & addresses | Host half reads the profile’s `cordis.patch.yml` |
| Tool counts (for the light) | Host half reads `ctx.tools.schemas()`, counting `mcp__<serverName>__` prefixes |
| Toggle | `remote.pluginManager.setPluginEnabled(...)` |
| Display prefs | Host half `GET/POST /api/mcp-toggle` ↔ `~/.dsh/mcp-toggle.json` `prefs` |

The host half **only writes display prefs**. It never edits server configs, enable overrides, or skill files — toggles go through the official Remote.

## Credentials stay hidden

MCP configs often carry tokens. The host half reports only:

- **Key names** of `headers` / `env` — never values;
- Redacted addresses: `user:pass@` → `<hidden>@`, query / fragment → `<hidden>`;
- Args that look like `token/key/secret/password/auth` `k=v`, long opaque strings, and spaced `Bearer`/`Basic`/`Token` fragments → `<hidden>`;
- `!!js` expressions → `<expression>`.

Offline tests assert fake token literals never appear in module output.

## Where display prefs live

Only in the plugin’s own state file `~/.dsh/mcp-toggle.json` under `prefs` (titles, group title, order, collapsed, knob direction). It does **not** write the profile’s `cordis.patch.yml` (enable overrides are written by the official Remote) or other plugins’ files.

Switch machines or delete the state file and the arrangement is gone; each MCP server’s enable state is unaffected.

## Layout

| Path | Role |
| --- | --- |
| `lib/index.js` | Host half: patch/tool reads, state file (`prefs`), `/api/mcp-toggle` |
| `lib/client.js` | Client half: the sidebar MCP page — handwritten, no build |
| `cordis.patch.yml` | Plugin row declaration |
| `test/*.mjs` | Offline tests (including host/client smokes) |

## Install & develop

Install this directory from the DSH plugin panel, or point `plugin_manager install_bundle` at it.

The package ships its own `cordis.patch.yml`; do **not** insert the same row again in the profile’s `cordis.patch.yml` (duplicate row ids fail startup).

Refresh the page after changing `lib/client.js`. **Restart DSH** (or re-enable the plugin row) after changing `lib/index.js`.

```bash
cd mcp-toggle
npm test   # node --test (runs everything under test/, including host/client smokes)
```

Neither smoke needs a live DSH or a browser.

## Known limitations

1. **No real “connection state”.** `@deepseek-ai/dsh-mcp-client` does not expose connection status; the light only infers from whether tools are registered. Orange is an inference (e.g. a server that exposes no tools).
2. **No failure reason in UI.** Check the terminal that runs DSH.
3. **Only Loader-row MCPs** (those written in config). Runtime-mounted MCPs from other paths do not appear.
4. **No add/edit/remove of servers** — still edit the profile’s `cordis.patch.yml`.
5. `fiberPhase: active` **≠ connected** (default `failOnStartupError: false` may swallow the first connect failure).
6. Drag feel depends on a real pointer; offline tests cover logic, not desktop hand-feel.

## Reconnecting

To reconnect: turn the MCP off, wait for the action to finish, then turn it back on. Follow any failure / restart prompts.

## License

MIT. See [LICENSE](../LICENSE) at the repository root. © Song-812
