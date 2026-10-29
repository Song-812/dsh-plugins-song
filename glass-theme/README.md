# 玻璃主题 · dsh-glass-theme

[English](README.en.md) | 简体中文

给 DeepSeek Harness 桌面版加一层**玻璃拟态主题**：壁纸背景 + 磨砂玻璃面板，带全局重点色、悬停上浮、鼠标辉光、页面边缘渐变模糊，以及深色模式左下角 Harness 光泽铭牌。

- 作者：Song-812
- 版本：1.0.1
- 许可证：MIT

## 功能

| 区域 | 能力 |
|---|---|
| 主题 | 全局重点色（8 个预设 + 取色器，明暗两套）、玻璃模糊度、磨砂度 |
| 背景 | 壁纸（图片 / 视频）、壁纸模糊度 / 磨砂度、视频模糊度 / 亮度、背景亮度（跟随深浅模式） |
| 特效 | 悬停上浮、鼠标辉光（颜色跟随重点色） |
| 常开 | 可读性修复（气泡 / 正文卡 / 插件列表 / 代码块）、Space Grotesk 字体、上下边缘渐变模糊 |
| 深色 | 左下角 Harness 光泽铭牌（浅色模式不动） |

设置位置：**设置 → 玻璃主题**。页面顶部有「恢复默认」——**只重置参数与开关，不删壁纸**。

没有「主题总开关」：不想要主题时，在插件侧栏停用 `dsh-glass-theme` 即可，整层样式与节点会一起撤掉。

## 安装

需要 DSH 桌面版（`dsh` 引擎 `>=0.2.1-rc.3 <0.3.0`）。在 DSH 插件面板里安装本目录，或用 `plugin_manager install_bundle` 指向本目录。

装完**重启 DSH**（宿主半边在启动时加载），再按一次 Ctrl+Shift+R 刷新客户端。

## 壁纸保存在哪

壁纸文件写在**本插件目录**下的 `壁纸/`（不塞 localStorage，不占浏览器配额）：

- 选图 / 选视频 → 上传到该目录；当前文件名记在 `壁纸/state.json`（本机状态，**不要**提交进仓库）
- 设置页「打开文件夹」会在资源管理器打开它（Windows）
- 出厂图是 [`壁纸/默认壁纸.jpg`](壁纸/默认壁纸.jpg)；第一次安装且没有 `state.json` 时用它
- 删除壁纸只删当前用户上传文件（出厂图保留）
- 视频通过主机路由带 Range 返回，浏览器原生解码，循环播放

仓库里只收录出厂 `默认壁纸.jpg`；`wallpaper-*.*` 与 `state.json` 已在 `.gitignore` 中忽略。

## 配置

主题参数（模糊度、重点色、特效开关等）由设置页写入，随 DSH / 插件设置体系保存；壁纸文件本身在 `壁纸/`。

改完设置页一般刷新即可；动到宿主半边 `lib/index.js` 则须重启 DSH。

## 原理与边界

- Host 半：注册 `/api/glass-theme/*`（壁纸读写、字体、打开文件夹），文件落在插件目录 `壁纸/`
- Client 半：设置页 + 全局玻璃样式（挂在 `<html data-glass>` 下）；停用插件即整块失效
- 样式用宿主 CSS 模块的**语义后缀**命中（哈希会变，后缀更稳）；宿主大版本改后缀时对应面板可能退回原样，不会崩
- 视频壁纸链路主要在隔离环境验证过图片路径；真机视频循环请自行确认

## 文件结构

```
glass-theme/
  src/                    TypeScript 源码（host / client / shared）
  lib/                    构建产物（index.js 宿主 · client.js 浏览器）
  locale/                 中英文案
  assets/fonts/           Space Grotesk 子集
  壁纸/默认壁纸.jpg        出厂壁纸
  docs/                   视觉对照清单
  test/                   离线单元测试（*.test.mjs）
  build.mjs / check.mjs
  cordis.patch.yml
  README.md / README.en.md
```

## 开发与测试

```bash
npm install
npm test              # 纯逻辑单元测试
npm run build         # src/ → lib/
npm run check         # 产物自检（同 selfcheck）
```

浏览器视觉回归脚本（`test/*.browser.mjs`）依赖本机 Chrome 与宿主安装树，**未收录**进本开源包。

## 许可证

MIT。© Song-812
