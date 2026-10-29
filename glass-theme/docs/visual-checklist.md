# 玻璃主题 · 视觉对照清单

本文记录玻璃主题需要处理的宿主面 / token 与对应做法（意图 / 现象，不含可执行样式）。

---

## 已知反馈（必须过）

| ID | 区域 | 宿主面 / token | 旧版如何处理（一句话） | 新包应对 |
|---|---|---|---|---|
| B1 | Windows 顶栏（应用/编辑/窗口按钮） | `header[data-window-drag]`；`body[data-windows-titlebar]` | 不把顶栏当成会话浮动卡；Windows 下主列圆角归零 | 顶栏单独全宽磨砂（无大 margin/圆角）；会话 `header` 另走浮动卡；`windows-titlebar` 时 center/right 圆角清零 |
| B2 | 输入区底部左右白块 | `[class*=composerSeat]`；`data-dsh-inputbar` / `data-composer-card` / `data-dsh-stats` | 双 class 命中 seat 去掉不透明底；有 stats 时外壳画玻璃、内层透明 | 同等 seat 透明化；seam 打标 inputbar/stats；融合态外壳磨砂 |
| B3 | 侧栏悬停变实白 | `[class*=sidebarCol]` + 悬停位移；`--dsw-specific-sidebar-fill` | 侧栏玻璃卡；fill 透明；设置对话框打开时去掉侧栏 blur；整列勿做 transform 以免打断 backdrop | fill/layer 半透；**整列** transform:none，列内可交互行单独上浮；对话框时 blur:none；nav hover 用半透混色 |
| B4 | 「新会话」按钮实白 | `button[class*=newSession]`；`--dsw-alias-button-floating-fill`；seam `data-dsh-surface` | surface 用 surface-frost 磨砂盖过 floating 实白 | 覆盖 floating-fill token；`[data-dsh-surface]`/`newSession` 自写磨砂+!important |

---

## 画布与背景

| ID | 区域 | 宿主面 / token | 旧版如何处理（一句话） | 新包应对 |
|---|---|---|---|---|
| C1 | 壁纸层 | `[data-glass-bg]` + `[data-glass-dim]`；frost / brightness-white|black | 磨砂=::after 软雾；亮度=子节点纯黑/白膜（50 透明） | 亮度≠filter；两层分离 |
| C2 | 主列透出壁纸 | `centerCol`/`conversation`/`frame`/`phase`/`#root` 等 | 多列背景改透明 | `html[data-glass]` 下列出稳定后缀/属性并 `transparent!important` |
| C3 | 右侧工具栏内实底 | `[data-sidebar-right-panel]` 内 `--dsw-alias-bg-layer-1` / `bg-base` | 面板作用域内把 layer-1 半透、base 透明 | 同意图 token 覆盖；pane 自写玻璃 |

---

## 主玻璃面板

| ID | 区域 | 宿主面 / token | 旧版如何处理（一句话） | 新包应对 |
|---|---|---|---|---|
| P1 | 会话顶栏 | `[data-phase] header` + `[data-conversation-content]` tuck | 上圆下开的一张浮动卡，正文上滑到卡下，勿成独立条带 | `border-radius:20px 20px 0 0` + 无底边/底影；body `margin-top:-95px`；scroll `padding-top:107px`；工具组去描边 |
| P2 | 侧栏列 | `[class*=sidebarCol]` + 子节点 `[data-glass-sidebar-fill]` | 玻璃卡；fill 不挂在伪元素（Electron backdrop 常失效）；侧栏自身无 backdrop 以保住 fixed toggle | seams 插入 fill：`blur(var(--glass-blur))` + `var(--glass-card-light\|dark)`；宿主 `backdrop-filter:none` |
| P3 | 输入卡 | `[data-composer-card]` | 24px 圆角磨砂 | 同结构自写磨砂 |
| P4 | 输入条融合 | `[data-dsh-inputbar]:has([data-dsh-stats])` | 外壳磨砂，卡与 stats 透明 | seam 打标后同结构 |
| P5 | 轨迹视图 | `[data-dsh-trajectory]` / composer-overlay | 独立玻璃板，内工具条透明 | seam + 磨砂 + 内透明 |
| P6 | 收起侧栏 / Windows 顶栏 toggle | `[class*=toggle][class*=iconButton]`；sidebarCol | 按钮在系统标题栏左上（应用旁），不在侧栏 logo 旁 | 侧栏磨砂改 `::before`（避免 backdrop 困住 fixed）；Windows 下显式 `position:fixed; left:12px; top:标题栏居中` |

---

## 控件与强调色

| ID | 区域 | 宿主面 / token | 旧版如何处理（一句话） | 新包应对 |
|---|---|---|---|---|
| T2 | 新会话 / + | `data-dsh-surface`、`data-dsh-add`、floating-fill | surface-frost / frost 磨砂 | 见 B4；+ 单独更透 |
| T3 | 权限/模型按钮 | `data-slot='conversation.input.*'` | 常驻浅磨砂底 + hover 提亮 | 自写同意图 |
| T4 | 菜单实底 | `--dsw-menu-surface-fill`；模型菜单特殊类 | 菜单加厚；模型列表实底去 blur | 菜单厚填；含模型选项的 menu 实底 |

---

## 可读性与列表

| ID | 区域 | 宿主面 / token | 旧版如何处理（一句话） | 新包应对 |
|---|---|---|---|---|
| Rec1 | 选项「推荐」标 | `[class*=optionLine] [class*=badge]`（QuestionComposer） | 浅粉底 + 深灰字可读；勿动铭牌 | `accent 22%+#fff` / `#152C45`；深色 `accent 28%+#0C121B` / `#DCE7F5` |
| R1 | 助手正文卡 | `[data-chat-flow-kind=assistant-step][data-chat-group-part=response]` | 结构命中加玻璃卡 | 保留结构选择器自写 |
| R2 | 代码块 token | `--dsw-alias-markdown-code-*` | 半透玻璃码块 | token 半透覆盖 |
| R3 | 插件/MCP/技能行 | `data-plugin-*`、`.mct-card`、`.dst-card`、`.plp-card` | 行级玻璃 + hover 半透 | 自写；hover 不用实白 |
| R4 | 小字对比度 | `--dsw-alias-label-secondary/tertiary/caption`；placeholder | 加深墨色达标 | 自写加深值 |
| R5 | 运行中文案 | `[class*=runningText]` 等 | 改成强调色 | 跟 `--glass-accent` |

---

## 动效 / 边缘

| ID | 区域 | 宿主面 / token | 旧版如何处理（一句话） | 新包应对 |
|---|---|---|---|---|
| E1 | 边缘渐变 | 自挂 top/bottom fade | 固定细带 blur | `[data-glass-fade]` |
| E2 | 鼠标辉光 | spot 属性 + glow | 伪元素/子节点径向光 | `[data-glass-spot]::before` + CSS 变量 |
| E3 | 悬停上浮 | press 属性（内部字段名保留） | 后改为 1px 上浮以免糊字；侧栏整列勿位移 | 面板与侧栏行 translateY(-1px)；**sidebarCol 整列**仍 transform:none |
| E4 | 深色铭牌 | wordmark 旁自挂 | 深色模式 Harness 光泽字 | `[data-glass-badge]`（已有 wordmark.ts） |

---

## Seam 打标（运行时钩子）

| ID | 属性 | 命中意图 | 新包 |
|---|---|---|---|
| S1 | `data-dsh-frame` | 侧栏列的父布局框 | `seams.ts` 自写 |
| S2 | `data-dsh-sidebar-root` | 侧栏内容根 | 同上 |
| S3 | `data-dsh-surface` | 新会话按钮 | 同上 |
| S4 | `data-dsh-inputbar` | composer 卡父级 | 同上 |
| S5 | `data-dsh-stats` / `data-dsh-add` / `data-dsh-trajectory` / `data-dsh-wordmark` | 统计行、+、轨迹、品牌 | 同上 |

> 属性名沿用宿主生态已出现的 `data-dsh-*` 稳定缝，便于与其它插件共存；实现与选择器列表为新包自维护。

---

## 无法仅靠对照断定的宿主面

- Electron/Windows **原生标题栏着色**是否另有 `titleBarOverlay` 主进程色：Web CSS 只能盖 `header[data-window-drag]`；若仍有一条系统级实色带，需桌面端配置配合。
- 宿主升级后 CSS Modules **局部类名后缀**若改名（如 `sidebarCol` → 其它），属性选择器会失效，需按新后缀补一行（不会崩）。
- 「新会话」若某版本不用 `newSession` 子串类名，依赖 `data-dsh-surface` seam；若按钮结构大变，seam 选择器要改。
- 部分插件页私有类（`.wq12jW_*` 模型菜单等）哈希可能变，清单里按「含模型选项的 menu」意图维护，遇失效再补稳定钩子。

---

条目统计：已知 bug 4 + 画布 3 + 面板 6 + 控件 4 + 可读性 5 + 动效 4 + seam 5 = **31**（另含「无法断定」4 条说明）。
