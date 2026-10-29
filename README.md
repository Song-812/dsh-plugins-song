# dsh-plugins-song · Song 的 DSH 插件合集

[English](README.en.md) | 简体中文

Song 自制的 DSH 插件合集，持续更新。

> **平台说明**：`session-delete` 依赖 Windows 回收站（`powershell.exe` + `shell32`），其它平台请勿装它。`msg-notify` 是纯客户端提醒；`skills-toggle` / `mcp-toggle` / `plugins-panel` 只写各自的 `~/.dsh/*.json` 显示偏好（及 skills 的 front matter）；`global-rules` 编辑 `$DSH_HOME/AGENTS.md`（默认 `~/.dsh/AGENTS.md`）；`proxy-connect` 按名单分流抓网页与模型出网（默认本机代理端口，Node ≥ 22.19）；`web-connect` 用本机一次性登录入口做界面验证 / 默认浏览器打开（验证模式需 chrome-devtools MCP）——以上都不依赖回收站。

## 它解决什么问题

DSH 桌面端没有现成的「一键删会话并进回收站」之类能力。这个合集把自用里反复用到的小能力拆成独立插件，装一个用一个，需要时再开源下一个。

## 插件一览

| 插件 | 目录 / 包名 | 状态 | 作用 |
|---|---|---|---|
| 会话删除 (Session Delete) | [`session-delete/`](./session-delete/) · `dsh-session-delete` | ✅ 已发布 | 会话行悬停垃圾桶：确认后把会话目录送进 **Windows 系统回收站** |
| 消息提示 (Message Notice) | [`msg-notify/`](./msg-notify/) · `dsh-msg-notify` | ✅ 已发布 | 需要回答 / 输出完成 / 发生错误 / 卡住：四类场景各配提示音（音色与重复可调） |
| 启动动画 (Boot Animation) | [`launch-animation/`](./launch-animation/) · `dsh-launch-animation` | ✅ 已发布 | 开机线稿描边动画，盖住默认 Loading；可换身份图，可跳过 |
| 玻璃主题 (Glass Theme) | [`glass-theme/`](./glass-theme/) · `dsh-glass-theme` | ✅ 已发布 | 壁纸 + 磨砂玻璃界面；重点色、悬停上浮、鼠标辉光 |
| 全局规则 (Global Rules) | [`global-rules/`](./global-rules/) · `dsh-global-rules` | ✅ 已发布 | 设置页编辑 AGENTS.md；保存 / 恢复默认（清空前自动备份） |
| 思考档位 (Thinking Levels) | [`reasoning-effort/`](./reasoning-effort/) · `dsh-reasoning-effort` | ✅ 已发布 | 输入框模型区：推理档位滑条 + 加速档闪电开关 |
| 技能侧栏 (Skills Sidebar) | [`skills-toggle/`](./skills-toggle/) · `dsh-skills-toggle` | ✅ 已发布 | 侧栏管理技能的「模型 / 手动」开关；分组折叠、一键开关、拖动排序与搜索 |
| 插件侧栏 (Plugins Sidebar) | [`plugins-panel/`](./plugins-panel/) · `dsh-plugins-panel` | ✅ 已发布 | 侧栏管理自制插件开关；分组折叠、一键开关、拖动排序、搜索，并可跳转官方管理页 |
| MCP 侧栏 (MCP Sidebar) | [`mcp-toggle/`](./mcp-toggle/) · `dsh-mcp-toggle` | ✅ 已发布 | 侧栏管理 MCP 服务器开关；分组折叠、一键开关、拖动排序与搜索 |
| UI 隐藏 (UI Hide) | [`ui-hide/`](./ui-hide/) · `dsh-ui-hide` | ✅ 已发布 | 按清单隐藏不需要的界面入口；会话行上直接「重命名」 |
| 代理连接 (Proxy Connect) | [`proxy-connect/`](./proxy-connect/) · `dsh-proxy-connect` | ✅ 已发布 | 一个开关 + 一份名单：抓网页与模型出网分流（名单内走代理） |
| 网页连接 (Web Connect) | [`web-connect/`](./web-connect/) · `dsh-web-connect` | ✅ 已发布 | 验证自身界面（chrome-devtools）与按用户要求在默认浏览器打开已登录网页版 |
| MCP-OAuth 桥接 (MCP-OAuth Bridge) | — | 🚧 即将开源 | |

持续更新，敬请期待。

## 快速开始

1. 在 DSH 插件面板里选择对应子目录安装，或用 `plugin_manager install_bundle` 指向该子目录
2. 改了客户端半边（`lib/client.js`）要刷新页面；改了宿主半边（`lib/index.js`）要重新启用一次插件行（或重启）

### 环境要求

| 需要 | 说明 |
|---|---|
| Windows（仅 `session-delete`） | 回收站桥依赖 `powershell.exe` 与 `shell32.dll`。`msg-notify` 是纯客户端；`skills-toggle` / `mcp-toggle` / `plugins-panel` 只写各自的 `~/.dsh/*.json` 显示偏好（及 skills 的 front matter）；`global-rules` 编辑 `$DSH_HOME/AGENTS.md`（默认 `~/.dsh/AGENTS.md`）；`proxy-connect` 按名单分流抓网页与模型出网（默认本机代理端口，Node ≥ 22.19）；`web-connect` 用本机一次性登录入口做界面验证 / 默认浏览器打开（验证模式需 chrome-devtools MCP）——以上都不依赖回收站 |
| Node.js ≥ 18 | 跑插件测试时需要；装插件本身走 DSH |
| Node.js ≥ 22.19（仅 `proxy-connect`） | undici 8 要求；DSH 自带 Node 24 满足 |

## 项目结构

    session-delete/   会话删除插件（已发布）
    msg-notify/       消息提示插件（已发布）
    skills-toggle/    技能侧栏插件（已发布）
    mcp-toggle/       MCP 侧栏插件（已发布）
    plugins-panel/    插件侧栏插件（已发布）
    global-rules/     全局规则插件（已发布）
    proxy-connect/    代理连接插件（已发布）
    web-connect/      网页连接插件（已发布）
    ui-hide/          UI 隐藏插件（已发布）
    reasoning-effort/ 思考档位插件（已发布）
    launch-animation/ 启动动画插件（已发布）
    glass-theme/      玻璃主题插件（已发布）
    LICENSE           MIT
    README.md         中文说明
    README.en.md      English

## 测试

每个插件的测试都在该插件目录里用 `npm test` 运行（各插件的 `package.json` 都有 `test` 脚本）。回收站相关用例只在临时目录上建删还原，不碰真实 DSH 会话。

## 已知限制

- `session-delete` **只在 Windows 上能用**（依赖系统回收站）。`msg-notify` 是纯客户端提醒；`skills-toggle` / `mcp-toggle` / `plugins-panel` 只写各自的 `~/.dsh/*.json` 显示偏好（及 skills 的 front matter）；`global-rules` 编辑 `$DSH_HOME/AGENTS.md`（默认 `~/.dsh/AGENTS.md`）；`proxy-connect` 按名单分流抓网页与模型出网（默认本机代理端口，Node ≥ 22.19）；`web-connect` 用本机一次性登录入口（验证模式需 chrome-devtools MCP）——以上都不依赖回收站
- 「即将开源」的条目还在整理，目录与包名以后补上

## 许可证

MIT，见 [LICENSE](LICENSE)。© Song-812
