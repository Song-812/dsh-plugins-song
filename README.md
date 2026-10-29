# dsh-plugins-song · Song 的 DSH 插件合集

[English](README.en.md) | 简体中文

Song 自制的 DSH 插件合集，持续更新。

> **平台说明**：`session-delete` 依赖 Windows 回收站（`powershell.exe` + `shell32`），其它平台请勿装它。`msg-notify` 是纯客户端提醒；`skills-toggle` 改受管技能 front matter 与 `~/.dsh/skills-toggle.json`，也不依赖回收站。

## 它解决什么问题

DSH 桌面端没有现成的「一键删会话并进回收站」之类能力。这个合集把自用里反复用到的小能力拆成独立插件，装一个用一个，需要时再开源下一个。

## 插件一览

| 插件 | 目录 / 包名 | 状态 | 作用 |
|---|---|---|---|
| 会话删除 (Session Delete) | [`session-delete/`](./session-delete/) · `dsh-session-delete` | ✅ 已发布 | 会话行悬停垃圾桶：确认后把会话目录送进 **Windows 系统回收站** |
| 消息提示 (Message Notice) | [`msg-notify/`](./msg-notify/) · `dsh-msg-notify` | ✅ 已发布 | 需要回答 / 输出完成 / 发生错误 / 卡住：四类场景各配提示音（音色与重复可调） |
| 启动动画 (Boot Animation) | — | 🚧 即将开源 | |
| 玻璃主题 (Glass Theme) | — | 🚧 即将开源 | |
| 全局规则 (Global Rules) | — | 🚧 即将开源 | |
| 思考档位 (Thinking Levels) | — | 🚧 即将开源 | |
| 技能侧栏 (Skills Sidebar) | [`skills-toggle/`](./skills-toggle/) · `dsh-skills-toggle` | ✅ 已发布 | 侧栏管理技能的「模型 / 手动」开关；分组折叠、一键开关、拖动排序与搜索 |
| 插件侧栏 (Plugins Sidebar) | — | 🚧 即将开源 | |
| MCP 侧栏 (MCP Sidebar) | — | 🚧 即将开源 | |
| UI 隐藏 (UI Hide) | — | 🚧 即将开源 | |
| 代理连接 (Proxy Connect) | — | 🚧 即将开源 | |
| 网页连接 (Web Connect) | — | 🚧 即将开源 | |
| MCP-OAuth 桥接 (MCP-OAuth Bridge) | — | 🚧 即将开源 | |

持续更新，敬请期待。

## 快速开始

1. 在 DSH 插件面板里选择对应子目录安装，或用 `plugin_manager install_bundle` 指向该子目录
2. 改了客户端半边（`lib/client.js`）要刷新页面；改了宿主半边（`lib/index.js`）要重新启用一次插件行（或重启）

### 环境要求

| 需要 | 说明 |
|---|---|
| Windows（仅 `session-delete`） | 回收站桥依赖 `powershell.exe` 与 `shell32.dll`。`msg-notify` 是纯客户端；`skills-toggle` 改受管技能 front matter 与 `~/.dsh/skills-toggle.json`，也不依赖回收站 |
| Node.js ≥ 18 | 跑插件测试时需要；装插件本身走 DSH |

## 项目结构

    session-delete/   会话删除插件（已发布）
    msg-notify/       消息提示插件（已发布）
    skills-toggle/    技能侧栏插件（已发布）
    LICENSE           MIT
    README.md         中文说明
    README.en.md      English

## 测试

每个已发布插件目录里都有 `node --test ./test/*.test.js`。回收站相关用例只在临时目录上建删还原，不碰真实 DSH 会话。

## 已知限制

- `session-delete` **只在 Windows 上能用**（依赖系统回收站）。`msg-notify` 是纯客户端提醒；`skills-toggle` 改受管技能 front matter 与 `~/.dsh/skills-toggle.json`，也不依赖回收站
- 「即将开源」的条目还在整理，目录与包名以后补上

## 许可证

MIT，见 [LICENSE](LICENSE)。© Song-812
