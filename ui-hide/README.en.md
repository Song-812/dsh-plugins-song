# UI Hide · dsh-ui-hide

English | [简体中文](README.md)

Hide UI entry points you do not need, driven by a JSON list — and add a **Rename** button on the Session row to replace the one buried in the "…" menu.

Hiding only layers one `display:none` stylesheet: nothing is removed, no program files are modified, nothing outside this plugin is touched.

- Author: Song-812
- Version: 0.2.0
- License: MIT

## Configuration

List file: `$DSH_HOME/ui-hide.json` (default `~/.dsh/ui-hide.json`). The plugin **does not ship or create** this file — when it is missing, nothing is hidden.

[`ui-hide.example.json`](ui-hide.example.json) is a sample list: copy it to the path above and edit as needed.

```json
{
  "enabled": true,
  "targets": [
    { "id": "more-sidebar", "selector": "nav[aria-label=\"全局面板\"] button[aria-haspopup=\"menu\"]", "note": "Sidebar “More”" }
  ]
}
```

| Field | Meaning |
|---|---|
| `enabled` | Master switch. `false` disables every rule and restores the page (the row Rename button disappears too) |
| `targets[].id` | Rule name for your own reference; auto-numbered if missing |
| `targets[].selector` | CSS selector. **Must not contain `{ } ; < >`** — the whole rule is dropped if it does |
| `targets[].note` | Note for humans only |

Refresh the page (F5) after editing; no DSH restart needed.

## What the example list hides

| id | Hides |
|---|---|
| `more-sidebar` | “More” at the bottom of the left sidebar |
| `more-views` | “More session views” in the session header |
| `more-guide` | “More” on the right sidebar’s start tab |
| `automation-entry` | “Automation tasks” entry in the left sidebar |
| `session-row-archive` | The hover “Archive” icon on a Session row (menu Archive remains) |
| `session-row-pin` | The hover “Pin / Unpin” icon on a Session row (menu Pin remains) |
| `menu-rename` | “Rename” inside the Session “…” menu (moved onto the row) |
| `settings-open-config` | “Open config file” in every settings page header (Close stays; relies on a host-version-specific class name — update after host UI changes) |

It is only a sample: selectors target one DSH version’s page structure and may stop matching after a host update (a stale selector simply hides nothing). Several selectors match Chinese UI labels and stop matching if the UI language changes (the Rename rule uses a shortcut attribute and is language-independent).

## Row Rename

The extra control is a 16px icon button to the right of "…", where Pin / Archive used to be, shown only while hovering the row.

It triggers the host's own rename behavior: the session title turns into an inline input in place; Enter saves, Esc cancels — identical to clicking "Rename" in the menu.

The host's editing logic is not duplicated: the button opens that row's "…" menu and presses the menu's rename item in the same microtask, so the menu never paints and you only see the inline editor.

- The menu item is located by `aria-keyshortcuts="Control+Alt+G"`, not by position, so menu reordering does not break it.
- The button is scoped to **that row**: it does not switch the current session first.
- The `Ctrl+Alt+G` shortcut still works.
- If the "…" button is missing, or the menu does not appear within 1.5 s, the button gives up silently and does nothing else.

## Adding a rule

1. Press F12 on the target element in the browser, right-click → Copy → Copy selector;
2. Trim volatile parts such as `:nth-child()`; prefer stable hooks like `aria-label`, `data-*`, `class*=`;
3. Add it to `targets` and refresh.

## How it works & limits

- Host half: reads `ui-hide.json`, normalizes it, returns it from `GET /api/ui-hide`. **Read-only, never writes config** — a broken config at worst hides nothing.
- Client half (hide): compiles the list into `selector{display:none !important}` inside the single `<style id="dsh-ui-hide-style">`.
- Client half (rename): registers a button on `sidebar.workspaces.session.row.action` (slot id `ui-hide-rename`, order 50); styles live in `<style id="dsh-ui-hide-actions-style">` and go away with the plugin.
- Display only: keyboard, tools, and agent calls are unaffected.
- A stale selector only means "not hidden"; each rule is an exact selector and will not hide unrelated elements.
- A hidden rename item is still a clickable element (`display:none` only affects painting): the row button clicks it programmatically; arrow-key menu traversal skips it.
- The row button needs the rename item to exist in the "…" menu; if the host changes it or drops `Ctrl+Alt+G`, the button fails silently (the shortcut itself still works).

## Layout

| Path | Purpose |
| --- | --- |
| `lib/index.js` | Host half: read list, normalize, serve `GET /api/ui-hide` |
| `lib/client.js` | Client half: hide stylesheet; Session-row rename button |
| `cordis.patch.yml` | Bundle patch: inserts `id/name = dsh-ui-hide` |
| `ui-hide.example.json` | Sample list (copy to `$DSH_HOME/ui-hide.json`) |
| `test/*.mjs` | Offline tests (no DSH install needed) |

## Install & disable

Install: from the DSH plugin panel, or `plugin_manager install_bundle` pointing at this directory. The plugin ships its own `cordis.patch.yml`; do **not** add the same row again in your profile's `cordis.patch.yml`.

After changing `lib/client.js`, restart DSH to reload the client bundle; list edits only need a page refresh.

Disable: turn it off in the plugin panel, or set `enabled` to `false`. Uninstall: remove `dsh-ui-hide` from the profile's dependencies and bundles.

No third-party npm dependencies; Node side uses only `node:fs/promises`, `node:os`, `node:path`; the client uses the host-provided React.

## Tests

```bash
cd ui-hide
npm test
```

Covers: invalid selector filtering, master switch off, empty list, missing / corrupt config, no leftover style on request failure; row-button slot registration and rendering; button opens the menu first, presses the item as soon as it appears, times out without side effects; menu-trigger picking; route cleanup on disable.

## License

MIT. © Song-812
