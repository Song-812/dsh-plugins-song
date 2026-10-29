# Web Connect · dsh-web-connect

English | [简体中文](README.md)

Two separate jobs: let DSH **verify its own UI**, and — when the user asks — open the signed-in web UI in the **everyday browser**. No external scripts or legacy global-rule entry points.

- Author: Song-812
- Version: 0.1.0
- License: MIT

## Two tools

| Tool | When to use | What happens |
| --- | --- | --- |
| **`dsh_web_verify`** | “Check your own UI changes” and similar | Reuses / opens a DSH page inside the existing **chrome-devtools MCP** browser, finishes local login, returns `pageId`; the agent then continues with screenshots / snapshots / real checks |
| **`dsh_web_open`** | User clearly asks to “open the web UI for me” | Opens signed-in DSH in the system default browser (`rundll32` on Windows; `open` / `xdg-open` elsewhere). Only confirms the browser claimed the login hand-off |

The only optional argument is an on-site `path` (default `/`). Do **not** pass a full URL, auth params, or tokens. A successful entry hand-off is **not** the same as verifying a UI change — the agent must still inspect the target content. The system-browser path only confirms login delivery; it does not read the user’s browser contents.

## Scope & boundaries

| In scope | Out of scope |
| --- | --- |
| One-shot login entry on loopback | Remote / non-loopback binds |
| Login + page pick inside the verify browser (chrome-devtools MCP) | Arbitrary MCP tool calls (only list / select / navigate / read-only checks) |
| System default browser claiming login state | Reading the user’s browser contents, credential files, or re-signing cookies |

Notes:

- Uses `webServer.getOrigin()` for the real port and `connection.authenticatedUrl()` for in-process official auth; native Node HTTP(S) exchanges the official HttpOnly cookie inside the host, then a same-origin one-shot random entry is handed to the browser.
- **Auth URLs never enter** model args, tool results, or plugin logs; no credential-file reads, no cookie re-sign, no Python / legacy scripts.
- One-shot entry: loopback only, correct Host, GET; **60 s** TTL; single use. Disabling the plugin revokes the route and unused entries.
- Loopback only; HTTPS uses system trust (no cert bypass).
- Verify path reuses the agent-visible chrome-devtools tools; fails clearly if MCP is off or unauthorized.
- Stays **independent of other egress-related plugins**: auth uses native Node HTTP(S), not a web-fetch provider; does not change global proxy or Chrome settings. System proxy / TUN effects depend on the local desktop instance.

Tool descriptions plus a lifecycle `systemPrompt` section point agents at the new entry and away from legacy `open_dsh_web.cmd` / `dsh_web_auth.py`-style suggestions (do not run the old scripts alongside).

## Layout

| Path | Role |
| --- | --- |
| `lib/index.js` | Cordis plugin: two agent tools, prompt section, default-browser launch |
| `lib/connect.js` | Local auth hand-off, one-shot entry, browser connect flow |
| `cordis.patch.yml` | Bundle patch inserting `id/name = dsh-web-connect` |
| `test/connect.test.js` · `test/plugin.test.js` | Offline behavior tests |
| `test/runtime-smoke.mjs` | Optional live DSH / browser smoke (needs a local DSH install) |

## Install & develop

Install this folder from the DSH plugin panel, or point `plugin_manager install_bundle` at the package directory.

The plugin ships its own `cordis.patch.yml` — do **not** insert the same row again in the profile’s patch (duplicate ids can break startup).

**Restart DSH** after install so the current session picks up the tools. Disabling the plugin in the panel unregisters tools, the prompt section, and one-shot entries.

After changing `lib/` (host side): re-enable the plugin row or restart. There is no client half, so a page refresh alone is usually unnecessary.

Does **not** need the Windows Recycle Bin. Default-browser open is primarily tested on Windows; macOS / Linux have fallbacks. Verify mode needs an enabled **chrome-devtools MCP**. No Python / extra npm runtime deps for day-to-day use.

## Tests

Offline:

```bash
cd web-connect
npm test
# or: node --test test/*.test.js
```

Optional live runtime (local DSH install + env vars):

```bash
# Default: mount official Cordis / tools / WebServer / auth only
node test/runtime-smoke.mjs

# Headless Chrome (set DSH_TEST_NODE to a local node):
# DSH_TEST_CHROME=1 DSH_TEST_NODE=/path/to/node node test/runtime-smoke.mjs

# Also exercise the system default browser (opens a clearly marked test page):
# DSH_TEST_USER=1 node test/runtime-smoke.mjs
```

Tests use in-memory auth fixtures only — no real secrets, no model API calls. MCP integration uses a locally installed chrome-devtools-mcp; nothing is downloaded.

## License

MIT. © Song-812
