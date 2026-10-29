# Proxy Connect · dsh-proxy-connect

English | [简体中文](README.md)

One toggle and one host list for two egress paths:

| Path | Rule |
| --- | --- |
| **Web fetch** (`web_fetch`) | Listed hosts go through the proxy immediately; others try direct first, then fall back to the proxy after ~2s, and **may be recorded** into the list on success (with a failure threshold — see below) |
| **Model egress** (models, HTTP MCP, other plugins' Node-side traffic) | Listed hosts use the proxy; everything else stays direct — **no retry, no auto-register**, so a stopped proxy does not break domestic endpoints |

The repo ships `whitelist.example.json`; copy it to `whitelist.json` on first use (or let the plugin create one as needed). Both paths share `whitelist.json` and the single enable/disable switch in the plugin panel. There is **no** separate settings page.

- Author: Song-812
- Version: 1.0.0
- License: MIT

## Behavior

```
Web fetch
  ├─ host in whitelist.json (suffix match, covers subdomains) → proxy
  └─ otherwise → direct
        ├─ ok → return (nothing recorded)
        └─ no connect within 2s → try proxy
              ├─ ok → record host after threshold, return
              └─ fail → error with reason (refused port ≈ proxy not running)

Model egress
  ├─ listed host → ProxyAgent
  ├─ loopback (localhost / 127.0.0.0/8 / ::1) → always direct
  ├─ non-http(s) → direct
  └─ else → direct (pool reuse unchanged)
```

Only hard connect failures (`ECONNREFUSED`, `UND_ERR_CONNECT_TIMEOUT`, …) trigger fallback. User cancel, DSH policy deny, and normal 4xx/5xx responses do **not**.

“Should we fall back?” and “is the proxy down?” are **separate** checks on purpose: `UND_ERR_HEADERS_TIMEOUT` counts as fallback-worthy but also proves the proxy is up.

## Scope

| In scope | Out of scope |
| --- | --- |
| `web_fetch` | Browser traffic (uses the system proxy) |
| Model HTTP requests | git / npm inside a shell |
| HTTP MCP and other plugins' Node egress | DSH shell + telemetry (telemetry stays direct by design) |

**Yield rule:** if DSH already set `https_proxy` / `http_proxy` / `all_proxy` (etc.), this plugin does **not** take over model egress (it only logs a diagnostic), so two policies never fight.

## Proxy URL & auto-register

- **Proxy URL:** default `http://127.0.0.1:7897` (common Clash mixed port). Override with either:
  - env `DSH_PROXY_CONNECT_URL` (wins), or
  - `proxy.json` in the plugin dir: `{ "proxyUrl": "http://127.0.0.1:7890" }` (gitignored — do not commit)
  - http/https proxies only; bad values fall back to the default and are noted in `debug.log`
- **Auto-register threshold:** for an unlisted host, after direct fails and proxy succeeds, the host is written permanently only if the **same host fails 3 times within 10 minutes** (a single blip is not enough; a later direct success resets the counter; counters are in-memory only). Constants: `REGISTER_AFTER_FAILURES` / `REGISTER_WINDOW_MS` in `lib/config.js`
- **List watch:** watches the directory (filters by filename); missing file no longer errors every second; watch setup retries with 1s→30s backoff
- Requires **Node ≥ 22.19** (undici 8; DSH's bundled Node 24 is fine)

## Whitelist files

| File | Role |
| --- | --- |
| `whitelist.example.json` | Starter example (this is what the repo ships) |
| `whitelist.json` | Runtime list (copy from the example; editable, applies immediately) |
| `whitelist.example.json` | Starter example shipped with the open-source package (common foreign model / docs hosts) |

The shipped starter does **not** include personal browsing history. Domestic model hosts usually need **no** entry — unlisted means direct.

Writing `anthropic.com` also matches `api.anthropic.com` (label-boundary suffix match). A corrupt or temporarily missing file keeps the last known-good list; a corrupt first read prints a loud warning.

## Layout

| Path | Role |
| --- | --- |
| `lib/index.js` | Wires both paths; writes facts to `debug.log` |
| `lib/plugin.js` | Web half: claim fetcher on enable, hand back on disable |
| `lib/provider.js` | Direct vs proxy decision + error copy for web fetch |
| `lib/egress.js` | Model half: live list → dispatcher → teardown |
| `lib/egress-routing.js` | Model routing (default direct, listed → proxy, loopback never) |
| `lib/egress-whitelist.js` | Live list: strict read, watch refresh, keep last good on bad writes |
| `lib/egress-dispatcher.js` | Global egress triage (**re-decides every request**) |
| `lib/failure-tracker.js` | In-memory failure counters for auto-register |
| `lib/profile-web-config.js` | Rewrites profile `fetchProvider` on enable/disable |
| `lib/fetch-url.js` | Redirects, size caps, content types |
| `lib/undici-transport.js` | Thin undici adapters (Agent / ProxyAgent) |
| `lib/whitelist.js` | List I/O, host normalize + suffix match |
| `lib/fallback.js` | Two failure classifiers |
| `lib/config.js` | Ports, timeouts, caps |
| `cordis.patch.yml` | Bundle patch (row id = package name) |
| `test/*.mjs` | Offline tests (most need no network) |

## Enable / disable

Prefer `configEditor`; fall back to file writes when nested HMR transactions block it:

| Direction | Prefer | Fallback |
| --- | --- | --- |
| Enable (claim) | `configEditor` sets `fetchProvider` | File: built-in → `proxy-connect`; append row under `web` if missing; rewrite again after 400ms (idempotent) |
| Disable (handBack) | — | File: `proxy-connect` → `http` (never inserts a new row); rewrite again after 400ms |

Writes are CAS-style: re-read before rename; if DSH wrote something else in the window, retry up to 3 times on the fresh content.

## Install & develop

1. `npm install` in this directory (ships **undici**; DSH's profile resolve path does not include it)
2. Install the folder from the DSH plugin panel, or point `plugin_manager install_bundle` at it
3. **Restart DSH once**; after that, toggle from the plugin panel

The package ships its own `cordis.patch.yml`; do **not** insert the same row again in the profile.

Any change under `lib/` needs a **full DSH restart** (ESM stays cached; panel toggle alone is not enough).

```bash
cd proxy-connect
npm install
npm test   # node --test
```

Most tests need no network. Integration tests probe whether a local proxy port is listening; with Clash stopped, “domestic still direct / listed fails fast” cases should still pass.

## Known limitations

1. Source edits require a full DSH restart — panel reload is not enough.
2. DSH owns the profile `cordis.patch.yml` and may overwrite manual edits; the plugin rewrites the correct `fetchProvider` on load/toggle.
3. Does not cover browser egress or shell git/npm.
4. Does not need the Windows Recycle Bin; Windows / macOS / Linux work when Node ≥ 22.19 and the proxy is reachable.

## Rename history

- 2026-10-26: directory renamed to `proxy-connect` (Chinese「代理连接」), package `dsh-proxy-switch` → `dsh-proxy-connect`, fetcher id `proxy-connect`; version 1.0.0.

## License

MIT. See [LICENSE](../LICENSE) at the repository root. © Song-812
