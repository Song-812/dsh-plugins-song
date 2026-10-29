# MCP 侧栏 · dsh-mcp-toggle

[English](README.en.md) | 简体中文

给 DSH 侧栏加一个「MCP」页：列出已配置的 MCP 服务器，每个服务器一个状态点、一个启用/停用开关。
支持分组折叠、分组头一键开关、拖动排序与搜索。显示偏好（含旧版已保存的自定义标题/分组名，仅继续显示、不再提供编辑）写在插件自己的状态文件里。开关走 DSH 官方 `pluginManager.setPluginEnabled`，热重载该行，无需重启。

- 作者：Song-812
- 版本：0.2.0
- 许可证：MIT

## 状态点与开关

| 控件 | 作用 |
| --- | --- |
| **状态点** | 🟢 已启用且有工具注册 / 🟠 已启用但没有任何工具（疑似断线、重连中，或该服务本身不提供工具）/ ⚪ 已停用 / 🔴 该行启动失败 |
| **开关** | 启用或停用这个 MCP 服务器（官方 Remote，即时生效） |

## 这一页还能怎么摆

| 控件 | 作用 |
| --- | --- |
| **六点手柄（行首）** | 按住约 300ms 进入拖动，在**组内**排序；拖到上下边缘会自动滚动 |
| **分组头手柄** | 拖动整组（当前通常只有一组，松手回原位） |
| **折叠 / 展开** | 只改界面；折叠状态会记住 |
| **一键旋钮（分组头右侧）** | 整组一起开 / 一起关；读不到或失败的行跳过并计数；旋钮方向会锁存 |
| **搜索** | 匹配原名、旧版自定义名、行 id、地址（不区分大小写；搜索词不落盘） |
| **恢复默认** | 清掉自定义名、排序、折叠等显示偏好（会先确认）；服务器开关不动 |

> 标题、分组名的**铅笔编辑入口已移除**。若状态文件里还留着旧版自定义名，页面会继续显示，但不能再改。要改请直接编辑状态文件，或点「恢复默认」。

## 原理与数据来源

| 环节 | 用什么 |
| --- | --- |
| 服务器清单与启用状态 | `remote.pluginManager.listPlugins()`，筛 `moduleName === "@deepseek-ai/dsh-mcp-client"` |
| 标题与地址 | 宿主半读 profile 的 `cordis.patch.yml` |
| 工具数量（状态点依据） | 宿主半读 `ctx.tools.schemas()`，按 `mcp__<serverName>__` 前缀统计 |
| 开关 | `remote.pluginManager.setPluginEnabled(...)` |
| 显示偏好 | 宿主半 `GET/POST /api/mcp-toggle` ↔ `~/.dsh/mcp-toggle.json` 的 `prefs` |

**宿主半只写显示偏好**（`prefs`）。服务器配置、开关状态、技能文件它一个都不碰——开关由面板调官方 Remote 完成。

## 安全：不泄露凭据

MCP 配置里常常带令牌。宿主半只上报：

- `headers` / `env` 的**键名**，值一律不取；
- 地址脱敏：`user:pass@` → `<hidden>@`，查询串 / 锚点 → `<hidden>`；
- 参数中含 `token/key/secret/password/auth` 的 `k=v`、长随机串，以及 `Bearer`/`Basic`/`Token` 等带空格的鉴权片段 → `<hidden>`；
- `!!js` 表达式 → 显示为 `<expression>`。

离线测试会断言模块输出中不得出现假令牌原文。

## 显示偏好存在哪

只存在插件自己的状态文件 `~/.dsh/mcp-toggle.json` 的 `prefs` 字段（标题、分组名、排序、折叠、旋钮方向）。**不写** profile 的 `cordis.patch.yml`（开关覆盖由官方 Remote 写）、也不写别的插件的文件。

换电脑或删掉状态文件，摆布会丢；MCP 服务器本身的启用状态不受影响。

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主半：读 patch / 工具数、状态文件（含 `prefs`）、`/api/mcp-toggle` |
| `lib/client.js` | 客户端半：侧栏「MCP」页；手写、无构建 |
| `cordis.patch.yml` | 插件行声明 |
| `test/*.mjs` | 离线自测（含 host/client smoke） |

## 安装与开发

安装：在 DSH 插件面板装本目录，或 `plugin_manager install_bundle` 指向包目录。

插件自带 `cordis.patch.yml`；profile 自己的 `cordis.patch.yml` **不要**再插一次同样的行（重复行 id 会导致启动失败）。

改了 `lib/client.js` 要刷新页面；改了 `lib/index.js` **必须重启一次 DSH**（或重新启用插件行）。

```bash
cd mcp-toggle
npm test   # node --test（会跑 test/ 下全部用例，含 host/client smoke）
```

`node --test` 会跑 `test/` 下的脚本。两条 smoke 分别覆盖宿主半（临时目录闭环）和客户端半（假 React / 迷你渲染器），都不需要真开 DSH 或浏览器。

## 已知限制

1. **读不到「连接状态」**。`@deepseek-ai/dsh-mcp-client` 不注册连接状态服务；状态点只能用「工具是否注册着」推断。橙色是推断，不是官方结论（例如某个 MCP 本身不提供工具）。
2. **读不到失败原因**。要排查请看运行 DSH 的终端输出。
3. **只列 Loader 行里的 MCP**（写在配置里的）。运行时由其它途径挂上的 MCP 不会出现。
4. **不做增删改服务器**：要加/改服务器，仍编辑 profile 的 `cordis.patch.yml`。
5. `fiberPhase: active` **不等于已连接**（默认 `failOnStartupError: false` 可能吞掉首次连接失败）。
6. 拖动手感依赖真实指针；离线测试只覆盖逻辑，不替代真机手感。

## 如何重新连接

需要重新连接时，先关闭对应 MCP，等操作完成后再开启；若出现失败或需要重启的提示，请按提示处理。

## 许可证

MIT，见仓库根目录 [LICENSE](../LICENSE)。© Song-812
