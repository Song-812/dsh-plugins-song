# 思考档位 · dsh-reasoning-effort

[English](README.en.md) | 简体中文

在输入框的模型座位上提供「想多深」的档位滑条，外加一颗加速版闪电开关。

这是 DeepSeek Harness 的 Web 插件。它不接管模型配置，也不改写官方目录：档位始终按 DSH 官方的模型元数据走，插件只负责把选择做得顺手。

- 作者：Song-812
- 版本：1.0.0
- 许可证：MIT

## 功能

- **档位滑条**：粗轨道、离散档位，拖动时实时预览，松手才提交；最高档带紫色辉光、边缘闪烁和拖尾特效。
- **两档显示 Off / On**：模型只公布两个档位时，自动把界面显示成开关，而不是滑条。
- **加速档闪电**：输入框那颗和弹窗顶栏那颗是同一个开关，点一下在「普通版 ↔ 加速版」之间互切；在 flash 模型上两颗都置灰。
- **模型列表**：按 Provider 分组折叠，先选 Provider 再选模型；可以藏掉加速版模型，只能通过闪电到达。
- **切回默认**：弹窗右上角按钮，一键切到 DeepSeek-V4.1-Flash + High，同时把新会话默认设成这个组合。
- **键盘操作**：↑↓ 移动、Home / End 跳首尾、Enter 确认、Esc 关闭；只有进入列表和键盘移动时才滚动，展开/收起 Provider 不会把列表拽回去。
- **切换不闪回**：模型和档位先在前端暂存，关闭选择框时一起提交。

## 配置

配置不在 DSH 的设置页里，而是插件自己的文本文件：

`$DSH_HOME/reasoning-effort/settings.json`（默认 `~/.dsh/reasoning-effort/settings.json`）

仓库里的 [`settings.example.json`](settings.example.json) 是一份示例：复制到上述路径并按需改即可。文件不存在时按内置默认值走；写坏时也会回落默认值。

| 键 | 作用 | 默认 |
| --- | --- | --- |
| `turboBaseModelId` | 普通版模型 id | `mimo-v2.6-pro` |
| `turboModelId` | 加速版模型 id | `mimo-v2.6-pro-ultraspeed` |
| `boltOnFlash` | flash 上闪电能不能点 | `false`（置灰） |
| `hiddenModels` | 从模型列表里藏掉的模型 id | 默认藏加速版 |

改完刷新页面生效（不走 DSH settings 热更新）。

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主半：注册 `/api/reasoning-effort`（GET/POST）读写 settings.json |
| `lib/settings.js` | settings.json 的读取、合并与原子写入 |
| `lib/client.js` | 客户端半：手写实现，无构建步骤，由 `window.__ModuleLoader__` 加载 |
| `cordis.patch.yml` | bundle patch：插入 `id/name = dsh-reasoning-effort`（无可配字段） |
| `locale/` | 语言覆盖锚点 |
| `settings.example.json` | 示例配置（复制到 `$DSH_HOME/reasoning-effort/settings.json`） |
| `test/*.test.mjs` | 离线测试（无需安装 DSH） |

## 安装与停用

安装：在 DSH 插件面板装本目录，或 `plugin_manager install_bundle` 指向包目录。插件自带 `cordis.patch.yml`；profile 自己的 `cordis.patch.yml` **不要**再插一次同样的行。包名 `dsh-reasoning-effort` 不能改，DSH 靠它解析插件行。

改了 `lib/client.js` 后需重启 DSH 才会重新加载客户端 bundle；改宿主半边（`lib/index.js` / `lib/settings.js`）要重新启用一次插件行（或重启）；改配置只需刷新页面。

停用：在插件面板关掉。卸装：从 profile 的 dependencies 与 bundles 里移除 `dsh-reasoning-effort`。

无第三方 npm 依赖；宿主侧只用 Node 内置模块；客户端用宿主提供的 React。

## 测试

```bash
cd reasoning-effort
npm test
npm run check
```

覆盖：切回默认的成功 / 失败 / 忙碌复位流程；滑条点击、拖动、取消、键盘与禁用态。

## 已知限制

- 任何一次切模型（点闪电、点切回默认、在列表里选模型）都会顺手改「新会话默认模型」，这是 DSH 内核行为，插件拦不住。
- 加速档依赖 settings.json 里配的模型 id；模型改名或下线后需要同步改配置。
- 只按 DSH 官方模型目录取档位，不再自己补档位，所以没有官方档位声明的模型不会显示控件。

## 许可证

MIT。© Song-812
