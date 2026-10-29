# UI 隐藏 · dsh-ui-hide

[English](README.en.md) | 简体中文

按一份 JSON 清单，把不需要的界面入口藏起来；再加一个会话行上的「重命名」按钮，顶掉原来藏在「…」菜单里的那一条。

隐藏只叠一条 `display:none` 样式：不删功能、不改程序文件、不碰任何插件源码以外的东西。

- 作者：Song-812
- 版本：0.2.0
- 许可证：MIT

## 配置

清单文件：`$DSH_HOME/ui-hide.json`（默认 `~/.dsh/ui-hide.json`）。**插件不自带、也不会生成**这个文件——文件不存在时什么都不藏。

仓库里的 [`ui-hide.example.json`](ui-hide.example.json) 是一份示例清单：复制到上述路径并按需增删即可。

```json
{
  "enabled": true,
  "targets": [
    { "id": "more-sidebar", "selector": "nav[aria-label=\"全局面板\"] button[aria-haspopup=\"menu\"]", "note": "左侧栏「更多」" }
  ]
}
```

| 字段 | 含义 |
|---|---|
| `enabled` | 总开关。`false` 时一条规则都不生效，页面恢复原样（行上重命名按钮也一起消失） |
| `targets[].id` | 规则名，方便自己认；缺省自动编号 |
| `targets[].selector` | CSS 选择器。**不能含 `{ } ; < >`**，含了就整条丢弃 |
| `targets[].note` | 备注，只给人看 |

改完刷新页面（F5）生效，不需要重启 DSH。

## 示例清单里有什么

| id | 藏什么 |
|---|---|
| `more-sidebar` | 左侧栏底部「更多」 |
| `more-views` | 会话顶部「更多会话视图」 |
| `more-guide` | 右侧栏「开始」页「更多」 |
| `automation-entry` | 左侧栏「自动化任务」入口 |
| `session-row-archive` | 会话行 hover 出现的「归档」图标（菜单里的归档仍在） |
| `session-row-pin` | 会话行 hover 出现的「置顶 / 取消置顶」图标（菜单里的置顶仍在） |
| `menu-rename` | 会话「…」菜单里的「重命名」（已搬到行上） |
| `settings-open-config` | 所有设置页顶栏「打开配置文件」（关闭按钮保留；依赖当前宿主版本的专属类名，改版后需更新） |

这只是示例；选择器按某个 DSH 版本的页面结构编写，宿主改版后可能失效（失效等于不隐藏）。

## 会话行重命名

行上多出来的是一个 16px 图标按钮，位置在「…」右边、原来置顶/归档的位置，只在鼠标移到该行时出现。

点它之后是宿主自己的重命名行为：会话名原地变成输入框，回车保存、Esc 取消 —— 和从菜单里点「重命名」完全一样。

实现上不复制宿主的编辑逻辑：按钮先点开该行的「…」菜单，再在同一微任务里按下菜单里的重命名项。菜单来不及画出来，所以看到的就是行内输入框。

- 菜单项按 `aria-keyshortcuts="Control+Alt+G"` 定位，不按菜单位置，重排菜单也不会点错。
- 行上那个按钮的作用域是「这一行」：不会先切换当前会话。
- 快捷键 `Ctrl+Alt+G` 仍然可用。
- 找不到「…」按钮，或菜单 1.5 秒内没出现时，按钮放弃本次操作，不会做别的事。

## 加一条新规则

1. 浏览器里对着目标元素按 F12，右键 → 复制 → 复制 selector；
2. 剪掉可能出现的 `:nth-child()` 之类易变部分，优先用 `aria-label`、`data-*`、`class*=` 这类稳定钩子；
3. 加进 `targets`，刷新页面。

## 原理与边界

- Host 半：读 `ui-hide.json`，归一化后由 `GET /api/ui-hide` 返回。**只读，不写配置**——配置坏了最多不藏，不会弄坏页面。
- Client 半（隐藏）：拿到清单后生成 `selector{display:none !important}`，压进页面里唯一一个 `<style id="dsh-ui-hide-style">`。
- Client 半（重命名）：往 `sidebar.workspaces.session.row.action` 注册一个按钮（插槽 id `ui-hide-rename`，order 50），样式落在 `<style id="dsh-ui-hide-actions-style">`，随插件卸载一起移除。
- 只藏显示，功能仍在：键盘、工具、智能体调用都不受影响。
- 选择器失效只意味着「藏不住」，不会误藏别的元素（每条都是精确选择器）。
- 重命名项被藏起来后仍是可点元素（`display:none` 只影响绘制）：行上按钮靠程序点击它，不靠人眼点；菜单里用键盘方向键遍历时会跳过它。
- 「归档会话」「置顶会话」两条示例用的是中文界面文字，界面切成英文后会失效（重命名那条按快捷键属性定位，不受语言影响）。
- 行上按钮依赖「…」菜单里的重命名项存在；若宿主改了该菜单项或去掉了 `Ctrl+Alt+G`，按钮会静默失效（快捷键本身仍可用）。

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主半：读清单、归一化、提供 `GET /api/ui-hide` |
| `lib/client.js` | 客户端半：生成隐藏样式；注册会话行重命名按钮 |
| `cordis.patch.yml` | bundle patch：插入 `id/name = dsh-ui-hide` |
| `ui-hide.example.json` | 示例清单（复制到 `$DSH_HOME/ui-hide.json` 后使用） |
| `test/*.mjs` | 离线测试（无需安装 DSH） |

## 安装与停用

安装：在 DSH 插件面板装本目录，或 `plugin_manager install_bundle` 指向包目录。插件自带 `cordis.patch.yml`；profile 自己的 `cordis.patch.yml` **不要**再插一次同样的行。

改了 `lib/client.js` 后需重启 DSH 才会重新加载客户端 bundle；改清单只需刷新页面。

停用：在插件面板关掉，或把 `enabled` 改成 `false`。卸装：从 profile 的 dependencies 与 bundles 里移除 `dsh-ui-hide`。

无第三方 npm 依赖；Node 侧只用 `node:fs/promises`、`node:os`、`node:path`；客户端用宿主提供的 React。

## 测试

```bash
cd ui-hide
npm test
```

覆盖：非法选择器过滤、开关关闭、空清单、配置文件缺失/损坏、请求失败时不留残留样式；行按钮的插槽注册与渲染；点按钮先开菜单、菜单项出现即按下、菜单不出现时超时不误伤；菜单触发器定位；停用时接口清理。

## 许可证

MIT。© Song-812
