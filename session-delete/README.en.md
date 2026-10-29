# Session Delete · dsh-session-delete

English | [简体中文](README.md)

Hover a trash icon at the end of each session row. Confirm once, and the row plus its on-disk session folder go to the **Windows Recycle Bin**, so they can still be restored from Explorer.

The UI is two pieces: the **row trash icon** and a **shared top toast**. There is no centered confirm modal and no in-plugin undo.

- Author: Song-812
- Version: 0.1.1
- License: MIT

## Usage

1. Hover a session row. The trash icon is the rightmost action, after `⋯`, archive, and pin.
2. Click it and a confirm toast appears at the top:

   ```
   This session used 812.7K tokens. Delete it?
                        [Cancel] [Delete]
   ```

   Focus starts on **Cancel**, so Enter does not delete by accident. **Esc**, switching pages, or closing the window cancels a pending confirm.

   If the **Recycle Bin is unavailable** (disabled or over quota, observed by the last real delete), the question becomes “Recycle bin unavailable: this session will be permanently deleted, with no way back.” That warning is shown before Delete is pressed.

   If the **pre-delete probe thinks the bin may be unavailable** (the volume is set to skip the bin, or the bin query failed), the question becomes a softer “this deletion risks permanent loss.” The probe is only a warning. `permanent` from the post-delete index check is the evidence, and it wins when both are present.
3. Choose Delete and the row disappears immediately (`api-session/removed`, synced across windows). No refresh.

Success removes the row. Failure leaves the row and shows a top error toast asking you to check the session list and the Recycle Bin before retrying.

The host reports success and broadcasts removal only after the session directory is confirmed recycled. If the bridge only moved the cache, never confirmed the session directory, or failed for a reason other than “projection cache still on disk,” the route returns `move-failed` and the row stays. If the session directory was recycled and the only failure is that cache, with the bridge reporting `partial`, the delete still succeeds and a warning is logged.

Deleting the **session you are currently viewing** is allowed. A blank session opens after a successful delete so the UI is not left on a session that no longer exists. A failed delete does not open a blank session.

## Blocked cases

The button is disabled, and the tooltip says why:

| Case | Source | Tip |
| --- | --- | --- |
| Blank session (nothing on disk yet) | Host re-check | A blank session comes right back |
| Session still running | Host `agents` | Stop it first |

A “still running” result is remembered only for the current hover. A deletable result is cached; a blocked result is asked again on every hover. While the pointer is over the row the plugin re-checks every 5 seconds, and it unlocks immediately when DSH emits `api-session/status`.

> Blank sessions are not deletable because DSH keeps one for the workspace and recreates it under a **new id**. Deleting it looks like a no-op.

## Where data goes

| Item | Result |
| --- | --- |
| `%DSH_HOME%\sessions\<bucket>\<sessionId>\` (chat and attachments) | **Windows Recycle Bin** (`SHFileOperationW` + `FOF_ALLOWUNDO`) |
| Workspace bookkeeping and the archive set | Detached |
| `storages\session_projcache\sessions\<id>.json` (token cache) | Recycled with the session |

Restore from Explorer’s Recycle Bin, then refresh DSH to see the session again.
**Emptying the Recycle Bin is final.** The plugin does not keep a second copy.

Delete uses `FOF_WANTNUKEWARNING` (`0x4000`) and then reconciles the Recycle Bin index: leaving disk is not the same as entering the bin. A path counts as recoverable only when the original path shows up in the index. Before the move, a **read-only probe** (`binProbe`) reads that volume’s `BitBucket\Volume\{GUID}` `NukeOnDelete` value and calls `SHQueryRecycleBin`. The host turns that into `binStatus` (`ok` / `suspect` / `unknown`). The probe never blocks the delete.

## Host routes

| Route | Role |
| --- | --- |
| `POST /dsh-session-delete/check` | `{sessionId}` → `{deletable, reason, onDisk, total, label, permanent, binStatus}`. Hover asks whether to disable the button; click asks for the final verdict. `permanent: true` means the last delete saw an unavailable bin, so the toast warns of permanent deletion. `binStatus` is the latest pre-delete probe (`suspect` warns of possible permanent loss; `unknown` until a delete has run). |
| `POST /dsh-session-delete/delete` | Performs the delete. Refusal is 409 with `code: session-running` or `session-blank` (running state is checked again immediately before the recycle, so a session started between the two checks is still refused). A bin write failure, or a session directory that was not confirmed moved, is 500 `move-failed`. The response includes `permanent` (index reconciliation: true means something was permanently deleted) and `binStatus` (the pre-delete probe). |
| `GET /dsh-session-delete/status` | Self-check: home path and whether the recycle bridge script has been written |
| `GET /dsh-session-delete/ping` | Liveness probe |

## Develop

```bash
cd session-delete
node --test
```

`node --test` covers the pure helpers (token formatting, delete decisions, id shape, confirm wording), the delete flow (TOCTOU re-check, `permanent` passthrough, partial bridge failure), and the top confirm toast. Recycle-bin cases **skip** without `powershell.exe`, and **fail** when PowerShell is present but the bridge misbehaves.

`test/bridge-roundtrip.mjs` is the manual round trip: create a temp file, delete it, restore it, clean up. It lives under `test/`, so `node --test` runs it too. Without PowerShell it records the bridge failure and exits.

`test/confirm-toast.browser.mjs` checks toast focus, Esc cancel, and the error toast in local Chrome. It **skips** when puppeteer is not available.

Install this directory from the DSH plugin panel, or point `plugin_manager install_bundle` at it.
Refresh the page after changing `lib/client.js`. Re-enable the plugin row (or restart) after changing `lib/index.js`.

`restore` and `detect` remain inside the bridge script for **manual debugging only**. The UI and HTTP routes do not expose them.

## Known limitations

- **Windows only.** The bridge needs `powershell.exe` and `shell32.dll`. Other platforms error out and do not fall back to a hard delete.
- **A disabled or full Recycle Bin turns the delete into a permanent delete** (Windows behavior). Two guards apply: a read-only pre-delete probe warns of possible permanent loss, and post-delete index reconciliation reports `permanent`, which upgrades the toast to “permanently deleted, no way back.” The probe follows a real delete, so the **first** permanent delete happens before any warning. Later deletes are warned. One successful recycle clears the permanent warning.
- Only ordinary rows in the left session list get the button. Workspace rows do not.
- Deleting the session on screen opens a blank session. If DSH is also switching sessions at that moment, an extra blank session can appear.
- Recycle Bin quota still applies; the system may purge the oldest entries.

## License

MIT. See [LICENSE](../LICENSE) at the repository root. © Song-812
