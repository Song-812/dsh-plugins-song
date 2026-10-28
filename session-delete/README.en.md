# Session Delete · dsh-session-delete

English | [简体中文](README.md)

> **Windows only**: needs `powershell.exe` and `shell32.dll`. Other platforms error out and will **not** fall back to hard delete.

Hover a trash icon at the end of each session row; confirm once and the row plus its on-disk session folder disappear into the **Windows Recycle Bin** (recoverable from Explorer).

UI is only: **row trash** + **confirm dialog**. No undo toast, no settings page, no ledger.

- Author: Song-812
- Version: 0.1.0
- License: MIT

## Why

DSH's sidebar has no “delete this session and still get it back from the Recycle Bin” action. This plugin adds a trash icon on each row; confirming sends the folder to the system Recycle Bin and syncs every open window immediately.

## Usage

1. Hover a session row → trash is the rightmost action after `⋯` / archive / pin.
2. Click → confirm dialog (focus defaults to **Cancel**; Esc / click outside cancels).
   - If the last real delete saw a disabled/full bin → wording warns of **permanent** delete.
   - If the last pre-delete probe was `suspect` → softer “risk of permanent loss” wording.
3. Confirm → row vanishes via `api-session/removed` (multi-window). Success = row gone; failure = row stays.

Deleting the **currently open** session is allowed; a blank session is started afterward so the UI is not stuck on a missing session.

## Blocked cases

| Case | Source | Tip |
|---|---|---|
| Blank session (nothing on disk) | Host check | Blank sessions come back immediately |
| Session still running | Host `agents` | Stop it first |

## Where data goes

| Item | Result |
|---|---|
| `%DSH_HOME%\sessions\<bucket>\<sessionId>\` | Recycle Bin (`SHFileOperationW` + `FOF_ALLOWUNDO`) |
| Workspace / archive bookkeeping | Detached |
| `session_projcache` JSON | Recycled with the session |

Emptying the Recycle Bin is irreversible. The bridge reconciles **every volume’s** `$Recycle.Bin` (case-insensitive path match) after delete; `permanent` means “gone from disk but not found in any bin index.”

## Host routes

| Route | Role |
|---|---|
| `POST /dsh-session-delete/check` | Deletability + token label + `permanent` / `binStatus` |
| `POST /dsh-session-delete/delete` | Perform delete; 409 when running/blank, 500 on `move-failed` |
| `GET /dsh-session-delete/status` | Self-check including last `permanent` / `binStatus` |
| `GET /dsh-session-delete/ping` | Liveness probe |

## Develop

```bash
cd session-delete
node --test ./test/*.test.js
```

Recycle-bin integration tests **skip** without `powershell.exe`, and **fail** (not silently pass) when PowerShell is present but the bridge misbehaves.

`restore` / `detect` exist inside the bridge script for **manual debugging only**; they are not exposed by the UI or HTTP routes.

## Layout

    lib/            host + client + recycle bridge
    locale/         plugin-panel metadata (zh / en)
    test/           `node --test ./test/*.test.js` cases
    cordis.patch.yml

## Known limitations

- Windows only.
- First permanent delete cannot be pre-warned (probe follows a real delete).
- Starting a blank session after deleting the current one may rarely open an extra blank if the user switched sessions during the confirm dialog.
- Recycle Bin quota / auto-purge still applies.

## License

MIT, see [LICENSE](../LICENSE) at the repository root. © Song-812
