# dsh-plugins-song · Song's DSH plugin collection

English | [简体中文](README.md)

A collection of DSH plugins by Song. Updated continuously.

> **Platforms**: `session-delete` needs the Windows Recycle Bin (`powershell.exe` + `shell32`) — do not install it elsewhere. `msg-notify` is a pure client alert; `skills-toggle` / `mcp-toggle` / `plugins-panel` only write their own `~/.dsh/*.json` display prefs (plus skills front matter); `global-rules` edits `$DSH_HOME/AGENTS.md` (default `~/.dsh/AGENTS.md`); `proxy-connect` splits web fetch and model egress by a host list (local proxy port by default, Node ≥ 22.19); `web-connect` uses a local one-shot login entry for UI verify / default-browser open (verify needs chrome-devtools MCP) — none of them need the Recycle Bin.

## Why

DSH desktop does not ship every small capability you want day to day. This repo splits the ones Song actually uses into separate plugins — install what you need, open-source the next one when it is ready.

## Plugins

| Plugin | Directory / Package | Status | What it does |
|---|---|---|---|
| Session Delete (会话删除) | [`session-delete/`](./session-delete/) · `dsh-session-delete` | ✅ Available | Hover trash on each session row; confirming sends the session folder to the **Windows Recycle Bin** |
| Message Notice (消息提示) | [`msg-notify/`](./msg-notify/) · `dsh-msg-notify` | ✅ Available | Four tones: needs-answer / complete / error / stalled (tone + repeat per kind) |
| Boot Animation (启动动画) | — | 🚧 Coming soon | |
| Glass Theme (玻璃主题) | — | 🚧 Coming soon | |
| Global Rules (全局规则) | [`global-rules/`](./global-rules/) · `dsh-global-rules` | ✅ Available | Settings-page editor for AGENTS.md; save / restore defaults (backs up before clearing) |
| Thinking Levels (思考档位) | — | 🚧 Coming soon | |
| Skills Sidebar (技能侧栏) | [`skills-toggle/`](./skills-toggle/) · `dsh-skills-toggle` | ✅ Available | Sidebar toggles for model / manual invocation; group collapse, bulk knob, drag reorder, search |
| Plugins Sidebar (插件侧栏) | [`plugins-panel/`](./plugins-panel/) · `dsh-plugins-panel` | ✅ Available | Sidebar toggles for self-made plugins; group collapse, bulk knob, drag reorder, search, plus jump to official manager |
| MCP Sidebar (MCP侧栏) | [`mcp-toggle/`](./mcp-toggle/) · `dsh-mcp-toggle` | ✅ Available | Sidebar MCP enable/disable; group collapse, bulk knob, drag reorder, search |
| UI Hide (UI隐藏) | [`ui-hide/`](./ui-hide/) · `dsh-ui-hide` | ✅ Available | Hide unwanted UI entry points from a list; rename sessions right from the row |
| Proxy Connect (代理连接) | [`proxy-connect/`](./proxy-connect/) · `dsh-proxy-connect` | ✅ Available | One toggle + one host list: split web fetch and model egress (listed hosts via proxy) |
| Web Connect (网页连接) | [`web-connect/`](./web-connect/) · `dsh-web-connect` | ✅ Available | Self-UI verify via chrome-devtools, or open the signed-in web UI in the default browser on request |
| MCP-OAuth Bridge (MCP-OAuth桥接) | — | 🚧 Coming soon | |

## Quick start

1. Install the plugin subdirectory from the DSH plugin panel, or point `plugin_manager install_bundle` at that folder
2. Refresh the page after changing `lib/client.js`; re-enable the plugin row (or restart) after changing `lib/index.js`

### Requirements

| Need | Notes |
|---|---|
| Windows (`session-delete` only) | Recycle Bin bridge needs `powershell.exe` and `shell32.dll`. `msg-notify` is a pure client alert; `skills-toggle` / `mcp-toggle` / `plugins-panel` only write their own `~/.dsh/*.json` display prefs (plus skills front matter); `global-rules` edits `$DSH_HOME/AGENTS.md` (default `~/.dsh/AGENTS.md`); `proxy-connect` splits web fetch and model egress by a host list (local proxy port by default, Node ≥ 22.19); `web-connect` uses a local one-shot login entry for UI verify / default-browser open (verify needs chrome-devtools MCP) — none of them need the Recycle Bin |
| Node.js ≥ 18 | Required to run tests; installing the plugin itself goes through DSH |
| Node.js ≥ 22.19 (`proxy-connect` only) | Required by undici 8; DSH ships Node 24 |

## Layout

    session-delete/   Session Delete plugin (published)
    msg-notify/       Message Notice plugin (published)
    skills-toggle/    Skills Sidebar plugin (published)
    mcp-toggle/       MCP Sidebar plugin (published)
    plugins-panel/    Plugins Sidebar plugin (published)
    global-rules/     Global Rules plugin (published)
    proxy-connect/    Proxy Connect plugin (published)
    web-connect/      Web Connect plugin (published)
    ui-hide/          UI Hide plugin (published)
    LICENSE           MIT
    README.md         Chinese
    README.en.md      English

## Tests

Each published plugin has `node --test ./test/*.test.js`. Recycle Bin cases create, delete and restore **temp** folders only — they never touch real DSH sessions.

## Known limitations

- `session-delete` is **Windows only** (it needs the Recycle Bin). `msg-notify` is a pure client alert; `skills-toggle` / `mcp-toggle` / `plugins-panel` only write their own `~/.dsh/*.json` display prefs (plus skills front matter); `global-rules` edits `$DSH_HOME/AGENTS.md` (default `~/.dsh/AGENTS.md`); `proxy-connect` splits web fetch and model egress by a host list (local proxy port by default, Node ≥ 22.19); `web-connect` uses a local one-shot login entry for UI verify / default-browser open (verify needs chrome-devtools MCP) — none of them need the Recycle Bin
- “Coming soon” rows are placeholders; directories and package names will be filled in later

## License

MIT, see [LICENSE](LICENSE). © Song-812
