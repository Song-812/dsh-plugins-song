# 全局规则 · dsh-global-rules

[English](README.en.md) | 简体中文

在 DSH「设置 → 全局规则」页直接编辑 `$DSH_HOME/AGENTS.md`（默认 `~/.dsh/AGENTS.md`）——每次会话都会生效的那份规则。支持保存与「恢复默认」（清空前自动备份）。

- 作者：Song-812
- 版本：1.0.0
- 许可证：MIT

## 功能

| 能力 | 说明 |
| --- | --- |
| **打开即读** | 进入设置页读取规则文件；文件不存在时提示「保存将创建它」 |
| **保存** | 写回文件：新会话立即生效；当前会话在下次文件操作后感知新规则 |
| **恢复默认** | 确认后把规则清空（写成 0 字节）；清空前自动备份旧规则 |
| **双语** | 跟随 DSH 界面语言（确认钮与冲突提示也走词典） |
| **冲突检测** | 写请求排队，带 `baseVersion`；版本不符返回 409，界面提示「文件已被其他窗口修改」 |
| **安全写入** | 先落临时文件、读回校验再整体替换；符号链接写到真实目标，不把链接换成普通文件 |
| **失败提示** | 只显示「保存失败 / 读取失败 / 清空失败」，不暴露技术细节 |

标题「全局规则」与设置里其他插件页同字号字重（17px / 700 / 字距 .06em）；卡片与按钮样式也与其他插件页对齐。

## 规则文件与备份

| 东西 | 位置 |
| --- | --- |
| 规则文件 | `$DSH_HOME/AGENTS.md`（未设置时 `~/.dsh/AGENTS.md`） |
| 备份目录 | `$DSH_GLOBAL_RULES_BACKUP_DIR`（支持 `~/…`）；未设置时 `<DSH_HOME>/global-rules-backups/` |
| 备份文件名 | `AGENTS-<YYYYMMDD-HHmmss-SSS>.md`（含毫秒，只留最近一份有内容的） |

规则正文**不在插件目录里**；换电脑时请把 `AGENTS.md` 一起带走。本插件**不依赖** Windows 回收站。

## 接口

| 方法 | 路径 | 请求体 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/global-rules` | — | `{ exists, content, version }` |
| POST | `/api/global-rules` | `{ content, baseVersion? }` | `{ ok: true, version }` |
| POST | `/api/global-rules` | `{ action: "reset", baseVersion? }` | `{ ok: true, version }`（先备份再清空） |

请求体上限 256 KiB。`baseVersion` 与磁盘不符时返回 409。

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主半：GET/POST `/api/global-rules`（读、写、备份后清空） |
| `lib/client.js` | 客户端半：settings.section「全局规则」页（手写 bundle，无构建） |
| `cordis.patch.yml` | bundle patch：插入 `id=global-rules` |
| `locale/zh.json` · `locale/en.json` | 插件面板元数据（设置页文案在 `client.js` 的 DICTS） |
| `test/*.mjs` | 离线自测（宿主半 + 客户端半） |

## 安装与开发

安装：在 DSH 插件面板装本目录，或 `plugin_manager install_bundle` 指向包目录。

插件自带 `cordis.patch.yml`；profile 自己的 `cordis.patch.yml` **不要**再插一次同样的行（重复行 id 可能导致启动失败）。

改了 `lib/client.js` 要刷新页面；改了 `lib/index.js` 要重新启用一次插件行（或重启）。

```bash
cd global-rules
npm test   # node --test（会跑 test/ 下用例）
```

自测不碰真规则文件：宿主半把 `$DSH_HOME` 和备份目录都指到系统临时区。

## 已知限制

1. 规则文件路径固定为 `$DSH_HOME/AGENTS.md`（或默认 `~/.dsh/AGENTS.md`），本页不提供改路径的 UI。
2. 「恢复默认」是清空文件（0 字节），不是恢复某份内置模板正文。
3. 多窗口同时编辑靠 `baseVersion` 冲突检测；收到 409 后请重新打开设置页再存。

## 许可证

MIT，见仓库根目录 [LICENSE](../LICENSE)。© Song-812
