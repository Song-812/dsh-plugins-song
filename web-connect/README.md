# 网页连接 · dsh-web-connect

[English](README.en.md) | 简体中文

分开处理两件事：让 DSH **自己验证界面**，以及按用户要求在**日常浏览器**打开已登录的网页版。不依赖外部脚本或全局规则里的旧入口。

- 作者：Song-812
- 版本：0.1.0
- 许可证：MIT

## 两个工具

| 工具 | 什么时候用 | 发生什么 |
| --- | --- | --- |
| **`dsh_web_verify`** | 「检查你自己的界面修改效果」之类 | 在现有 **chrome-devtools MCP** 浏览器里复用 / 新建 DSH 页面，完成本机登录后返回 `pageId`；智能体再继续截图、快照、检查实际改动 |
| **`dsh_web_open`** | 用户明确说「帮我打开网页版」 | 用系统默认浏览器打开已登录的 DSH（Windows 用 `rundll32`；macOS / Linux 回退 `open` / `xdg-open`），只确认浏览器已领取登录状态 |

可选参数只有本站 `path`（默认 `/`）。**不要**传完整网址、认证参数或令牌。入口连接成功 **不等于** 界面改动验证成功——智能体必须继续检查目标内容。系统浏览器入口只确认登录交接，不读取用户浏览器内容。

## 原理与边界

| 归它管 | 不归它管 |
| --- | --- |
| 本机回环上的一次性登录入口 | 远程 / 非回环绑定 |
| 验证浏览器（chrome-devtools MCP）里的登录与页面挑选 | 任意 MCP 工具调用（只允许列举 / 选择 / 导航 / 只读检查） |
| 系统默认浏览器领取登录状态 | 读取用户浏览器内容、凭据文件、重签 Cookie |

技术要点（简）：

- 通过 `webServer.getOrigin()` 取实际端口，通过 `connection.authenticatedUrl()` 使用 DSH 进程内官方认证；原生 Node HTTP(S) 在宿主内交换官方 HttpOnly Cookie，再由同源一次性随机入口交给浏览器。
- **认证地址不进入**模型参数、工具结果或插件日志；不读凭据文件、不重签 Cookie、不依赖 Python / 旧脚本。
- 一次性入口：仅本机连接、正确 Host、GET；**60 秒**过期，用过即废。插件停用时撤销路由与未用入口。
- 只支持回环；HTTPS 走系统证书校验，不绕过证书错误。
- 验证入口复用当前智能体可见的 chrome-devtools 工具；MCP 未启用或无权时明确失败。
- 与其他出网相关插件**保持独立**：认证请求走 Node 原生 HTTP(S)，不经过网页抓取类 provider；不改全局代理或 Chrome 配置。系统代理 / TUN 的实际影响以本机桌面实例为准。

插件通过自身工具说明和随启停的 `systemPrompt` 段指明新入口，替代旧全局规则里对 `open_dsh_web.cmd` / `dsh_web_auth.py` 一类脚本的建议（请勿同时跑旧脚本）。

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | Cordis 插件：两个智能体工具、提示段、默认浏览器调用 |
| `lib/connect.js` | 本机认证交接、一次性入口、浏览器连接流程 |
| `cordis.patch.yml` | bundle patch：插入 `id/name = dsh-web-connect` |
| `test/connect.test.js` · `test/plugin.test.js` | 离线行为测试 |
| `test/runtime-smoke.mjs` | 可选：真实 DSH 运行时 / 浏览器联测（需本机已装 DSH） |

## 安装与开发

安装：在 DSH 插件面板装本目录，或 `plugin_manager install_bundle` 指向包目录。

插件自带 `cordis.patch.yml`；profile 自己的 `cordis.patch.yml` **不要**再插一次同样的行（重复 id 可能导致启动失败）。

登记后请**重启 DSH**，让当前会话重新拿到工具。可在插件面板停用：停用会注销工具、提示段和一次性入口。

改了 `lib/`（宿主半）后：重新启用一次插件行，或重启。本插件**没有**客户端半边，一般不用只刷页面。

本插件**不依赖** Windows 回收站；默认浏览器打开在 Windows 上主测，macOS / Linux 有回退命令。验证模式需要已启用的 **chrome-devtools MCP**。日常运行无 Python / npm 额外依赖。

## 测试

离线：

```bash
cd web-connect
npm test
# 或：node --test test/*.test.js
```

可选真实运行时（需本机 DSH 安装与环境变量）：

```bash
# 默认：只检查官方 Cordis / tools / WebServer / 认证是否能挂上
node test/runtime-smoke.mjs

# 另开临时无界面 Chrome（需 DSH_TEST_NODE 指向本机 node）：
# DSH_TEST_CHROME=1 DSH_TEST_NODE=/path/to/node node test/runtime-smoke.mjs

# 再验系统默认浏览器（会打开清楚标记的临时测试页）：
# DSH_TEST_USER=1 node test/runtime-smoke.mjs
```

测试只用内存里的测试认证记录，不读真实密钥、不调模型 API。MCP 联测使用本机已装的 chrome-devtools-mcp，不下载软件。

## 许可证

MIT。© Song-812
