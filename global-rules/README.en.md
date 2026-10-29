# Global Rules · dsh-global-rules

English | [简体中文](README.md)

Edit `$DSH_HOME/AGENTS.md` (default `~/.dsh/AGENTS.md`) from DSH **Settings → Global Rules** — the instructions that apply to every session. Supports save and **Restore defaults** (backs up before clearing).

- Author: Song-812
- Version: 1.0.0
- License: MIT

## Features

| Feature | Notes |
| --- | --- |
| **Read on open** | Loads the rules file when you open the settings page; if missing, shows that saving will create it |
| **Save** | Writes the file back: new sessions pick it up immediately; the current session notices after the next file operation |
| **Restore defaults** | After confirm, clears the file to 0 bytes; backs up the previous contents first |
| **Bilingual** | Follows the DSH UI language (confirm buttons and conflict hints use the same dicts) |
| **Conflict detection** | Writes are queued with `baseVersion`; a mismatch returns 409 and the UI says the file was changed in another window |
| **Safe write** | Temp file → verify → replace; symlinks write through to the real target without turning the link into a regular file |
| **Failure copy** | Only “Save failed / Read failed / Clear failed” — no technical detail leaked |

The “Global Rules” title matches other settings plugin pages (17px / 700 / letter-spacing .06em); card and button chrome align with those pages too.

## Rules file & backups

| Item | Location |
| --- | --- |
| Rules file | `$DSH_HOME/AGENTS.md` (falls back to `~/.dsh/AGENTS.md`) |
| Backup directory | `$DSH_GLOBAL_RULES_BACKUP_DIR` (supports `~/…`); otherwise `<DSH_HOME>/global-rules-backups/` |
| Backup filename | `AGENTS-<YYYYMMDD-HHmmss-SSS>.md` (milliseconds; keeps only the newest non-empty backup) |

The rules body does **not** live inside the plugin directory — take `AGENTS.md` with you when you switch machines. This plugin does **not** need the Windows Recycle Bin.

## API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/api/global-rules` | — | `{ exists, content, version }` |
| POST | `/api/global-rules` | `{ content, baseVersion? }` | `{ ok: true, version }` |
| POST | `/api/global-rules` | `{ action: "reset", baseVersion? }` | `{ ok: true, version }` (backup then clear) |

Body size limit is 256 KiB. A `baseVersion` mismatch returns 409.

## Layout

| Path | Role |
| --- | --- |
| `lib/index.js` | Host half: GET/POST `/api/global-rules` (read, write, backup-then-clear) |
| `lib/client.js` | Client half: the settings.section “Global Rules” page (handwritten bundle, no build) |
| `cordis.patch.yml` | Bundle patch inserting `id=global-rules` |
| `locale/zh.json` · `locale/en.json` | Plugin-panel metadata (settings copy lives in `client.js` DICTS) |
| `test/*.mjs` | Offline tests (host + client smokes) |

## Install & develop

Install this directory from the DSH plugin panel, or point `plugin_manager install_bundle` at it.

The package ships its own `cordis.patch.yml`; do **not** insert the same row again in the profile’s `cordis.patch.yml` (duplicate row ids can fail startup).

Refresh the page after changing `lib/client.js`. Re-enable the plugin row (or restart) after changing `lib/index.js`.

```bash
cd global-rules
npm test   # node --test (runs everything under test/)
```

Tests never touch the real rules file: the host smoke points `$DSH_HOME` and the backup directory at a temp folder.

## Known limitations

1. The rules path is fixed to `$DSH_HOME/AGENTS.md` (or default `~/.dsh/AGENTS.md`); this page has no UI to change it.
2. “Restore defaults” clears the file to 0 bytes — it does not restore a built-in template body.
3. Multi-window edits rely on `baseVersion` conflict detection; after a 409, reopen the settings page before saving again.

## License

MIT. See [LICENSE](../LICENSE) at the repository root. © Song-812
