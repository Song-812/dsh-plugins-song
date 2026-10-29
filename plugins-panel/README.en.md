# Plugins Sidebar · dsh-plugins-panel

English | [简体中文](README.md)

Adds a **Plugins** page to the DSH sidebar: lists only the **self-made** group (DSH built-ins are hidden), with an enable/disable switch each.
Supports group collapse, a per-group bulk knob, drag reorder, search, and an **Official manager** jump to the shipped install/uninstall/config page. Display preferences (including legacy custom titles/descriptions/group names that are still shown but no longer editable) live in the plugin’s own state file. Toggles call the official `pluginManager.setPluginEnabled` Remote and hot-reload the row — no DSH restart.

- Author: Song-812
- Version: 0.2.1
- License: MIT

## Why built-ins are hidden

Toggling a DSH built-in through the official manager writes it into the profile patch and hot-reloads — that dirties the file and can spam errors. This page therefore **only lists the self-made group**. Use **Official manager** to view / install / uninstall built-ins.

## Switch & status

| Control | Role |
| --- | --- |
| **Status light** | Follows that row’s enable state and fiber phase |
| **Switch** | Enable or disable that plugin (official Remote; takes effect immediately); unaddressable rows stay locked with a reason |

Only rows with a `patchId` and no `readOnlyReason` can toggle. `readOnlyReason` is one of `management-required` / `unaddressable`. After `setPluginEnabled` returns, this page **re-reads the inventory** to confirm the row actually changed.

## Arranging the page

| Control | Role |
| --- | --- |
| **Six-dot grip (row)** | Hold to drag and reorder **within a group**; edges auto-scroll |
| **Group-head grip** | Drags the whole group (usually one “self-made” group today; release snaps back) |
| **Collapse / expand** | UI only; collapse state is remembered |
| **Bulk knob (group head)** | Turn a whole group on or off; unread/failed rows are skipped and counted; knob direction latches |
| **Search** | Matches original name, legacy custom title, package name, description, etc. (case-insensitive; query is not persisted) |
| **Restore defaults** | Clears custom titles / descriptions / order / collapse prefs after confirm; does not touch plugin enable state |
| **Official manager** | Opens the shipped plugins page (install / uninstall / config / details) |

> Pencil editors for titles, descriptions, and group names have been **removed**. Legacy custom names already in the state file still display, but cannot be edited. Edit the state file directly, or use Restore defaults.

## Relation to the shipped page

The official Plugins page is left **untouched**: no shadowing, no DOM edits, no capability changes.

- Hiding the sidebar entry: this plugin marks its own icon, then hides a sibling with the same `aria-label` that is not itself; a fallback rule applies if the marker is missing; **if both fail, nothing is hidden**.
- Disabling / uninstalling this plugin restores the official entry via the cleanup effect.

## How it works

| Piece | Source |
| --- | --- |
| Inventory & enable state | `remote.pluginManager.listPlugins()` (same Remote as the shipped page) |
| “Self-made” filter | Host half reads the profile’s `package.json`; `dependencies` values starting with `link:` / `file:` count as self-made |
| Toggle | `remote.pluginManager.setPluginEnabled(entryId, enabled)` |
| Display prefs | Host half `GET/POST /api/plugins-panel` ↔ `~/.dsh/plugins-panel.json` (or `$DSH_HOME/plugins-panel.json`) `prefs` |

The host half **only writes display prefs**. It never edits plugin files, the profile, or enable overrides — toggles go through the official Remote.

## Where display prefs live

Only in the plugin’s own state file `~/.dsh/plugins-panel.json` under `prefs` (titles, descriptions, group titles, order, collapsed, knob direction). It does **not** write the profile’s `cordis.patch.yml` (enable overrides are written by the official Remote) or other plugins’ files.

Switch machines or delete the state file and the arrangement is gone; each plugin’s enable state is unaffected.

## Layout

| Path | Role |
| --- | --- |
| `lib/index.js` | Host half: self-made / built-in filter, state file (`prefs`), `/api/plugins-panel` |
| `lib/client.js` | Client half: the sidebar Plugins page (incl. hiding the shipped entry) — handwritten, no build |
| `cordis.patch.yml` | Plugin row declaration |
| `test/*.mjs` | Offline tests (including host/client smokes) |

## Install & develop

Install this directory from the DSH plugin panel, or point `plugin_manager install_bundle` at it.

The package ships its own `cordis.patch.yml`; do **not** insert the same row again in the profile’s `cordis.patch.yml` (duplicate row ids can fail startup).

Refresh the page after changing `lib/client.js`. **Restart DSH** (or re-enable the plugin row) after changing `lib/index.js`. Before restart, the page can still render, but saving prefs may fail with HTTP 405.

```bash
cd plugins-panel
npm test   # node --test (runs everything under test/, including host/client smokes)
```

Neither smoke needs a live DSH or a browser.

## Known limitations

1. **Toggle only** — install / uninstall / config stay on the official manager page.
2. The official inventory API is “read-only list + single toggle”; this page refreshes via `remote.$on("plugin-manager/changed")`.
3. Row descriptions live only on this page — they are **not** written into any plugin file and do not affect the model.
4. Duplicate rows across profile layers follow DSH’s own inventory; this page does not infer.
5. Drag feel depends on a real pointer; offline tests cover logic, not desktop hand-feel.

## License

MIT. See [LICENSE](../LICENSE) at the repository root. © Song-812
