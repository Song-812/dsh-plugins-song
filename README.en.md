# dsh-plugins-song · Song's DSH plugin collection

English | [简体中文](README.md)

A collection of DSH plugins by Song. Updated continuously.

> **Windows only**: plugins here need the Windows Recycle Bin (`powershell.exe` + `shell32`). Do not install on other platforms.

## Why

DSH desktop does not ship every small capability you want day to day. This repo splits the ones Song actually uses into separate plugins — install what you need, open-source the next one when it is ready.

## Plugins

| Plugin | Directory / Package | Status | What it does |
|---|---|---|---|
| Session Delete (会话删除) | [`session-delete/`](./session-delete/) · `dsh-session-delete` | ✅ Available | Hover trash on each session row; confirming sends the session folder to the **Windows Recycle Bin** |
| Message Notice (消息提示) | — | 🚧 Coming soon | |
| Boot Animation (启动动画) | — | 🚧 Coming soon | |
| Glass Theme (玻璃主题) | — | 🚧 Coming soon | |
| Global Rules (全局规则) | — | 🚧 Coming soon | |
| Thinking Levels (思考档位) | — | 🚧 Coming soon | |
| Skills Sidebar (技能侧栏) | — | 🚧 Coming soon | |
| Plugins Sidebar (插件侧栏) | — | 🚧 Coming soon | |
| MCP Sidebar (MCP侧栏) | — | 🚧 Coming soon | |
| UI Hide (UI隐藏) | — | 🚧 Coming soon | |
| Proxy Connect (代理连接) | — | 🚧 Coming soon | |
| Web Connect (网页连接) | — | 🚧 Coming soon | |
| MCP-OAuth Bridge (MCP-OAuth桥接) | — | 🚧 Coming soon | |

## Quick start

1. Install the plugin subdirectory from the DSH plugin panel, or point `plugin_manager install_bundle` at that folder
2. Refresh the page after changing `lib/client.js`; re-enable the plugin row (or restart) after changing `lib/index.js`

### Requirements

| Need | Notes |
|---|---|
| Windows | Recycle Bin bridge needs `powershell.exe` and `shell32.dll` |
| Node.js ≥ 18 | Required to run tests; installing the plugin itself goes through DSH |

## Layout

    session-delete/   Session Delete plugin (published)
    LICENSE           MIT
    README.md         Chinese
    README.en.md      English

## Tests

Each published plugin has `node --test ./test/*.test.js`. Recycle Bin cases create, delete and restore **temp** folders only — they never touch real DSH sessions.

## Known limitations

- Published plugins are **Windows only**
- “Coming soon” rows are placeholders; directories and package names will be filled in later

## License

MIT, see [LICENSE](LICENSE). © Song-812
