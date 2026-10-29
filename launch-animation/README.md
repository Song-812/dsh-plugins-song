# 启动动画 · dsh-launch-animation

[English](README.en.md) | 简体中文

给 DeepSeek Harness 桌面版加一段**开机动画**：窗口一出现就用自定义图跑一段线稿描边动画，盖住 DSH 自带的 `HARNESS / Loading plugins…` 卡片；等界面**真的就绪**再揭幕，然后把自己整套卸干净。

- 作者：Song-812
- 版本：1.0.0
- 许可证：MIT

## 功能

- **官方注入通道**：只用 `webserver/index-inject` 注入行（`global` + `script`），**不改 DSH 安装目录**。
- **Shadow DOM 覆盖层**：不碰 DSH 自己的 DOM；卸载时删覆盖层、摘掉键盘监听、清掉定时器。
- **素材内联**：线稿 + 成品图 + 品牌灰鲸在构建时写进 `lib/payload.json`，运行时零网络请求。
- **装上就播**：设置页没有总开关；想停用就在插件侧栏停用整个插件。
- **随时跳过**：Esc / 点击画面；界面就绪前会钉在等待屏；超过 25 秒兜底放行。

## 安装

需要 DSH 桌面版（0.2.0-rc.2 起）。在 DSH 插件面板里安装本目录，或用 `plugin_manager install_bundle` 指向本目录。

装完**重启 DSH**（宿主插件在启动时加载），下次打开就能看到动画。

## 配置

设置页在「设置 → 启动动画」，可切档位、上传头像与开机素材、一键恢复默认。也可以直接改文本文件：

`$DSH_HOME/launch-animation/settings.json`（默认 `~/.dsh/launch-animation/settings.json`）

仓库里的 [`settings.example.json`](settings.example.json) 是一份与内置默认值一致的示例：**不要**把本机真实设置原样提交进仓库。

| 键 | 含义 | 默认 |
|---|---|---|
| `mode` | `full` 完整档约 14.5 秒；`fast` 简版约 4 秒 | `full` |
| `showSkipHint` | 是否显示「点击 / Esc 跳过」提示（关掉后 Esc 仍有效） | `true` |
| `identityMode` | `brand` 内置灰鲸；`custom` 自定义头像；`none` 不显示 | `brand` |
| `identityImage` | `custom` 时：仅允许 `$DSH_HOME/launch-animation/uploads/` 下的文件名 | `""` |
| `captionMode` | 顶部原生标题栏：`transparent` / `match` / `off` | `transparent` |

改完刷新页面即可（动到宿主半边 `lib/index.js` 则须重启 DSH）。自定义素描图需要本机 Python（opencv-python + numpy）；只用内置素材则不受影响。

## 默认素材说明

| 文件 | 用途 |
|---|---|
| `assets/brand-whale.png` | 默认身份标识（品牌灰鲸） |
| `assets/artwork.jpg` | 默认素描参考图（线稿描边动画的源图） |
| `assets/contours.json` | 由默认素描图预计算的线稿路径 |
| `lib/payload.json` | 构建产物：CSS / 注入脚本 / 内联素材 |

上传自定义头像或素描后，文件落在 `$DSH_HOME/launch-animation/uploads/`（及 `artwork/`），**不会**写回本插件目录。

## 原理与边界

- Host 半：读设置、注册 `/api/launch-animation`，按配置生成注入行。
- Client 半：设置页 + 诊断上报；真正的动画在注入脚本的 Shadow DOM 里跑。
- 覆盖的是 **DSH 客户端窗口**，不是操作系统屏幕；任务栏不盖。
- Windows 标题栏按钮由系统绘制：深浅主题下用浅色/深色压条兜对比度，但**标题栏颜色本身不归本插件管**。
- 若 DSH 大版本改了启动 DOM（`[data-dsh-boot]` / `#root`），就绪判定可能失效——失效时按 25 秒兜底放行，不会卡死。

## 文件结构

```
launch-animation/
  assets/                 默认素材与动画源模板
  lib/                    宿主 / 客户端 / 素材处理 / payload
  test/                   离线回归
  cordis.patch.yml        挂载行
  settings.example.json   示例配置
  check.mjs               可选体检
  README.md / README.en.md
```

## 测试

```bash
npm run check
npm test
npm run selfcheck   # 可选
```

## 许可证

MIT。© Song-812
