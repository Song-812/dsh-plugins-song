// dsh-glass-theme — 浏览器半边（构建产物，别手改；改 src/ 后跑 npm run build）。
window.__ModuleLoader__.load({
  id: 'dsh-glass-theme',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    "use strict";
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    // src/client/index.tsx
    var index_exports = {};
    __export(index_exports, {
      default: () => index_default
    });
    module.exports = __toCommonJS(index_exports);

    // src/client/theme.css
    var theme_default = `/* 玻璃主题 · 全局样式
     *
     * 对照清单：docs/visual-checklist.md（表面意图 / token / 现象）。
     * 分十段：字体 / 变量 / 背景层 / 透明化 / 玻璃面板 / 浮层 / 消息内容 /
     * 插件页 / 控件 / 细节与深色。所有规则挂在 <html data-glass> 下，
     * 插件停用即整块失效。
     */
    /* ---------- 1. 字体（Space Grotesk 三段子集，主机路由提供） ---------- */
    @font-face{font-family:"Space Grotesk Variable";font-style:normal;font-display:swap;font-weight:300 700;src:url("/api/glass-theme/font?i=1") format("woff2");unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
    @font-face{font-family:"Space Grotesk Variable";font-style:normal;font-display:swap;font-weight:300 700;src:url("/api/glass-theme/font?i=2") format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
    @font-face{font-family:"Space Grotesk Variable";font-style:normal;font-display:swap;font-weight:300 700;src:url("/api/glass-theme/font?i=3") format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}

    /* ---------- 2. 变量 ---------- */
    html[data-glass]{
      --glass-accent:#F077AF;
      --glass-accent-ink:#13243E;
      --glass-blur:14px;
      --glass-frost:.24;
      --glass-surface-frost:.64;
      --glass-wallpaper-blur:0px;
      --glass-wallpaper-frost:0;
      --glass-video-blur:6px;
      --glass-video-dim:.3575;
      --glass-brightness-white:0;
      --glass-brightness-black:0;
      --glass-card-light:color-mix(in srgb, #fff calc(42% * var(--glass-frost)), transparent);
      --glass-card-dark:color-mix(in srgb, #22262f calc(50% * var(--glass-frost)), transparent);
      --glass-edge:#132d530c;
      --glass-edge-dark:#94b4dc28;
      --glass-hi:#ffffff40;
      --glass-hi-dark:#ffffff12;
      --glass-shadow:0 6px 22px #132d530e;
      --glass-shadow-dark:0 6px 22px #02060e2e;
      --glass-radius:20px;
      --glass-spot-color:color-mix(in srgb,var(--glass-accent) 20%,transparent);
    }
    html[data-glass] body{
      background:var(--dsw-alias-bg-base);
      --dsw-font-family:'Space Grotesk Variable',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;
      accent-color:var(--glass-accent);
    }
    /* 重点色：主按钮、选中态、侧栏强调、悬停淡染。全部由 --glass-accent 推导。 */
    html[data-glass] body:not([data-ds-dark-theme]){
      --dsw-alias-border-l3:transparent!important;
      --dsw-alias-border-l2:rgba(19,45,83,.06)!important;
      --dsw-alias-button-elevated-fill:color-mix(in srgb,#fff calc(50% * var(--glass-surface-frost)),transparent)!important;
      --dsw-alias-state-business-primary:var(--glass-accent)!important;
      --dsw-alias-state-business-tertiary:color-mix(in srgb,var(--glass-accent) 18%,#fff)!important;
      --dsw-alias-button-primary-fill:var(--glass-accent)!important;
      --dsw-alias-button-primary-hover:color-mix(in srgb,var(--glass-accent) 78%,#fff)!important;
      --dsw-alias-button-primary-dimmed:color-mix(in srgb,var(--glass-accent) 22%,#fff)!important;
      --dsw-alias-button-info-fill:var(--glass-accent)!important;
      --dsw-alias-button-info-hover:color-mix(in srgb,var(--glass-accent) 78%,#fff)!important;
      --dsw-alias-button-floating-fill:color-mix(in srgb,#fff calc(62% * var(--glass-surface-frost)),transparent)!important;
      --dsw-alias-button-floating-hover:color-mix(in srgb,var(--glass-accent) 10%,transparent)!important;
      --dsw-alias-button-ghost-active-fill:color-mix(in srgb,var(--glass-accent) 14%,#fff)!important;
      --dsw-alias-button-ghost-active-hover:color-mix(in srgb,var(--glass-accent) 8%,#fff)!important;
      --dsw-alias-button-ghost-active-border:color-mix(in srgb,var(--glass-accent) 40%,#fff)!important;
      --dsw-alias-label-primary-bluish:var(--glass-accent)!important;
      --dsw-alias-brand-primary:var(--glass-accent)!important;
      --dsw-alias-interactive-bg-hover:color-mix(in srgb,var(--glass-accent) 10%,transparent)!important;
      --dsw-alias-interactive-bg-active:color-mix(in srgb,var(--glass-accent) 16%,transparent)!important;
      --dsw-alias-interactive-bg-hover-accent:color-mix(in srgb,var(--glass-accent) 14%,transparent)!important;
      --dsw-specific-sidebar-nav-item-active-accent:var(--glass-accent)!important;
      --dsw-specific-sidebar-nav-item-active:color-mix(in srgb,var(--glass-accent) 14%,transparent)!important;
      --dsw-specific-sidebar-nav-item-hover:color-mix(in srgb,var(--glass-accent) 10%,transparent)!important;
      --dsw-alias-label-secondary:#152C45!important;
      --dsw-alias-label-tertiary:#1A3350!important;
      --dsw-alias-label-caption:#1C3854!important;
      --accent:var(--glass-accent)!important;
      --dsw-specific-sidebar-fill:transparent!important;
      --dsw-alias-bg-layer-1:color-mix(in srgb,#fff calc(55% * var(--glass-frost)),transparent)!important;
      --dsw-alias-interactive-bg-hover-solid:color-mix(in srgb,var(--glass-accent) 8%,transparent)!important;
    }
    html[data-glass] body[data-ds-dark-theme]{
      --dsw-alias-border-l3:transparent!important;
      --dsw-alias-border-l2:rgba(148,180,220,.10)!important;
      --dsw-alias-button-elevated-fill:color-mix(in srgb,#2a2e38 calc(50% * var(--glass-surface-frost)),transparent)!important;
      --dsw-alias-state-business-primary:var(--glass-accent)!important;
      --dsw-alias-state-business-tertiary:color-mix(in srgb,var(--glass-accent) 24%,#0C121B)!important;
      --dsw-alias-button-primary-fill:var(--glass-accent)!important;
      --dsw-alias-button-primary-hover:color-mix(in srgb,var(--glass-accent) 72%,#fff)!important;
      --dsw-alias-button-primary-dimmed:color-mix(in srgb,var(--glass-accent) 26%,#0C121B)!important;
      --dsw-alias-button-info-fill:var(--glass-accent)!important;
      --dsw-alias-button-info-hover:color-mix(in srgb,var(--glass-accent) 72%,#fff)!important;
      --dsw-alias-button-floating-fill:color-mix(in srgb,#2a2e38 calc(62% * var(--glass-surface-frost)),transparent)!important;
      --dsw-alias-button-floating-hover:color-mix(in srgb,var(--glass-accent) 14%,transparent)!important;
      --dsw-alias-button-ghost-active-fill:color-mix(in srgb,var(--glass-accent) 18%,#0C121B)!important;
      --dsw-alias-button-ghost-active-hover:color-mix(in srgb,var(--glass-accent) 10%,#0C121B)!important;
      --dsw-alias-button-ghost-active-border:color-mix(in srgb,var(--glass-accent) 45%,#0C121B)!important;
      --dsw-alias-label-primary-bluish:var(--glass-accent)!important;
      --dsw-alias-brand-primary:var(--glass-accent)!important;
      --dsw-alias-interactive-bg-hover:color-mix(in srgb,var(--glass-accent) 14%,transparent)!important;
      --dsw-alias-interactive-bg-active:color-mix(in srgb,var(--glass-accent) 22%,transparent)!important;
      --dsw-alias-interactive-bg-hover-accent:color-mix(in srgb,var(--glass-accent) 18%,transparent)!important;
      --dsw-specific-sidebar-nav-item-active-accent:var(--glass-accent)!important;
      --dsw-specific-sidebar-nav-item-active:color-mix(in srgb,var(--glass-accent) 20%,transparent)!important;
      --dsw-specific-sidebar-nav-item-hover:color-mix(in srgb,var(--glass-accent) 14%,transparent)!important;
      --dsw-alias-label-secondary:#DCE7F5!important;
      --dsw-alias-label-tertiary:#CBD9EA!important;
      --dsw-alias-label-caption:#C2D2E6!important;
      --accent:var(--glass-accent)!important;
      --dsw-specific-sidebar-fill:transparent!important;
      --dsw-alias-bg-layer-1:color-mix(in srgb,#0d1622 calc(60% * var(--glass-frost)),transparent)!important;
      --dsw-alias-interactive-bg-hover-solid:color-mix(in srgb,var(--glass-accent) 12%,transparent)!important;
    }

    /* ---------- 3. 背景层 ---------- */
    html[data-glass] [data-glass-bg]{
      position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;
    }
    html[data-glass] [data-glass-bg] img,
    html[data-glass] [data-glass-bg] video{
      position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;
    }
    html[data-glass] [data-glass-bg][data-media=image] video,
    html[data-glass] [data-glass-bg][data-media=video] img{display:none}
    /* 壁纸/视频只做 blur；亮度不走 filter（避免像对比度压中间调） */
    html[data-glass] [data-glass-bg] img{filter:blur(var(--glass-wallpaper-blur))}
    html[data-glass] [data-glass-bg] video{filter:blur(var(--glass-video-blur))}
    /* 背景亮度：显式子节点黑/白膜（::before 会被 img/video 盖住）。50=全透明 */
    html[data-glass] [data-glass-bg] [data-glass-dim]{
      position:absolute;inset:0;pointer-events:none;z-index:1;
      background:
        linear-gradient(rgba(255,255,255,var(--glass-brightness-white)),rgba(255,255,255,var(--glass-brightness-white))),
        linear-gradient(rgba(0,0,0,var(--glass-brightness-black)),rgba(0,0,0,var(--glass-brightness-black)));
    }
    /* 壁纸磨砂：::after 软雾面，叠在亮度膜之上；与黑白膜分离 */
    html[data-glass] [data-glass-bg]::after{
      content:"";position:absolute;inset:0;pointer-events:none;z-index:2;
      background:rgb(255 255 255/var(--glass-wallpaper-frost));
    }
    html[data-glass] body[data-ds-dark-theme] [data-glass-bg]::after{
      background:rgb(12 18 27/var(--glass-wallpaper-frost));
    }
    /* 视频：::after 改走 videoBrightness 压暗雾；亮度黑白仍由 data-glass-dim 负责，两层可叠 */
    html[data-glass] [data-glass-bg][data-media=video]::after{
      background:rgb(255 255 255/calc(var(--glass-video-dim) * 1.3));
    }
    html[data-glass] body[data-ds-dark-theme] [data-glass-bg][data-media=video]::after{
      background:rgb(8 12 20/var(--glass-video-dim));
    }

    /* ---------- 4. 主体透明化（让壁纸透出来） ---------- */
    html[data-glass] [class*=centerCol],
    html[data-glass] [class*=rightbarCol],
    html[data-glass] [data-testid=conversation],
    html[data-glass] [class*=conversation],
    html[data-glass] [class*=threadCol],
    html[data-glass] [class*=chatCol],
    html[data-glass] [class*=contentCol],
    html[data-glass] [class*=mainCol],
    html[data-glass] [class*=sessionCol],
    html[data-glass] [data-dsh-frame],
    html[data-glass] [data-phase],
    html[data-glass] [class$="_frame"],
    html[data-glass] [class*=quietBars],
    html[data-glass] #root{background:transparent!important}
    /* B2：去掉 composerSeat 不透明底条，避免底部左右白块。
       宿主 .composerSeat 特异性 (0,3,0)，双属性选择器才能压过，否则底部左右实心白块。 */
    html[data-glass] [data-phase] [class*=composerSeat][class*=composerSeat]{
      background:none!important;
    }
    html[data-glass] [data-sidebar-right-panel] [data-dockkit-pane],
    html[data-glass] [data-sidebar-right-panel] [data-dockkit-pane-body],
    html[data-glass] [data-sidebar-right-panel] [data-dockkit-content],
    html[data-glass] [data-sidebar-right-panel] [data-sidebar-right-session],
    html[data-glass] [data-sidebar-right-panel] [data-sidebar-right-tab]{background:transparent!important}
    html[data-glass] [data-sidebar-right-panel]{
      --dsw-alias-bg-layer-1:color-mix(in srgb,#fff calc(55% * var(--glass-frost)),transparent)!important;
      --dsw-alias-bg-base:transparent!important;
    }
    html[data-glass] body[data-ds-dark-theme] [data-sidebar-right-panel]{
      --dsw-alias-bg-layer-1:color-mix(in srgb,#0d1622 calc(60% * var(--glass-frost)),transparent)!important;
      --dsw-alias-bg-base:transparent!important;
    }

    /* ---------- 5. 玻璃面板 ---------- */
    /* B1：Windows 顶栏全宽磨砂（不当成会话浮动卡） */
    html[data-glass] header[data-window-drag],
    html[data-glass] header[data-window-drag=true]{
      background:var(--glass-card-light)!important;
      backdrop-filter:blur(var(--glass-blur))!important;
      -webkit-backdrop-filter:blur(var(--glass-blur))!important;
      border:none!important;
      border-radius:0!important;
      box-shadow:none!important;
      margin:0!important;
    }
    html[data-glass] body[data-ds-dark-theme] header[data-window-drag],
    html[data-glass] body[data-ds-dark-theme] header[data-window-drag=true]{
      background:var(--glass-card-dark)!important;
    }
    /* 官方插件页顶栏（[data-plugin-panel] > header）也带 data-window-drag 做拖窗，
       不能套上面 Windows 顶栏磨砂；宿主本身无底色，保持透明。非 sticky，去底后无内容穿插。 */
    html[data-glass] [data-plugin-panel] > header[data-window-drag],
    html[data-glass] [data-plugin-panel] > header[data-window-drag=true]{
      background:transparent!important;
      backdrop-filter:none!important;
      -webkit-backdrop-filter:none!important;
      border:none!important;
      border-radius:0!important;
      box-shadow:none!important;
      margin:0!important;
    }
    /* P1：会话顶栏 = 开口朝下的圆弧浮动卡（header + scroll tuck）
       现象：四角全圆 + 底部分隔/阴影 ⇒ 像独立 UI 条。
       做法：上圆下开、去掉底边与底阴影、正文列上滑到卡下、工具组去描边。 */
    html[data-glass] [data-phase] header{
      background:var(--glass-card-light)!important;
      backdrop-filter:blur(var(--glass-blur))!important;
      -webkit-backdrop-filter:blur(var(--glass-blur))!important;
      /* 侧/顶沿用玻璃边，底边完全打开（不只改 color，连 width 也清掉） */
      border:1px solid rgba(19,45,83,.18)!important;
      border-bottom:none!important;
      /* 上圆下开：与正文连成一张开口朝下的卡，而不是封闭条带 */
      border-radius:20px 20px 0 0!important;
      /* 阴影只落在顶/侧，避免底边一道「悬浮条」投影把卡封死 */
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.42),
        -10px 4px 28px -12px rgba(19,45,83,.14),
        10px 4px 28px -12px rgba(19,45,83,.14)!important;
      margin:12px 16px 0!important;
      padding:10px 16px 8px!important;
      z-index:8!important;
      position:relative!important;
      background-clip:padding-box!important;
      isolation:isolate;
    }
    html[data-glass] [data-phase] header::after,
    html[data-glass] [data-phase] header::before{content:none!important;display:none!important}
    html[data-glass] body[data-ds-dark-theme] [data-phase] header{
      background:var(--glass-card-dark)!important;
      border-color:rgba(148,180,220,.28)!important;
      border-bottom:none!important;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        -10px 4px 28px -12px rgba(2,6,14,.28),
        10px 4px 28px -12px rgba(2,6,14,.28)!important;
    }
    html[data-glass] [data-phase='active'] header,
    html[data-glass] [data-phase=active] header{position:relative!important;z-index:8!important}
    /* 侧栏收起时顶栏右移，避免压到浮动轨 */
    html[data-glass] [data-dsh-frame][data-sidebar-collapsed] [data-phase] header{margin-left:28px!important}
    /* 把整列正文（body）上滑到顶栏后面；padding 落在 scroll 上，内容从卡下露出来 */
    html[data-glass] [data-phase='active'] [data-conversation-content],
    html[data-glass] [data-phase=active] [data-conversation-content]{
      margin-top:-95px!important;
      position:relative;
      z-index:1;
      overflow:visible!important;
    }
    html[data-glass] [data-phase='active'] [data-conversation-scroll],
    html[data-glass] [data-phase=active] [data-conversation-scroll]{
      margin-top:0!important;
      padding-top:107px!important;
      position:relative;
      z-index:1;
    }
    /* 浮动顶栏会拆掉代码块 banner 的 sticky 锚点，改为随正文滚 */
    html[data-glass] [data-phase] [class*=banner]{position:static!important}
    /* 右上角工具组：容器与按钮都去描边/实底，只留悬停淡染 */
    html[data-glass] [data-phase] header [class*=headerActions],
    html[data-glass] [data-phase] header [class*=headerUtilities],
    html[data-glass] [data-phase] header [class*=headerCorner],
    html[data-glass] [class*=headerActions],
    html[data-glass] [class*=headerUtilities]{
      border:none!important;
      outline:none!important;
      box-shadow:none!important;
      background:transparent!important;
    }
    html[data-glass] [data-phase] header [class*=headerActions] button,
    html[data-glass] [data-phase] header [class*=headerUtilities] button,
    html[data-glass] [data-phase] header [class*=headerCorner] button,
    html[data-glass] [data-phase] header [class*=iconButton],
    html[data-glass] [class*=headerActions] button,
    html[data-glass] [class*=headerUtilities] button{
      border:none!important;
      outline:none!important;
      box-shadow:none!important;
      background:transparent!important;
    }
    html[data-glass] [data-phase] header [class*=headerActions] button:hover,
    html[data-glass] [data-phase] header [class*=headerUtilities] button:hover,
    html[data-glass] [data-phase] header [class*=headerCorner] button:hover,
    html[data-glass] [data-phase] header [class*=iconButton]:hover,
    html[data-glass] [class*=headerActions] button:hover,
    html[data-glass] [class*=headerUtilities] button:hover{
      background:color-mix(in srgb,var(--glass-accent) 10%,transparent)!important;
      box-shadow:none!important;
    }
    /* 主列本身不另套描边卡，避免与顶栏浮动卡叠成双框 */
    html[data-glass] [data-phase],
    html[data-glass] [class*=centerCol]{
      background:transparent!important;
      border:none!important;
      box-shadow:none!important;
      outline:none!important;
    }
    html[data-glass] body[data-windows-titlebar] [class*=centerCol],
    html[data-glass] body[data-windows-titlebar] [class*=rightbarCol]{border-radius:0!important}
    /* 侧栏玻璃卡：磨砂放在显式子节点 [data-glass-sidebar-fill]（seams 插入）。
       Electron 上伪元素 backdrop-filter 经常不糊；侧栏自身仍不挂 backdrop，
       避免把 Windows 标题栏里 position:fixed 的收起按钮困进包含块。 */
    html[data-glass] [class*=sidebarCol]{
      background:transparent;
      backdrop-filter:none;
      -webkit-backdrop-filter:none;
      border:1px solid #132d5312;
      border-radius:var(--glass-radius);
      box-shadow:var(--glass-shadow);
      margin:12px;padding:10px 12px 14px;
      z-index:9;position:relative;overflow:hidden;
      isolation:isolate; /* 困住 fill 的 z-index:-1，不漏到壁纸后面 */
    }
    html[data-glass] [class*=sidebarCol] > [data-glass-sidebar-fill]{
      position:absolute;
      inset:0;
      z-index:-1!important;
      border-radius:inherit;
      pointer-events:none;
      background:var(--glass-card-light);
      backdrop-filter:blur(var(--glass-blur));
      -webkit-backdrop-filter:blur(var(--glass-blur));
    }
    /* 排除 fill：内容压在磨砂层之上，字/图标可读 */
    html[data-glass] [class*=sidebarCol] > *:not([data-glass-sidebar-fill]){
      position:relative;
      z-index:1;
    }
    html[data-glass] body[data-ds-dark-theme] [class*=sidebarCol]{
      border-color:#94b4dc28;
      box-shadow:var(--glass-shadow-dark);
    }
    html[data-glass] body[data-ds-dark-theme] [class*=sidebarCol] > [data-glass-sidebar-fill]{
      background:var(--glass-card-dark);
    }
    /* Windows：收起侧栏钉在系统标题栏左上（对照宿主 [data-windows-titlebar] .toggle）
       只打侧栏里的 iconButton.toggle，避免误伤设置页等其它 toggle。 */
    html[data-glass] body[data-windows-titlebar] [class*=sidebarCol] [class*=toggle][class*=iconButton],
    html[data-glass] body[data-windows-titlebar] [data-dsh-sidebar-root] [class*=toggle][class*=iconButton]{
      position:fixed!important;
      left:12px!important;
      top:calc((var(--dsh-windows-titlebar-height,40px) - 28px) / 2)!important;
      z-index:40!important;
      width:28px!important;
      height:28px!important;
      margin:0!important;
      -webkit-app-region:no-drag!important;
      pointer-events:auto!important;
      visibility:visible!important;
      opacity:1!important;
    }
    /* 设置对话框打开时关掉侧栏 blur（保留 frost 底），避免 fixed 浮层再被困 */
    html[data-glass] [class*=sidebarCol]:has([role=dialog]),
    html[data-glass] [class*=sidebarCol]:has([role=dialog]) > [data-glass-sidebar-fill]{
      backdrop-filter:none!important;
      -webkit-backdrop-filter:none!important;
    }
    html[data-glass] [data-dsh-frame]:not([data-sidebar-collapsed]) [data-dsh-sidebar-root]{width:100%!important}
    html[data-glass] [data-composer-card]{
      background:var(--glass-card-light);
      backdrop-filter:blur(var(--glass-blur));
      border:1px solid #132d5312;
      border-radius:24px;
      box-shadow:0 6px 22px #132d530e;
      z-index:8;position:relative;
    }
    html[data-glass] body[data-ds-dark-theme] [data-composer-card]{
      background:var(--glass-card-dark);
      border-color:#94b4dc28;
      box-shadow:0 8px 28px #02060e40;
    }
    html[data-glass] [data-dsh-stats]{
      background:var(--glass-card-light);
      backdrop-filter:blur(var(--glass-blur));
      border:1px solid #132d5312;border-top-color:#132d5312;
      border-radius:0 0 24px 24px;
      box-shadow:0 6px 22px #132d530e;
      color:#262e3ee6;
      z-index:8;position:relative;
    }
    html[data-glass] body[data-ds-dark-theme] [data-dsh-stats]{
      background:var(--glass-card-dark);
      border-color:#94b4dc3d #94b4dc52 #94b4dc52;
      color:#e4ecf8eb;
      box-shadow:0 8px 28px #02060e40;
    }
    html[data-glass] [class*=quietBars]{width:100%!important}
    html[data-glass] [data-dsh-inputbar]:not([class*=hero]){padding-bottom:12px}
    /* 输入框与统计行共用一块玻璃：外壳画玻璃，内部两层都透明 */
    html[data-glass] [data-dsh-inputbar]:has([data-dsh-stats]){
      width:calc(var(--dsh-chat-content-width) + 32px);max-width:none;margin:0 auto 12px;padding:0;
      background:var(--glass-card-light);
      backdrop-filter:blur(var(--glass-blur));
      border:1px solid #132d5312;border-radius:24px;
      box-shadow:0 6px 22px #132d530e;
    }
    html[data-glass] body[data-ds-dark-theme] [data-dsh-inputbar]:has([data-dsh-stats]){
      background:var(--glass-card-dark);
      border-color:#94b4dc28;
      box-shadow:0 8px 28px #02060e40;
    }
    html[data-glass] [data-dsh-inputbar]:has([data-dsh-stats]) [data-composer-card]{
      box-shadow:none;backdrop-filter:none;background:transparent;border:none;border-radius:0;
    }
    html[data-glass] [data-dsh-inputbar]:has([data-dsh-stats]) [data-composer-card]::after{display:none}
    html[data-glass] [data-dsh-inputbar]:has([data-dsh-stats]) [data-dsh-stats]{
      box-sizing:border-box;width:100%;max-width:none;min-height:24px;
      box-shadow:none;backdrop-filter:none;background:transparent;
      border:none;border-top:1px solid #132d531f;border-radius:0;
      margin:auto 0 0;padding:2px 16px;display:block;
    }
    html[data-glass] body[data-ds-dark-theme] [data-dsh-inputbar]:has([data-dsh-stats]) [data-dsh-stats]{
      border-top-color:#94b4dc3d;
    }
    html[data-glass] [data-dsh-trajectory]{
      background:var(--glass-card-light);
      backdrop-filter:blur(var(--glass-blur));
      border:1px solid #132d5312;border-radius:var(--glass-radius);
      box-shadow:inset 0 1px var(--glass-hi),var(--glass-shadow);
      width:calc(100% - 32px);height:calc(100% - 20px);
      margin:8px 16px 12px;overflow:hidden;
    }
    html[data-glass] body[data-ds-dark-theme] [data-dsh-trajectory]{
      background:var(--glass-card-dark);
      border-color:#94b4dc28;
      box-shadow:inset 0 1px var(--glass-hi-dark),var(--glass-shadow-dark);
    }
    html[data-glass] [data-dsh-trajectory] [role=toolbar],
    html[data-glass] [data-dsh-trajectory] section[aria-label="Trajectory timeline"]{background:transparent}
    /* B4：新会话 / 底部账号行 — 只打在 button 上（勿用 [class*=newSession]，会误伤 Label/Content 造成双层药丸；账号行用 data-dsh-account，不进 collapsed fixed） */
    html[data-glass] button[data-dsh-surface],
    html[data-glass] button[class*=newSession],
    html[data-glass] button[data-dsh-account]{
      background:color-mix(in srgb,#fff calc(62% * var(--glass-surface-frost)),transparent)!important;
      border:none!important;
      outline:none!important;
      box-shadow:none!important;
      backdrop-filter:blur(var(--glass-blur))!important;
      -webkit-backdrop-filter:blur(var(--glass-blur))!important;
      border-radius:14px!important;
      overflow:hidden;
    }
    html[data-glass] button[data-dsh-surface]:hover:not(:disabled),
    html[data-glass] button[class*=newSession]:hover:not(:disabled),
    html[data-glass] button[data-dsh-account]:hover:not(:disabled){
      background:color-mix(in srgb,#fff calc(74% * var(--glass-surface-frost)),transparent)!important;
    }
    html[data-glass] body[data-ds-dark-theme] button[data-dsh-surface],
    html[data-glass] body[data-ds-dark-theme] button[class*=newSession],
    html[data-glass] body[data-ds-dark-theme] button[data-dsh-account]{
      background:color-mix(in srgb,#2a2e38 calc(62% * var(--glass-surface-frost)),transparent)!important;
      border:none!important;
      box-shadow:none!important;
    }
    html[data-glass] body[data-ds-dark-theme] button[data-dsh-surface]:hover:not(:disabled),
    html[data-glass] body[data-ds-dark-theme] button[class*=newSession]:hover:not(:disabled),
    html[data-glass] body[data-ds-dark-theme] button[data-dsh-account]:hover:not(:disabled){
      background:color-mix(in srgb,#363a46 calc(70% * var(--glass-surface-frost)),transparent)!important;
    }
    /* 内层 Label/Content/Mask：强制透明，取消任何被误加的底/圆角/阴影 */
    html[data-glass] button[class*=newSession] [class*=newSessionLabel],
    html[data-glass] button[class*=newSession] [class*=newSessionContent],
    html[data-glass] button[class*=newSession] [class*=newSessionLabelMask],
    html[data-glass] button[data-dsh-surface] > *,
    html[data-glass] button[data-dsh-account] > *{
      background:transparent!important;
      background-color:transparent!important;
      border:none!important;
      outline:none!important;
      box-shadow:none!important;
      backdrop-filter:none!important;
      -webkit-backdrop-filter:none!important;
      border-radius:0!important;
    }
    /* 宿主悬停显示 Ctrl+N：隐藏 shortcut 节点，不影响点击 */
    html[data-glass] [class*=newSessionShortcut]{
      display:none!important;
      opacity:0!important;
      visibility:hidden!important;
      width:0!important;
      max-width:0!important;
      overflow:hidden!important;
      pointer-events:none!important;
      margin:0!important;
      padding:0!important;
    }
    /* T2：Composer「+」圆珠 — frost 磨砂 */
    html[data-glass] [data-dsh-add]{
      background:color-mix(in srgb,#fff calc(40% * var(--glass-frost)),transparent)!important;
      border:1px solid #132d531f!important;
      box-shadow:inset 0 1px var(--glass-hi)!important;
      backdrop-filter:blur(var(--glass-blur))!important;
    }
    html[data-glass] [data-dsh-add]:hover:not(:disabled){
      background:color-mix(in srgb,#fff calc(58% * var(--glass-frost)),transparent)!important;
    }
    html[data-glass] body[data-ds-dark-theme] [data-dsh-add]{
      background:color-mix(in srgb,#2a2e38 calc(40% * var(--glass-frost)),transparent)!important;
      border-color:#94b4dc40!important;
      box-shadow:inset 0 1px var(--glass-hi-dark)!important;
    }
    html[data-glass] body[data-ds-dark-theme] [data-dsh-add]:hover:not(:disabled){
      background:color-mix(in srgb,#363a46 calc(52% * var(--glass-frost)),transparent)!important;
    }
    /* 侧边栏收起：窄栏只当图标条；清掉 ::before 磨砂，让 fixed toggle/newSession 回到视口标题栏 */
    html[data-glass] [data-sidebar-collapsed] [class*=sidebarCol]{
      min-width:64px!important;margin:0!important;padding:0!important;
      border-radius:0!important;background:transparent!important;
      backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
      border:0!important;box-shadow:none!important;z-index:60!important;
      overflow:visible!important;
    }
    html[data-glass] [data-sidebar-collapsed] [class*=sidebarCol] > [data-glass-sidebar-fill]{display:none!important}
    html[data-glass] [data-sidebar-collapsed] [class*=toggle],
    html[data-glass] [data-sidebar-collapsed] [class*=railIn] [class*=iconButton]{
      z-index:40!important;pointer-events:auto!important;visibility:visible!important;opacity:1!important;
    }
    html[data-glass] body[data-windows-titlebar] [data-sidebar-collapsed] [class*=sidebarCol] [class*=newSession],
    html[data-glass] body[data-windows-titlebar] [data-sidebar-collapsed] [data-dsh-sidebar-root] [class*=newSession]{
      position:fixed!important;
      left:48px!important;
      top:calc((var(--dsh-windows-titlebar-height,40px) - 28px) / 2)!important;
      z-index:40!important;
      -webkit-app-region:no-drag!important;
    }

    /* Composer primary-action tooltips stay local to their trigger row.
     * The host emits non-portal fixed bubbles with viewport left/top. Glass blur
     * and hover transforms establish a different fixed containing block, so those
     * coordinates otherwise push the bubble outside the scroll body.
     * Keep React's tooltip node, timing and visibility; override only its geometry.
     */
    html[data-glass] [data-composer-card] .GRgSLq_trailing{position:relative}
    html[data-glass] [data-composer-card] .GRgSLq_trailing > .GRgSLq_primary + [role=tooltip]:not([data-portal]){
      position:absolute!important;
      inset:auto 0 calc(100% + 10px) auto!important;
      transform:none!important;
    }
    /* Stop and send can coexist: the earlier primary action is one 34px button
     * plus the host's 12px trailing gap away from the rightmost action. */
    html[data-glass] [data-composer-card] .GRgSLq_trailing > .GRgSLq_primary:has(~ .GRgSLq_primary) + [role=tooltip]:not([data-portal]){
      right:46px!important;
    }

    /* ---------- 6. 浮层 ---------- */
    html[data-glass] body [role=dialog]{
      backdrop-filter:blur(50px);
      background:#ffffff73;
      border-radius:14px;
    }
    html[data-glass] body[data-ds-dark-theme] [role=dialog]{background:#111a278c}

    /* 设置顶栏「打开配置文件」：宿主 SettingsDocumentAction（settings.action 槽），对齐 .gx-btn 浅实心胶囊 */
    html[data-glass] body [role=dialog] [class*=AnXs9G_actions] button,
    html[data-glass] body [role=dialog] [class*=yHUiNq_action] > button{
      height:32px!important;
      padding:0 12px!important;
      border:0!important;
      border-radius:8px!important;
      cursor:pointer;
      white-space:nowrap;
      background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent)!important;
      box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent),0 1px 2px rgba(19,45,83,.06)!important;
      font:inherit;
      font-size:13px!important;
      color:var(--dsw-alias-label-primary)!important;
    }
    html[data-glass] body [role=dialog] [class*=AnXs9G_actions] button:hover,
    html[data-glass] body [role=dialog] [class*=yHUiNq_action] > button:hover{
      background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 96%,transparent)!important;
    }
    html[data-glass] body [role=dialog] [class*=AnXs9G_actions] button:disabled,
    html[data-glass] body [role=dialog] [class*=yHUiNq_action] > button:disabled{
      opacity:.5;
      cursor:default;
    }


    /* 其他插件的浮层（.dsh-reasoning-model__popover）也用 role=dialog，会被上面 dialog 磨砂误伤。
       对齐 / 面板与模型菜单实底（T4），去掉透明底与 blur。 */
    html[data-glass] body .dsh-reasoning-model__popover[role=dialog],
    html[data-glass] body .dsh-reasoning-model__popover{
      background:#FCFDFF!important;
      backdrop-filter:none!important;
      -webkit-backdrop-filter:none!important;
    }
    html[data-glass] body[data-ds-dark-theme] .dsh-reasoning-model__popover[role=dialog],
    html[data-glass] body[data-ds-dark-theme] .dsh-reasoning-model__popover{
      background:#141A24!important;
    }
    html[data-glass] [role=menu]{
      background:color-mix(in srgb,#fff calc(62% * var(--glass-frost)),transparent);
      backdrop-filter:blur(var(--glass-blur));
      border-radius:14px;
    }
    html[data-glass] body[data-ds-dark-theme] [role=menu]{
      background:color-mix(in srgb,#1c202a calc(68% * var(--glass-frost)),transparent);
    }
    html[data-glass] body{--dsw-menu-surface-fill:rgba(252,253,255,.94)!important}
    html[data-glass] body[data-ds-dark-theme]{--dsw-menu-surface-fill:rgba(20,26,36,.94)!important}
    html[data-glass] [role=menu],html[data-glass] [role=tooltip],html[data-glass] [role=alert]{border-radius:14px}
    html[data-glass] [role=menuitem],html[data-glass] [role=tooltip],html[data-glass] [class*=pill]{border-radius:8px}
    /* 问题选项「推荐」标（QuestionComposer .badge）：宿主用 accent 底 + button-info-fill 字，
       我们把 info-fill 也映成 accent 后变成粉字/粉底看不清。只打 optionLine 内小标，勿动 data-glass-badge 铭牌 / 主按钮。 */
    html[data-glass] [class*=optionLine] [class*=badge]{
      background:color-mix(in srgb,var(--glass-accent) 22%,#fff)!important;
      color:#152C45!important;
    }
    html[data-glass] body[data-ds-dark-theme] [class*=optionLine] [class*=badge]{
      background:color-mix(in srgb,var(--glass-accent) 28%,#0C121B)!important;
      color:#DCE7F5!important;
    }
    /* 选中行：粉字 + 淡粉底（结构上兜住所有菜单） */
    html[data-glass] body:not([data-ds-dark-theme]) [role=menu] button[role=menuitem][class*=selected],
    html[data-glass] body:not([data-ds-dark-theme]) [role=menu] button[role=menuitem][aria-checked=true],
    html[data-glass] body:not([data-ds-dark-theme]) [role=menu] button[role=menuitem][aria-selected=true]{
      color:var(--glass-accent)!important;
      background:color-mix(in srgb,var(--glass-accent) 14%,transparent)!important;
      border-radius:8px;
    }
    html[data-glass] body[data-ds-dark-theme] [role=menu] button[role=menuitem][class*=selected],
    html[data-glass] body[data-ds-dark-theme] [role=menu] button[role=menuitem][aria-checked=true],
    html[data-glass] body[data-ds-dark-theme] [role=menu] button[role=menuitem][aria-selected=true]{
      color:var(--glass-accent)!important;
      background:color-mix(in srgb,var(--glass-accent) 18%,transparent)!important;
      border-radius:8px;
    }
    html[data-glass] [role=menu] button[role=menuitem] > [class*=check]{display:none!important}
    html[data-glass] [data-trigger-menu] kbd{
      background:#132d5318!important;border:1px solid #132d5320;border-radius:6px;
      color:var(--dsw-alias-label-secondary)!important;
    }
    html[data-glass] body[data-ds-dark-theme] [data-trigger-menu] kbd{
      background:#94b4dc2e!important;border-color:#94b4dc42;
    }
    /* 模型菜单：实底，去掉滚动列表上的 blur */
    html[data-glass] [role=menu]:has(.wq12jW_option),
    html[data-glass] *:has(> .wq12jW_groups),
    html[data-glass] [data-menu-material]:has(.wq12jW_groups){
      background:#FCFDFF!important;backdrop-filter:none!important;
    }
    html[data-glass] body[data-ds-dark-theme] [role=menu]:has(.wq12jW_option),
    html[data-glass] body[data-ds-dark-theme] *:has(> .wq12jW_groups),
    html[data-glass] body[data-ds-dark-theme] [data-menu-material]:has(.wq12jW_groups){
      background:#141A24!important;backdrop-filter:none!important;
    }

    /* ---------- 7. 消息内容（可读性修复） ---------- */
    html[data-glass] [class*=bubble]{
      background:color-mix(in srgb,#fff calc(42% * var(--glass-frost)),transparent);
      backdrop-filter:blur(var(--glass-blur));
      border:1px solid rgba(19,45,83,.06);
      border-radius:14px;
      box-shadow:none;
    }
    html[data-glass] body[data-ds-dark-theme] [class*=bubble]{
      background:color-mix(in srgb,#000 calc(28% + 28% * var(--glass-frost)),transparent);
      border-color:rgba(148,180,220,.14);
    }
    html[data-glass][data-glass-media=video] [class*=bubble]{background:color-mix(in srgb,#fff calc(55% + 25% * var(--glass-frost)),transparent);border-color:#132d5320}
    html[data-glass][data-glass-media=video] body[data-ds-dark-theme] [class*=bubble]{background:color-mix(in srgb,#000 calc(40% + 30% * var(--glass-frost)),transparent);border-color:#94b4dc38}
    /* 正文卡：只给 assistant 的 response 段一块玻璃 */
    html[data-glass] [data-conversation-scroll] :is([data-chat-flow]:not([data-step-process-content]),[data-slot='conversation.chat.flow'])
      > [data-chat-flow-kind=assistant-step][data-chat-group-part=response]:not([hidden]):not(:empty):not(:has(> [data-slot='conversation.chat.node']:empty)){
      box-sizing:border-box;padding:10px 16px;
      line-height:calc(22px + var(--dsh-content-font-delta,0px));
      border:1px solid #132d5318;border-radius:14px;
      background:var(--glass-card-light);
      backdrop-filter:blur(var(--glass-blur));
    }
    html[data-glass] body[data-ds-dark-theme] [data-conversation-scroll] :is([data-chat-flow]:not([data-step-process-content]),[data-slot='conversation.chat.flow'])
      > [data-chat-flow-kind=assistant-step][data-chat-group-part=response]:not([hidden]):not(:empty):not(:has(> [data-slot='conversation.chat.node']:empty)){
      border-color:#94b4dc24;
      background:color-mix(in srgb,#000 calc(40% * var(--glass-frost)),transparent);
    }
    /* 正文卡内交付物/附件小卡：加厚磨砂底 + 实色字，避免透壁纸发虚 */
    html[data-glass] [data-conversation-scroll] [data-chat-flow-kind=assistant-step][data-chat-group-part=response] [class*=card]{
      background:color-mix(in srgb,#fff calc(50% + 32% * var(--glass-frost)),transparent)!important;
      backdrop-filter:blur(calc(var(--glass-blur) + 6px))!important;
      border:1px solid rgba(19,45,83,.10)!important;
      box-shadow:none!important;
    }
    html[data-glass] body[data-ds-dark-theme] [data-conversation-scroll] [data-chat-flow-kind=assistant-step][data-chat-group-part=response] [class*=card]{
      background:color-mix(in srgb,#1a2230 calc(45% + 33% * var(--glass-frost)),transparent)!important;
      border-color:rgba(148,180,220,.16)!important;
    }
    html[data-glass] [data-conversation-scroll] [data-chat-flow-kind=assistant-step][data-chat-group-part=response] [class*=card] :is([class*=title],[class*=name],[class*=label]){
      color:#13243E!important;
      opacity:1!important;
      text-shadow:none!important;
      -webkit-font-smoothing:antialiased;
    }
    html[data-glass] [data-conversation-scroll] [data-chat-flow-kind=assistant-step][data-chat-group-part=response] [class*=card] :is([class*=desc],[class*=description],[class*=subtitle],[class*=caption],[class*=meta],p,span){
      color:#1F3A57!important;
      opacity:1!important;
      text-shadow:none!important;
    }
    html[data-glass] body[data-ds-dark-theme] [data-conversation-scroll] [data-chat-flow-kind=assistant-step][data-chat-group-part=response] [class*=card] :is([class*=title],[class*=name],[class*=label]){
      color:#E8EEF7!important;
    }
    html[data-glass] body[data-ds-dark-theme] [data-conversation-scroll] [data-chat-flow-kind=assistant-step][data-chat-group-part=response] [class*=card] :is([class*=desc],[class*=description],[class*=subtitle],[class*=caption],[class*=meta],p,span){
      color:#C2D2E6!important;
    }
    /* 正文卡本身再抬一点对比（配合更高默认模糊） */
    html[data-glass] [data-conversation-scroll] :is([data-chat-flow]:not([data-step-process-content]),[data-slot='conversation.chat.flow'])
      > [data-chat-flow-kind=assistant-step][data-chat-group-part=response]:not([hidden]):not(:empty):not(:has(> [data-slot='conversation.chat.node']:empty)){
      border:1px solid rgba(19,45,83,.10);
    }
    html[data-glass] [data-conversation-scroll] .md-table-wide{
      width:100%!important;max-width:100%!important;margin-left:0!important;padding-left:0!important;overflow-x:auto!important;
    }
    html[data-glass] [data-conversation-scroll] [data-chat-flow-kind=turn-tail]{backdrop-filter:none!important}
    html[data-glass] [data-conversation-scroll]{text-shadow:none!important}
    html[data-glass] [data-conversation-scroll] [data-chat-flow-kind=assistant-step][data-chat-group-part=response] [class*=IAXa_root],
    html[data-glass] [data-conversation-scroll] [data-chat-flow-kind=assistant-step][data-chat-group-part=response] [class*=IAXa_root] :is(p,li,ul,ol,blockquote,td,th,dd,dt){
      line-height:calc(22px + var(--dsh-content-font-delta,0px));
    }
    /* 工具提示：实底，别被气泡规则误伤 */
    html[data-glass] [role=tooltip],html[data-glass] [role=tooltip][class*=bubble]{
      background:var(--dsw-alias-tooltip-bg);backdrop-filter:none;
    }
    /* 代码块 / 行内代码 */
    html[data-glass] body{
      --dsw-alias-markdown-code-block:color-mix(in srgb,#fff calc(42% * var(--glass-frost)),transparent)!important;
      --dsw-alias-markdown-code-block-banner:color-mix(in srgb,#fff calc(46% * var(--glass-frost)),transparent)!important;
      --dsw-alias-markdown-inline-code:color-mix(in srgb,#fff calc(36% * var(--glass-frost)),transparent)!important;
    }
    html[data-glass] body[data-ds-dark-theme]{
      --dsw-alias-markdown-code-block:color-mix(in srgb,#22262f calc(50% * var(--glass-frost)),transparent)!important;
      --dsw-alias-markdown-code-block-banner:color-mix(in srgb,#22262f calc(54% * var(--glass-frost)),transparent)!important;
      --dsw-alias-markdown-inline-code:color-mix(in srgb,#22262f calc(44% * var(--glass-frost)),transparent)!important;
    }
    html[data-glass] [class*=block]{
      --dsl-code-block-border-radius:14px;--dsl-diff-radius:14px;--dsl-read-radius:14px;
      --dsl-terminal-radius:14px;--dsl-web-radius:14px;--dsl-search-radius:14px;border-radius:14px;
    }
    html[data-glass] [class*=card]{border-radius:14px}

    /* ---------- 8. 插件页 / 侧栏列表 ---------- */
    html[data-glass] [data-plugin-panel] [data-plugin-group] ul{gap:8px}
    html[data-glass] [data-plugin-rows] ul{gap:6px}
    html[data-glass] [data-plugin-item],
    html[data-glass] [data-plugin-package],
    html[data-glass] [data-plugin-row],
    html[data-glass] [data-cordis-panel] [data-cordis-row],
    html[data-glass] [data-cordis-row][data-cordis-plugin-id],
    html[data-glass] .mct-card,
    html[data-glass] .dst-card,
    html[data-glass] .plp-card{
      box-sizing:border-box;
      border:1px solid #132d5318;border-radius:14px;
      background:var(--glass-card-light);
      backdrop-filter:blur(var(--glass-blur));
      box-shadow:inset 0 1px var(--glass-hi);
    }
    html[data-glass] [data-plugin-row],
    html[data-glass] [data-cordis-panel] [data-cordis-row],
    html[data-glass] [data-cordis-row][data-cordis-plugin-id]{padding:10px 12px}
    html[data-glass] body[data-ds-dark-theme] [data-plugin-item],
    html[data-glass] body[data-ds-dark-theme] [data-plugin-package],
    html[data-glass] body[data-ds-dark-theme] [data-plugin-row],
    html[data-glass] body[data-ds-dark-theme] [data-cordis-panel] [data-cordis-row],
    html[data-glass] body[data-ds-dark-theme] [data-cordis-row][data-cordis-plugin-id],
    html[data-glass] body[data-ds-dark-theme] .mct-card,
    html[data-glass] body[data-ds-dark-theme] .dst-card,
    html[data-glass] body[data-ds-dark-theme] .plp-card{
      border-color:#94b4dc24;
      background:color-mix(in srgb,#000 calc(40% * var(--glass-frost)),transparent);
      box-shadow:inset 0 1px var(--glass-hi-dark);
    }
    html[data-glass] :is([data-plugin-item],[data-plugin-package],.mct-card,.dst-card,.plp-card):hover{
      background:color-mix(in srgb,#fff calc(56% * var(--glass-frost)),transparent)!important;
    }
    html[data-glass] body[data-ds-dark-theme] :is([data-plugin-item],[data-plugin-package],.mct-card,.dst-card,.plp-card):hover{
      background:color-mix(in srgb,#2a2e38 calc(64% * var(--glass-frost)),transparent)!important;
    }
    html[data-glass] .mct-cards,html[data-glass] .dst-cards,html[data-glass] .plp-cards{gap:8px}
    html[data-glass] .fO69Vq_card:has(.fO69Vq_skeletonFill){
      background:none;border:none;box-shadow:none;backdrop-filter:none;
    }
    /* 右侧工具栏面板：与消息卡同配方 */
    html[data-glass] [data-sidebar-right-panel] [data-dockkit-pane]{
      background:var(--glass-card-light)!important;
      border:1px solid #132d5318!important;
      backdrop-filter:blur(var(--glass-blur));
    }
    html[data-glass] body[data-ds-dark-theme] [data-sidebar-right-panel] [data-dockkit-pane]{
      background:color-mix(in srgb,#000 calc(40% * var(--glass-frost)),transparent)!important;
      border-color:#94b4dc24!important;
    }

    /* ---------- 9. 小控件 ---------- */
    html[data-glass] [data-slot='conversation.input.permission'] button:not(:disabled),
    html[data-glass] [data-slot='conversation.input.model'] button[aria-haspopup=menu]:not(:disabled){
      box-sizing:border-box;border-radius:8px;
      background:color-mix(in srgb,#fff calc(40% * var(--glass-frost)),transparent);
      box-shadow:inset 0 0 0 1px #132d531f,inset 0 1px #ffffff80;
      color:#16304C!important;
    }
    html[data-glass] [data-slot='conversation.input.permission'] button:hover:not(:disabled),
    html[data-glass] [data-slot='conversation.input.model'] button[aria-haspopup=menu]:is(:hover,[aria-expanded=true]):not(:disabled){
      background:color-mix(in srgb,#fff calc(58% * var(--glass-frost)),transparent);
    }
    html[data-glass] body[data-ds-dark-theme] [data-slot='conversation.input.permission'] button:not(:disabled),
    html[data-glass] body[data-ds-dark-theme] [data-slot='conversation.input.model'] button[aria-haspopup=menu]:not(:disabled){
      background:color-mix(in srgb,#2a2e38 calc(40% * var(--glass-frost)),transparent);
      box-shadow:inset 0 0 0 1px #94b4dc40,inset 0 1px #ffffff14;
      color:#E4EDF8!important;
    }
    html[data-glass] body[data-ds-dark-theme] [data-slot='conversation.input.permission'] button:hover:not(:disabled),
    html[data-glass] body[data-ds-dark-theme] [data-slot='conversation.input.model'] button[aria-haspopup=menu]:is(:hover,[aria-expanded=true]):not(:disabled){
      background:color-mix(in srgb,#363a46 calc(52% * var(--glass-frost)),transparent);
    }
    html[data-glass] [data-composer-card] textarea::placeholder,
    html[data-glass] [data-composer-card] [data-composer-placeholder]{
      color:#1B3550!important;opacity:.38!important;
    }
    html[data-glass] body[data-ds-dark-theme] [data-composer-card] textarea::placeholder,
    html[data-glass] body[data-ds-dark-theme] [data-composer-card] [data-composer-placeholder]{
      color:#D6E2F1!important;opacity:.38!important;
    }
    html[data-glass] [data-dsh-stats]{color:#18334E!important}
    html[data-glass] [data-dsh-stats] button:not(:disabled){color:#18334E!important}
    html[data-glass] body[data-ds-dark-theme] [data-dsh-stats]{color:#D8E3F2!important}
    html[data-glass] body[data-ds-dark-theme] [data-dsh-stats] button:not(:disabled){color:#D8E3F2!important}
    html[data-glass] [class*=runningContent],
    html[data-glass] [class*=runningText],
    html[data-glass] [class*=runningIcon],
    html[data-glass] [class*=runningWhaleStill],
    html[data-glass] [class*=runningWhaleAnimated]{color:var(--glass-accent)!important}
    html[data-glass] [data-trigger-menu] button[role=option]:hover,
    html[data-glass] [data-trigger-menu] button[role=option][aria-selected=true]{
      color:var(--glass-accent)!important;
      background:color-mix(in srgb,var(--glass-accent) 14%,transparent)!important;
      border-radius:8px;
    }
    html[data-glass] body[data-ds-dark-theme] [data-trigger-menu] button[role=option]:hover,
    html[data-glass] body[data-ds-dark-theme] [data-trigger-menu] button[role=option][aria-selected=true]{
      background:color-mix(in srgb,var(--glass-accent) 18%,transparent)!important;
    }
    html[data-glass] :focus-visible{outline:2px solid color-mix(in srgb,var(--glass-accent) 80%,transparent);outline-offset:1px}
    /* 输入框：去掉内层方角 outline，保留宿主 ._wrap_*:focus-within 的外层圆弧边 */
    html[data-glass] input:focus-visible,
    html[data-glass] textarea:focus-visible,
    html[data-glass] [class*=page] input:focus-visible,
    html[data-glass] [class*=page] textarea:focus-visible{
      outline:none!important;
      outline-offset:0!important;
    }
    html[data-glass] ::selection{background:color-mix(in srgb,var(--glass-accent) 35%,transparent)}

    /* ---------- 10. 边缘渐变、辉光、悬停 ---------- */
    html[data-glass] [data-glass-fade]{
      position:fixed;left:0;right:0;height:13px;z-index:7;pointer-events:none;
      backdrop-filter:blur(max(2px, calc(var(--glass-blur) * .35)));
      -webkit-backdrop-filter:blur(max(2px, calc(var(--glass-blur) * .35)));
      background:color-mix(in srgb,#fff calc(12% * var(--glass-frost)),transparent);
    }
    html[data-glass] body[data-ds-dark-theme] [data-glass-fade]{
      background:color-mix(in srgb,#000 calc(18% * var(--glass-frost)),transparent);
    }
    html[data-glass] [data-glass-fade=top]{top:0;-webkit-mask-image:linear-gradient(#000,#0000);mask-image:linear-gradient(#000,#0000)}
    html[data-glass] [data-glass-fade=bottom]{bottom:0;-webkit-mask-image:linear-gradient(#0000,#000);mask-image:linear-gradient(#0000,#000)}
    html[data-glass] [data-glass-spot]{position:relative;isolation:isolate}
    html[data-glass][data-glass-spotlight] [data-glass-spot]::before{
      content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;
      background:radial-gradient(var(--gx-glow-radius,180px) at var(--gx-mx,50%) var(--gx-my,50%),
        var(--glass-spot-color),transparent 70%);
      opacity:0;transition:opacity .3s;
    }
    html[data-glass][data-glass-spotlight] [data-glass-spot][data-spot-on]::before{opacity:1}
    /* 侧栏辉光：fill=-1，::before=0，内容=1；pointer-events 已在通用 ::before 上 none */
    html[data-glass][data-glass-spotlight] [class*=sidebarCol][data-glass-spot]::before{
      z-index:0;
    }
    html[data-glass][data-glass-press] [data-glass-spot]{transition:transform .12s ease-out,box-shadow .12s ease-out}
    /* B3/E3：侧栏禁用 transform（保 fill 磨砂，也不把 Windows fixed toggle 困进包含块）。
       其它玻璃卡仍用 translateY；整块侧栏改用 top 位移上浮。
       轨迹/composer-overlay 大板只辉光不上浮；输入只抬 composer-card（或带 stats 的 inputbar 外壳）。 */
    html[data-glass][data-glass-press] [data-glass-spot]:not([class*=sidebarCol]):not([data-dsh-trajectory]):hover{
      transform:translateY(-1px)!important;
      box-shadow:0 5px 14px #0c142026,inset 0 1px #ffffff5c!important;
    }
    html[data-glass][data-glass-press] [data-dsh-trajectory][data-glass-spot],
    html[data-glass][data-glass-press] [data-dsh-trajectory][data-glass-spot]:hover{
      transform:none!important;
    }
    html[data-glass][data-glass-press] [class*=sidebarCol],
    html[data-glass][data-glass-press] [class*=sidebarCol]:hover{transform:none!important}
    html[data-glass][data-glass-press] [class*=sidebarCol]:has([role=dialog]){backdrop-filter:none}
    /* 整块左侧栏玻璃板悬停上浮（仅带 fill 的外层列；收起/设置对话框打开时不抬） */
    html[data-glass][data-glass-press] [class*=sidebarCol]:has(> [data-glass-sidebar-fill]){
      transition:top .12s ease-out,box-shadow .12s ease-out;
      top:0;
    }
    html[data-glass][data-glass-press] [class*=sidebarCol]:has(> [data-glass-sidebar-fill]):not(:has([role=dialog])):hover{
      top:-1px;
      box-shadow:0 5px 14px #0c142026,inset 0 1px #ffffff5c!important;
    }
    html[data-glass][data-glass-press] body[data-ds-dark-theme] [class*=sidebarCol]:has(> [data-glass-sidebar-fill]):not(:has([role=dialog])):hover{
      box-shadow:0 5px 14px #02060e40,inset 0 1px #ffffff14!important;
    }
    html[data-glass][data-glass-press] [data-sidebar-collapsed] [class*=sidebarCol],
    html[data-glass][data-glass-press] [data-sidebar-collapsed] [class*=sidebarCol]:hover{
      top:0!important;
      transition:none;
    }
    @media (prefers-reduced-motion:reduce){
      html[data-glass][data-glass-press] [data-glass-spot]{transition:none}
      html[data-glass][data-glass-press] [data-glass-spot]:not([class*=sidebarCol]):not([data-dsh-trajectory]):hover{transform:none!important}
      html[data-glass][data-glass-press] [class*=sidebarCol]:has(> [data-glass-sidebar-fill]),
      html[data-glass][data-glass-press] [class*=sidebarCol]:has(> [data-glass-sidebar-fill]):hover{
        top:0!important;
        transition:none;
      }
      html[data-glass] [data-glass-glow]{transition:none}
    }
    html[data-glass] [data-glass-badge]{
      position:fixed;z-index:60;pointer-events:none;border-radius:5px;padding:1px;
      background:linear-gradient(135deg,rgba(255,255,255,.75) 0%,rgba(255,255,255,.08) 35%,rgba(255,255,255,.04) 65%,rgba(255,255,255,.5) 100%);
      box-shadow:0 0 12px rgba(120,170,255,.20);
    }
    html[data-glass] [data-glass-badge] span{
      display:flex;align-items:center;justify-content:center;width:100%;height:100%;
      border-radius:4px;background:rgba(0,0,0,.25);
      color:rgba(255,255,255,.95);font-family:ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace;
      font-weight:500;letter-spacing:.02em;line-height:1;white-space:nowrap;
    }
    /* 滚动条也跟着玻璃走（非设置页等仍用系统/标准条着色） */
    html[data-glass] *{scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 30%,transparent) transparent}

    /*
     * Overlay 滚动条：不占 layout 宽；原生条隐藏；自定义细条 z-index 盖过 dialog overlay(1000)。
     * 宿主：设置 dialog 的 options/navList；左侧会话 GAkraW_list（及 data-gx-sb-host）。
     * 宿主为原生条预留的 5px（--dsh-session-list-scrollbar-width）一并清零，避免仍被挤开。
     */
    /* Keep native horizontal bars; only registered hosts lose their vertical bar. */
    /* Standard scrollbar-color overrides WebKit geometry in Chromium.
     * Reset it on managed hosts and hide width on the base pseudo-element.
     * No height override: existing horizontal scrollbar sizing stays intact. */
    html[data-glass] [data-gx-sb-host]{scrollbar-color:auto!important;scrollbar-width:auto!important;scrollbar-gutter:auto!important}
    html[data-glass] [data-gx-sb-host]::-webkit-scrollbar{width:0!important}
    /* Chat keeps its pre-overlay text width to avoid virtual-message reflow. */
    html[data-glass] [data-gx-sb-host][data-conversation-scroll]{padding-inline-end:calc(var(--gx-chat-original-padding,0px) + var(--gx-chat-scroll-gutter,0px))!important}
    /* 取消会话列表为原生 5px 条预留的边距 */
    html[data-glass] [class*=GAkraW_root],
    html[data-glass] [data-dsh-sidebar-root]{
      --dsh-session-list-scrollbar-width:0px!important;
      --dsh-session-list-scrollbar-offset:0px!important;
    }
    /* 14px hit target, with the same 6px visible thumb as before. */
    html[data-glass] [data-gx-overlay-sb]{
      position:fixed;width:14px;border-radius:999px;pointer-events:none;
      opacity:0;transition:opacity .18s ease;z-index:1100;touch-action:none;
    }
    html[data-glass] [data-gx-overlay-sb]::before{
      content:"";position:absolute;inset:0 2px 0 6px;border-radius:999px;
      background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 40%,transparent);
      box-shadow:0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);
    }
    html[data-glass] [data-gx-overlay-sb][data-visible],
    html[data-glass] [data-gx-overlay-sb]:focus-visible{
      opacity:1;pointer-events:auto;cursor:grab;
    }
    html[data-glass] [data-gx-overlay-sb][data-dragging]{cursor:grabbing}
    html[data-glass] [data-gx-overlay-sb]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
    @media(prefers-reduced-motion:reduce){html[data-glass] [data-gx-overlay-sb]{transition:none}}

    /* 官方设置 · 账号与余额：沿用现有两组容器，只统一成其他插件的设置页的浅底卡。
       精确限定设置弹窗与直属卡片；不影响充值主按钮、登录弹窗或平台付款页。
       官方类名变更时本规则自然失效，保留官方界面。 */
    html[data-glass] [data-shortcut-modal="settings"] section._6qcDqa_section
    > :is(._6qcDqa_card,._6qcDqa_balanceCard){
      background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 34%,transparent);
      border-color:transparent;
      border-radius:12px;
      box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);
    }

    /* 官方设置关闭的开关保留可辨认的底色，不改变共享边框变量。 */
    html[data-glass] [data-shortcut-modal="settings"] button[class*="_switch_"][role="switch"][aria-checked="false"]{
      background:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent);
    }

    /* 官方设置 · 通用：原有内容容器就是一张卡，不增加标题、不移动设置项。 */
    html[data-glass] [data-shortcut-modal="settings"] .RmVo8q_section{
      box-sizing:border-box;
      padding:2px 18px 4px;
      border-radius:12px;
      background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 34%,transparent);
      box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);
    }
    /* 未选中的外观选项沿用设置页控件底色；选中、悬停及焦点保持官方状态。 */
    html[data-glass] [data-shortcut-modal="settings"] .RmVo8q_section
      .Iwzhua_themeCube:not(.Iwzhua_selected):not(:hover){
      background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);
    }

    /* 官方通用设置：只覆盖同类控件平时底色；悬停或焦点交还官方样式。 */
    html[data-glass] [data-shortcut-modal="settings"] .RmVo8q_section
      :is(._1jfq5W_selector,.CDP_Dq_selector,.-TO4SG_selector,.V68kMG_selector,.St8tea_button,._7qxJPq_stepper):not(:hover):not(:focus-within){
      background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);
    }
    /* 已选主题平时及悬停时均保留重点色。 */
    html[data-glass] [data-shortcut-modal="settings"] .RmVo8q_section
      .Iwzhua_themeCube.Iwzhua_selected{
      background:var(--glass-accent);
      color:var(--dsw-alias-label-primary-foreground);
    }

    /* 模型设置页：只统一外层卡片和普通控件的平时底色。 */
    html[data-glass] [data-shortcut-modal="settings"] .jrmgQW_section :is(.jrmgQW_rowCard,.jrmgQW_addCard,.jrmgQW_setupCard) {
      background-color: color-mix(in srgb,var(--dsw-alias-bg-layer-1) 34%,transparent);
    }
    html[data-glass] [data-shortcut-modal="settings"] .jrmgQW_section :is(.jrmgQW_secondaryButton:not(:hover),.jrmgQW_addButton:not(:hover),.jrmgQW_input:not(:hover):not(:focus-within)):not(:disabled) {
      background-color: color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);
    }

    /* 模型页：保留编辑区层次，删除按钮使用系统主按钮配色。 */
    html[data-glass] [data-shortcut-modal="settings"] .jrmgQW_section .jrmgQW_rowCard .jrmgQW_editor {
      background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 60%,transparent);
    }
    html[data-glass] [data-shortcut-modal="settings"] .jrmgQW_section .jrmgQW_rowActions .jrmgQW_dangerButton:not(:disabled) {
      background-color:var(--dsw-alias-button-primary-fill);
      color:var(--dsw-alias-label-primary-foreground);
    }
    html[data-glass] [data-shortcut-modal="settings"] .jrmgQW_section .jrmgQW_rowActions .jrmgQW_dangerButton:hover:not(:disabled) {
      background-color:var(--dsw-alias-button-primary-hover);
    }

    /* 官方设置 · 内置插件：只统一列表卡片、展开详情和普通控件的底色。 */
    html[data-glass] [data-shortcut-modal="settings"] .qgYWUG_section .qgYWUG_card {
      background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 34%,transparent);
    }
    html[data-glass] [data-shortcut-modal="settings"] .qgYWUG_section .qgYWUG_cardDetails {
      background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 60%,transparent);
    }
    html[data-glass] [data-shortcut-modal="settings"] .qgYWUG_section :is(.qgYWUG_search input,.qgYWUG_switcher):not(:disabled):not(:hover):not(:focus-within) {
      background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);
    }

    /* 内置插件列表的标识与状态标签：柔化底色，保留各状态文字颜色。 */
    html[data-glass] [data-shortcut-modal="settings"] .qgYWUG_section .qgYWUG_cardIdentity,
    html[data-glass] [data-shortcut-modal="settings"] .qgYWUG_section .qgYWUG_cardTrailing ._tag_brmue_4[data-tone="neutral"] {
      background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 45%,transparent);
    }
    html[data-glass] [data-shortcut-modal="settings"] .qgYWUG_section .qgYWUG_cardTrailing ._tag_brmue_4:is([data-tone="warning"],[data-tone="info"],[data-tone="danger"]) {
      background-color:color-mix(in srgb,currentColor 6%,transparent);
    }

    /* 官方 Agent 预设：卡片、创建入口和两个弹窗内的阅读区域。 */
    html[data-glass] [data-shortcut-modal="settings"] .Wsg8iW_section :is(.Wsg8iW_card:not(:hover),.Wsg8iW_cardActive) {
      background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 34%,transparent);
    }
    html[data-glass] [data-shortcut-modal="settings"] .Wsg8iW_section .Wsg8iW_creatorButton:not(:disabled):not(:hover):not(:focus-within) {
      background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);
    }
    html[data-glass] .Fi3Lcq_guideDialog .Fi3Lcq_guidePanel blockquote,
    html[data-glass] .Wsg8iW_dialog .Wsg8iW_viewerCode {
      background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 60%,transparent);
    }

    /* Agent 预设指南：仅调整分段栏底色与状态颜色。 */
    html[data-glass] .Fi3Lcq_guideDialog .Fi3Lcq_guideTabs {
      background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);
    }
    html[data-glass] .Fi3Lcq_guideDialog .Fi3Lcq_guideTabs ._indicator_1p79o_9 {
      background-color:var(--dsw-alias-button-primary-fill);
    }
    html[data-glass] .Fi3Lcq_guideDialog .Fi3Lcq_guideTabs [role="tab"][aria-selected="true"] {
      color:var(--dsw-alias-label-primary-foreground);
    }
    html[data-glass] .Fi3Lcq_guideDialog .Fi3Lcq_guideTabs [role="tab"][aria-selected="false"]:hover {
      background-color:var(--dsw-alias-interactive-bg-hover);
    }

    /* Agent 预设指南：柔化示例任务标签的底色。 */
    html[data-glass] .Fi3Lcq_guideDialog .Fi3Lcq_guideExampleTag[data-tone="neutral"] {
      background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 45%,transparent);
    }
    `;

    // src/client/settings.css
    var settings_default = `/* 玻璃主题 · 设置页
     * 结构：页头（玻璃主题 + 恢复默认）/ 三张分组卡（主题、背景、特效）。
     * 颜色全部走宿主 token，明暗两套主题都成立。
     */
    
    .gx-page{
      display:flex;flex-direction:column;gap:8px;
      padding:12px 0 14px;max-width:600px;
      color:var(--dsw-alias-label-primary);
      font-family:var(--dsw-font-family);
    }
    
    /* ---------- 页头 ---------- */
    .gx-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;margin:0 0 4px;padding:0}
    /* 四档字阶：总标题 > 区块标题 > 选项标题 > 说明文 */
    .gx-title{
      font-family:var(--dsw-font-family);
      font-size:17px;font-weight:700;line-height:24px;margin:0;
      letter-spacing:.06em;
    }
    /* ---------- 分组卡 ---------- */
    .gx-card{
      border-radius:12px;padding:2px 18px 4px;
      background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 34%,transparent);
      box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);
    }
    .gx-card-title{
      font-family:var(--dsw-font-family);
      font-size:15px;font-weight:650;line-height:22px;margin:0 0 18px;padding-top:10px;
      letter-spacing:.05em;
      color:var(--dsw-alias-label-primary);
    }
    
    /* ---------- 行 ---------- */
    .gx-row{
      display:flex;align-items:center;justify-content:space-between;gap:24px;
      padding:8px 0;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);
    }
    .gx-card .gx-row:last-child{border-bottom:0}
    .gx-row-text{min-width:0}
    /* 选项/说明改用系统 UI 栈，比主题字更素 */
    .gx-row-title{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;
      font-size:13.5px;font-weight:500;line-height:20px;letter-spacing:0;
    }
    .gx-row-desc{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;
      font-size:12px;font-weight:400;line-height:18px;margin-top:3px;max-width:300px;
      letter-spacing:0;
      color:color-mix(in srgb,var(--dsw-alias-label-secondary) 68%,transparent);
    }
    .gx-control{display:flex;align-items:center;gap:8px;flex:0 0 auto}
    
    /* ---------- 开关 ---------- */
    .gx-switch{
      width:36px;height:20px;border-radius:999px;corner-shape:round;border:0;padding:0;cursor:pointer;position:relative;
      background:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent);
      transition:background .18s;flex:0 0 auto;
    }
    .gx-switch::after{
      content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;corner-shape:round;
      background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .18s;
    }
    .gx-switch[aria-checked=true]{background:var(--glass-accent)}
    .gx-switch[aria-checked=true]::after{left:18px}
    .gx-switch:focus-visible{outline:2px solid color-mix(in srgb,var(--glass-accent) 80%,transparent);outline-offset:2px}
    
    /* ---------- 滑杆 + 数字框 ---------- */
    .gx-range{
      width:186px;height:20px;appearance:none;-webkit-appearance:none;background:transparent;margin:0;
      flex:0 1 186px;min-width:36px;
      --gx-fill:50%;
    }
    .gx-range::-webkit-slider-runnable-track{
      height:4px;border-radius:999px;
      background:linear-gradient(to right,var(--glass-accent) 0 var(--gx-fill),color-mix(in srgb,var(--dsw-alias-label-primary) 15%,transparent) var(--gx-fill) 100%);
    }
    .gx-range::-webkit-slider-thumb{
      -webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#fff;margin-top:-5px;
      box-shadow:0 0 0 .5px rgba(19,45,83,.30),0 1px 2px rgba(0,0,0,.18);cursor:pointer;
    }
    .gx-control:has(.gx-range){flex:0 1 auto;min-width:0;max-width:100%}
    .gx-num{display:flex;align-items:center;gap:6px;flex:none}
    .gx-stepper{position:relative;width:52px;height:32px;flex:none}
    .gx-stepper input{
      box-sizing:border-box;width:52px;height:32px;border:0;border-radius:var(--dsw-radius-md,8px);padding:0;text-align:center;
      background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);
      box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent),0 1px 2px rgba(19,45,83,.06);
      font:inherit;font-size:13.5px;color:var(--dsw-alias-label-primary);
      font-variant-numeric:tabular-nums;appearance:textfield;-moz-appearance:textfield;
    }
    .gx-stepper:hover input,.gx-stepper:focus-within input{background:var(--dsw-alias-bg-module-platform)}
    .gx-stepper input::-webkit-inner-spin-button,.gx-stepper input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
    .gx-stepper input:focus-visible,.gx-stepper-arrows button:focus-visible{outline:2px solid var(--glass-accent);outline-offset:1px}
    .gx-stepper-arrows{position:absolute;right:2px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:2px;opacity:0;pointer-events:none}
    .gx-stepper:hover .gx-stepper-arrows,.gx-stepper:focus-within .gx-stepper-arrows{opacity:1;pointer-events:auto}
    .gx-stepper-arrows button{
      box-sizing:border-box;width:10px;height:10px;padding:0;border:0;border-radius:var(--dsw-radius-xs,4px);
      display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
      color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 75%,transparent);
    }
    .gx-stepper-arrows button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}
    .gx-stepper-arrows button:disabled{opacity:.45;cursor:default}
    .gx-unit{font-size:12px;min-width:14px;color:color-mix(in srgb,var(--dsw-alias-label-secondary) 50%,transparent)}
    
    /* ---------- 按钮 / 壁纸 ---------- */
    .gx-btn{
      box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;
      height:32px;padding:0 12px;border:0;border-radius:var(--dsw-radius-md,8px);cursor:pointer;white-space:nowrap;
      background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);
      box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent),0 1px 2px rgba(19,45,83,.06);
      font-family:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);
    }
    .gx-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
    .gx-btn:disabled{opacity:.5;cursor:default}
    .gx-btn.danger{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
    .gx-btn.danger:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
    .gx-wallpaper{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;max-width:420px}
    .gx-thumb{
      width:84px;height:48px;border-radius:8px;overflow:hidden;flex:0 0 auto;background:#dbe4ef;
      box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent);
    }
    .gx-thumb img,.gx-thumb video{width:100%;height:100%;object-fit:cover;display:block}
    .gx-thumb-empty{
      width:100%;height:100%;display:flex;align-items:center;justify-content:center;
      font-size:11px;color:color-mix(in srgb,var(--dsw-alias-label-secondary) 60%,transparent);
    }
    .gx-note{
      margin:6px 0 0;font-size:12px;line-height:18px;
      color:color-mix(in srgb,var(--dsw-alias-label-secondary) 68%,transparent);
    }
    .gx-error{color:#C8436F}
    
    /* ---------- 重点色 ---------- */
    .gx-swatches{display:flex;align-items:center;gap:6px}
    .gx-sw{
      width:18px;height:18px;border-radius:50%;border:0;padding:0;cursor:pointer;
      background:var(--gx-c);
      box-shadow:0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent);
    }
    .gx-sw.on{box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1),0 0 0 3.5px color-mix(in srgb,var(--dsw-alias-label-primary) 38%,transparent)}
    .gx-sw.white{box-shadow:0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 34%,transparent)}
    .gx-sw.white.on{box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1),0 0 0 3.5px color-mix(in srgb,var(--dsw-alias-label-primary) 38%,transparent)}
    .gx-custom{
      position:relative;width:22px;height:22px;border-radius:50%;border:0;padding:0;cursor:pointer;flex:0 0 auto;
      background:conic-gradient(from 30deg,#f77,#fc6,#ff6,#7d7,#6cf,#a7f,#f77);
    }
    .gx-custom::after{
      content:"";position:absolute;inset:3px;border-radius:50%;background:var(--glass-accent);
      box-shadow:inset 0 0 0 .5px rgba(255,255,255,.5);
    }
    .gx-custom input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0}
    .gx-hex{
      font-size:12px;min-width:58px;letter-spacing:.02em;font-variant-numeric:tabular-nums;
      color:color-mix(in srgb,var(--dsw-alias-label-secondary) 50%,transparent);
    }
    
    /* ---------- 深色微调 ---------- */
    body[data-ds-dark-theme] .gx-thumb{background:#243141}
    
    body[data-ds-dark-theme] .gx-error{color:#F08CAE}
    `;

    // src/shared/settings.ts
    var DEFAULT_SETTINGS = Object.freeze({
      accent: "#F077AF",
      blur: 4,
      frost: 55,
      wallpaperBlur: 0,
      wallpaperFrost: 20,
      videoBlur: 6,
      videoBrightness: 45,
      bgBrightness: 50,
      press: true,
      spotlight: true
    });
    var SETTINGS_KEY = "dsh-glass-theme.v1";
    var LEGACY_KEYS = [
      ["dsh.ui-aqua.blur", "blur"],
      ["dsh.ui-aqua.frost", "frost"],
      ["dsh.ui-aqua.wallpaperBlur", "wallpaperBlur"],
      ["dsh.ui-aqua.wallpaperFrost", "wallpaperFrost"],
      ["dsh.ui-aqua.videoBlur", "videoBlur"],
      ["dsh.ui-aqua.videoBrightness", "videoBrightness"],
      ["dsh.ui-aqua.bgBrightness", "bgBrightness"],
      ["dsh.ui-aqua.press", "press"],
      ["dsh.ui-aqua.spotlight", "spotlight"]
    ];
    var LEGACY_WALLPAPER_KEY = "dsh.ui-aqua.wallpaper";
    var RANGES = {
      blur: [0, 40],
      frost: [0, 100],
      wallpaperBlur: [0, 40],
      wallpaperFrost: [0, 100],
      videoBlur: [0, 40],
      videoBrightness: [0, 100],
      bgBrightness: [0, 100]
    };
    function clampNumber(value, min, max, fallback) {
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, Math.round(n)));
    }
    function readBoolean(value, fallback) {
      if (value === true || value === "true" || value === 1 || value === "1") return true;
      if (value === false || value === "false" || value === 0 || value === "0") return false;
      return fallback;
    }
    function normalizeHex(value, fallback = DEFAULT_SETTINGS.accent) {
      if (typeof value !== "string") return fallback;
      const text = value.trim();
      return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toUpperCase() : fallback;
    }
    function normalizeSettings(input) {
      if (input === null || typeof input !== "object") return { ...DEFAULT_SETTINGS };
      const raw = input;
      const out = { ...DEFAULT_SETTINGS };
      out.accent = normalizeHex(raw.accent, DEFAULT_SETTINGS.accent);
      for (const [key, [min, max]] of Object.entries(RANGES)) {
        const field = key;
        out[field] = clampNumber(raw[field], min, max, DEFAULT_SETTINGS[field]);
      }
      out.press = readBoolean(raw.press, DEFAULT_SETTINGS.press);
      out.spotlight = readBoolean(raw.spotlight, DEFAULT_SETTINGS.spotlight);
      return out;
    }
    function parseSettings(raw) {
      if (raw === null || raw === "") return { ...DEFAULT_SETTINGS };
      try {
        return normalizeSettings(JSON.parse(raw));
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    }
    function serializeSettings(settings) {
      return JSON.stringify(normalizeSettings(settings));
    }
    function migrateLegacy(read) {
      const settings = { ...DEFAULT_SETTINGS };
      for (const [key, field] of LEGACY_KEYS) {
        const raw = read(key);
        if (raw === null) continue;
        if (field === "press" || field === "spotlight") {
          settings[field] = readBoolean(raw, settings[field]);
        } else {
          const [min, max] = RANGES[field] ?? [0, 100];
          settings[field] = clampNumber(raw, min, max, settings[field]);
        }
      }
      const wallpaper = read(LEGACY_WALLPAPER_KEY);
      return {
        settings,
        wallpaper: wallpaper !== null && /^data:(image|video)\//.test(wallpaper) ? wallpaper : null
      };
    }
    function luminance(hex) {
      const value = normalizeHex(hex);
      const channel = (offset) => {
        const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    }
    function inkFor(hex) {
      return luminance(hex) >= 0.3 ? "#13243E" : "#FFFFFF";
    }

    // src/client/api.ts
    var BASE = "/api/glass-theme";
    var MAX_BYTES = 50 * 1024 * 1024;
    async function errorOf(response) {
      try {
        const body = await response.json();
        if (typeof body.error === "string" && body.error !== "") return body.error;
      } catch {
      }
      return `请求失败（HTTP ${response.status}）`;
    }
    async function fetchWallpaper() {
      const response = await fetch(`${BASE}/wallpaper`, { cache: "no-store" });
      if (!response.ok) throw new Error(await errorOf(response));
      const body = await response.json();
      if (typeof body.file !== "string") return null;
      return body;
    }
    async function uploadWallpaper(file) {
      if (file.size > MAX_BYTES) throw new Error(`文件太大（上限 ${MAX_BYTES / 1024 / 1024} MB）`);
      const dot = file.name.lastIndexOf(".");
      const ext = dot < 0 ? "" : file.name.slice(dot).toLowerCase();
      const response = await fetch(`${BASE}/wallpaper`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "x-ext": ext },
        body: await file.arrayBuffer()
      });
      if (!response.ok) throw new Error(await errorOf(response));
      return await response.json();
    }
    async function deleteWallpaper() {
      const response = await fetch(`${BASE}/wallpaper`, { method: "DELETE" });
      if (!response.ok) throw new Error(await errorOf(response));
    }
    async function revealWallpaperFolder() {
      const response = await fetch(`${BASE}/reveal`, { method: "POST" });
      if (!response.ok) throw new Error(await errorOf(response));
    }
    async function importDataUrl(dataUrl) {
      const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
      if (match === null) return null;
      const mime = match[1].toLowerCase();
      const media = mime.startsWith("video/") ? "video" : "image";
      let ext;
      if (media === "video") {
        if (mime.includes("webm")) ext = ".webm";
        else if (mime.includes("quicktime")) ext = ".mov";
        else ext = ".mp4";
      } else if (mime.includes("png")) {
        ext = ".png";
      } else if (mime.includes("webp")) {
        ext = ".webp";
      } else if (mime.includes("gif")) {
        ext = ".gif";
      } else if (mime.includes("avif")) {
        ext = ".avif";
      } else {
        ext = ".jpg";
      }
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const response = await fetch(`${BASE}/wallpaper`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "x-ext": ext },
        body: bytes
      });
      if (!response.ok) return null;
      return await response.json();
    }

    // src/client/state.ts
    function getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    function setItem(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
    function loadInitialSettings() {
      const stored = getItem(SETTINGS_KEY);
      let settings;
      if (stored !== null) {
        settings = parseSettings(stored);
      } else {
        const legacy = migrateLegacy(getItem);
        settings = legacy.settings;
        setItem(SETTINGS_KEY, serializeSettings(settings));
      }
      return { settings, legacyWallpaper: readLegacyWallpaper() };
    }
    var LEGACY_WALLPAPER_DONE_KEY = "dsh-glass-theme.wallpaperMigrated";
    function readLegacyWallpaper() {
      if (getItem(LEGACY_WALLPAPER_DONE_KEY) === "1") return null;
      const raw = getItem("dsh.ui-aqua.wallpaper");
      return raw !== null && /^data:(image|video)\//.test(raw) ? raw : null;
    }
    function markLegacyWallpaperMigrated() {
      setItem(LEGACY_WALLPAPER_DONE_KEY, "1");
    }
    var SettingsStore = class {
      value;
      listeners = /* @__PURE__ */ new Set();
      constructor(initial) {
        this.value = initial;
      }
      getSnapshot = () => this.value;
      subscribe = (listener) => {
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      };
      /** 合并一个补丁并落盘；内存态也回洗，避免坏值写上 DOM。 */
      update(patch) {
        this.value = normalizeSettings({ ...this.value, ...patch });
        const saved = setItem(SETTINGS_KEY, serializeSettings(this.value));
        this.emit();
        return saved;
      }
      /** 回到出厂参数。 */
      reset() {
        this.value = { ...DEFAULT_SETTINGS };
        const saved = setItem(SETTINGS_KEY, serializeSettings(this.value));
        this.emit();
        return saved;
      }
      emit() {
        for (const listener of this.listeners) {
          try {
            listener();
          } catch {
          }
        }
      }
    };
    var WallpaperStore = class {
      snapshot = { entry: void 0, error: null, busy: false };
      listeners = /* @__PURE__ */ new Set();
      /** 只接受最新操作的读取响应；上传/删除会让之前的读取立即过期。 */
      revision = 0;
      getSnapshot = () => this.snapshot;
      subscribe = (listener) => {
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      };
      set(patch) {
        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners) listener();
      }
      /** 重新读主机状态。 */
      async refresh() {
        if (this.snapshot.busy) return;
        const revision = ++this.revision;
        try {
          const entry = await fetchWallpaper();
          if (revision !== this.revision) return;
          this.set({ entry, error: null });
        } catch (error) {
          if (revision !== this.revision) return;
          this.set({ entry: null, error: String(error?.message ?? error) });
        }
      }
      /** 上传并切换壁纸。 */
      async upload(file) {
        if (this.snapshot.busy) return false;
        ++this.revision;
        this.set({ busy: true, error: null });
        try {
          const entry = await uploadWallpaper(file);
          this.set({ entry, busy: false });
          return true;
        } catch (error) {
          this.set({ busy: false, error: String(error?.message ?? error) });
          return false;
        }
      }
      /** 删除当前壁纸。 */
      async remove() {
        if (this.snapshot.busy) return false;
        ++this.revision;
        this.set({ busy: true, error: null });
        try {
          await deleteWallpaper();
          this.set({ entry: null, busy: false });
          return true;
        } catch (error) {
          this.set({ busy: false, error: String(error?.message ?? error) });
          return false;
        }
      }
      /** 打开 壁纸/ 目录。 */
      async reveal() {
        this.set({ error: null });
        try {
          await revealWallpaperFolder();
          return true;
        } catch (error) {
          this.set({ error: String(error?.message ?? error) });
          return false;
        }
      }
      /** 旧插件的 data URL 壁纸 -> 主机文件。 */
      async importLegacy(dataUrl) {
        if (this.snapshot.busy) return false;
        ++this.revision;
        this.set({ busy: true });
        try {
          const entry = await importDataUrl(dataUrl);
          if (entry === null) return false;
          this.set({ entry });
          return true;
        } catch {
          return false;
        } finally {
          this.set({ busy: false });
        }
      }
    };

    // src/client/theme/frame-throttle.ts
    function createFrameThrottle(flush, scheduler) {
      let handle = null;
      let disposed = false;
      return {
        schedule() {
          if (disposed || handle !== null) return;
          handle = scheduler.request(() => {
            handle = null;
            flush();
          });
        },
        dispose() {
          disposed = true;
          if (handle === null) return;
          scheduler.cancel(handle);
          handle = null;
        }
      };
    }
    var rafScheduler = {
      request: (callback) => requestAnimationFrame(() => callback()),
      cancel: (handle) => cancelAnimationFrame(handle)
    };

    // src/client/theme/seams.ts
    var SEAMS = [
      { attribute: "data-dsh-frame", selector: ':has(> [class*="sidebarCol"])' },
      { attribute: "data-dsh-sidebar-root", selector: '[class*="sidebarCol"] [class*="root"]', first: true },
      { attribute: "data-dsh-surface", selector: 'button[class*="newSession"]' },
      { attribute: "data-dsh-account", selector: 'button[data-signed-out][aria-haspopup="menu"]' },
      { attribute: "data-dsh-trajectory", selector: "[data-conversation-composer-overlay]" },
      { attribute: "data-dsh-details", selector: '[class*="detailsCol"] [class*="root"]', first: true },
      { attribute: "data-dsh-inputbar", selector: ":has(> [data-composer-card])" },
      { attribute: "data-dsh-add", selector: '[data-composer-card] [class*="add"]' },
      { attribute: "data-dsh-stats", selector: '[data-slot="conversation.composer.dock"] [class*="root"]' },
      { attribute: "data-dsh-wordmark", selector: '[class*="sidebarCol"] [class*="brand"]', first: true }
    ];
    function stamp(seam) {
      if (seam.first) {
        const el = document.querySelector(seam.selector);
        if (el !== null && !el.hasAttribute(seam.attribute)) el.setAttribute(seam.attribute, "");
        return;
      }
      for (const el of document.querySelectorAll(seam.selector)) {
        if (!el.hasAttribute(seam.attribute)) el.setAttribute(seam.attribute, "");
      }
    }
    function ensureSidebarFills() {
      const roots = [];
      for (const col of document.querySelectorAll('[class*="sidebarCol"]')) {
        if (!(col instanceof HTMLElement)) continue;
        if (col.parentElement !== null && col.parentElement.closest('[class*="sidebarCol"]') !== null) continue;
        roots.push(col);
        const fills = [...col.querySelectorAll(":scope > [data-glass-sidebar-fill]")];
        let fill = fills[0];
        if (fill === void 0) {
          fill = document.createElement("div");
          fill.setAttribute("data-glass-sidebar-fill", "");
          col.insertBefore(fill, col.firstChild);
        } else if (col.firstElementChild !== fill) {
          col.insertBefore(fill, col.firstChild);
        }
        for (let i = 1; i < fills.length; i++) fills[i].remove();
      }
      for (const orphan of document.querySelectorAll("[data-glass-sidebar-fill]")) {
        if (!(orphan instanceof HTMLElement)) continue;
        if (!roots.some((root) => root === orphan.parentElement)) orphan.remove();
      }
    }
    function removeSidebarFills() {
      for (const fill of document.querySelectorAll("[data-glass-sidebar-fill]")) {
        fill.remove();
      }
    }
    function stampAll() {
      for (const seam of SEAMS) stamp(seam);
      ensureSidebarFills();
    }
    function startSeamStamper() {
      stampAll();
      const throttle = createFrameThrottle(stampAll, rafScheduler);
      const observer = new MutationObserver(() => throttle.schedule());
      observer.observe(document.documentElement, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        throttle.dispose();
        removeSidebarFills();
      };
    }

    // src/client/theme/spotlight.ts
    var PANE_SELECTOR = [
      '[class*="sidebarCol"]',
      "[data-phase] header",
      /* 输入玻璃本体；有统计行时外壳才是玻璃，见下方 mark 跳过内层 card */
      "[data-composer-card]",
      "[data-dsh-inputbar]:has([data-dsh-stats])",
      /* 轨迹/会话大板只做辉光，不上浮（CSS 里禁 transform） */
      "[data-dsh-trajectory]",
      "[data-dsh-surface]",
      "[data-dsh-account]",
      "[data-sidebar-right-panel] [data-dockkit-pane]"
    ].join(",");
    var GLOW_RADIUS = 180;
    function startSpotlight() {
      let hovered = null;
      let frame = 0;
      let syncFrame = 0;
      const markPanes = () => {
        for (const pane of document.querySelectorAll(PANE_SELECTOR)) {
          if (pane.hasAttribute("data-composer-card") && pane.closest("[data-dsh-inputbar]:has([data-dsh-stats])") !== null) {
            pane.removeAttribute("data-glass-spot");
            continue;
          }
          if (!pane.hasAttribute("data-glass-spot")) pane.setAttribute("data-glass-spot", "");
        }
      };
      const scheduleMark = () => {
        if (syncFrame !== 0) return;
        syncFrame = requestAnimationFrame(() => {
          syncFrame = 0;
          markPanes();
        });
      };
      const paint = (clientX, clientY) => {
        if (hovered === null) return;
        if (frame !== 0) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const pane = hovered;
          if (pane === null) return;
          const rect = pane.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          pane.style.setProperty("--gx-mx", `${clientX - rect.left}px`);
          pane.style.setProperty("--gx-my", `${clientY - rect.top}px`);
          pane.style.setProperty("--gx-glow-radius", `${GLOW_RADIUS}px`);
        });
      };
      const paneOf = (target) => target instanceof Element ? target.closest("[data-glass-spot]") : null;
      const onOver = (event) => {
        const pane = paneOf(event.target);
        if (pane === null) return;
        if (hovered !== null && hovered !== pane) hovered.removeAttribute("data-spot-on");
        hovered = pane;
        pane.setAttribute("data-spot-on", "");
        paint(event.clientX, event.clientY);
      };
      const onMove = (event) => {
        if (hovered === null) return;
        if (!hovered.contains(event.target)) return;
        paint(event.clientX, event.clientY);
      };
      const onOut = (event) => {
        if (hovered === null) return;
        const next = event.relatedTarget;
        if (next instanceof Node && hovered.contains(next)) return;
        hovered.removeAttribute("data-spot-on");
        hovered = null;
      };
      markPanes();
      const observer = new MutationObserver(scheduleMark);
      observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener("pointerover", onOver, { passive: true });
      document.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerout", onOut, { passive: true });
      return () => {
        observer.disconnect();
        document.removeEventListener("pointerover", onOver);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerout", onOut);
        if (frame !== 0) cancelAnimationFrame(frame);
        if (syncFrame !== 0) cancelAnimationFrame(syncFrame);
        hovered?.removeAttribute("data-spot-on");
        hovered = null;
      };
    }

    // src/client/theme/overlay-scrollbar.ts
    var HIDE_DELAY_MS = 1e3;
    var HOST_ATTR = "data-gx-sb-host";
    var THUMB_ATTR = "data-gx-overlay-sb";
    var VISIBLE_ATTR = "data-visible";
    var THUMB_Z = "1100";
    function scrollAriaLabel(override) {
      if (typeof override === "string" && override.trim() !== "") return override.trim();
      const lang = typeof navigator !== "undefined" && navigator.language || typeof document !== "undefined" && document.documentElement.lang || "en";
      return /^zh\b/i.test(String(lang)) ? "滚动内容" : "Scroll content";
    }
    function isYScrollContainer(el) {
      const oy = getComputedStyle(el).overflowY;
      return oy === "auto" || oy === "scroll" || oy === "overlay";
    }
    function hasSessionListToken(el) {
      for (const c of el.classList) {
        if (/_list$/.test(c)) return true;
      }
      return false;
    }
    function isExcludedOutsideSettings(el) {
      if (el.closest("[data-conversation-scroll]")) return true;
      if (el.closest("[data-composer-card]")) return true;
      if (el.closest("[data-composer-seat]")) return true;
      if (el.closest("[data-sidebar-right-panel]")) return true;
      return false;
    }
    function collectScrollHosts(dialogCache) {
      const hosts = /* @__PURE__ */ new Set();
      for (const dialog of document.querySelectorAll('[role="dialog"]')) {
        if (!(dialog instanceof HTMLElement)) continue;
        let all = dialogCache.get(dialog);
        if (all === void 0) {
          all = [...dialog.querySelectorAll("*")];
          dialogCache.set(dialog, all);
        }
        for (const sel of [
          '[class*="AnXs9G_options"]',
          '[class*="AnXs9G_navList"]',
          '[class*="_options"]',
          '[class*="_navList"]'
        ]) {
          for (const node of all) {
            if (node instanceof HTMLElement && node.matches(sel) && isYScrollContainer(node)) hosts.add(node);
          }
        }
        for (const node of all) {
          if (!(node instanceof HTMLElement)) continue;
          if (!isYScrollContainer(node)) continue;
          hosts.add(node);
        }
      }
      for (const node of document.querySelectorAll('[class*="GAkraW_list"]')) {
        if (!(node instanceof HTMLElement)) continue;
        if (!hasSessionListToken(node)) continue;
        if (!isYScrollContainer(node)) continue;
        if (isExcludedOutsideSettings(node)) continue;
        hosts.add(node);
      }
      for (const scope of document.querySelectorAll(
        '[data-dsh-sidebar-root], [class*="sidebarCol"], [class*="GAkraW_root"]'
      )) {
        if (!(scope instanceof Element)) continue;
        for (const node of scope.querySelectorAll('[class*="_list"]')) {
          if (!(node instanceof HTMLElement)) continue;
          if (!hasSessionListToken(node)) continue;
          if (!isYScrollContainer(node)) continue;
          if (isExcludedOutsideSettings(node)) continue;
          hosts.add(node);
        }
      }
      for (const node of document.querySelectorAll(".plp-page, .mct-page, .dst-page")) {
        if (node instanceof HTMLElement && isYScrollContainer(node)) hosts.add(node);
      }
      for (const node of document.querySelectorAll(
        "[data-sidebar-right-panel] [data-files-body], [data-sidebar-right-panel] [data-textpreview-body]"
      )) {
        if (node instanceof HTMLElement && isYScrollContainer(node)) hosts.add(node);
      }
      for (const node of document.querySelectorAll("[data-conversation-scroll]")) {
        if (node instanceof HTMLElement && isYScrollContainer(node)) hosts.add(node);
      }
      return [...hosts];
    }
    function preserveChatGeometry(el) {
      if (!el.hasAttribute("data-conversation-scroll")) return null;
      const style = getComputedStyle(el);
      const gutter = Math.max(0, el.offsetWidth - el.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth));
      const entries = [
        ["--gx-chat-scroll-gutter", `${gutter}px`],
        ["--gx-chat-original-padding", style.paddingInlineEnd]
      ];
      const previous = entries.map(([name]) => [name, el.style.getPropertyValue(name), el.style.getPropertyPriority(name)]);
      for (const [name, value] of entries) el.style.setProperty(name, value);
      return () => {
        for (const [name, value, priority] of previous) {
          if (value === "") el.style.removeProperty(name);
          else el.style.setProperty(name, value, priority);
        }
      };
    }
    function notifyChatIntent(el, event) {
      if (!el.hasAttribute("data-conversation-scroll")) return;
      if (event.type === "pointerdown") {
        const pointer = event;
        el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: pointer.pointerId, pointerType: pointer.pointerType, button: pointer.button, clientX: pointer.clientX, clientY: pointer.clientY }));
      } else if (event.type === "keydown") {
        const key = event;
        el.dispatchEvent(new KeyboardEvent("keydown", { key: key.key, code: key.code, ctrlKey: key.ctrlKey, metaKey: key.metaKey, shiftKey: key.shiftKey, altKey: key.altKey }));
      } else if (event.type === "wheel") {
        const wheel = event;
        el.dispatchEvent(new WheelEvent("wheel", { deltaX: wheel.deltaX, deltaY: wheel.deltaY, deltaMode: wheel.deltaMode }));
      }
    }
    function startOverlayScrollbar(options) {
      const label = scrollAriaLabel(options?.ariaLabel);
      const tracks = /* @__PURE__ */ new Map();
      let nextId = 0;
      const hide = (track) => {
        track.thumb.style.display = "none";
        track.thumb.removeAttribute(VISIBLE_ATTR);
      };
      const visibleBounds = (el) => {
        if (!el.isConnected || el.getClientRects().length === 0) return null;
        const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((dialog) => dialog.getClientRects().length > 0 && getComputedStyle(dialog).visibility !== "hidden");
        const activeDialog = dialogs.at(-1);
        if (activeDialog !== void 0 && !activeDialog.contains(el)) return null;
        const rect = el.getBoundingClientRect();
        let top = Math.max(0, rect.top + el.clientTop);
        let bottom = Math.min(window.innerHeight, rect.top + el.clientTop + el.clientHeight);
        let left = Math.max(0, rect.left + el.clientLeft);
        let right = Math.min(window.innerWidth, rect.left + el.clientLeft + el.clientWidth);
        for (let parent = el.parentElement; parent !== null; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.visibility === "hidden" || style.display === "none") return null;
          const box = parent.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            top = Math.max(top, box.top + parent.clientTop);
            bottom = Math.min(bottom, box.top + parent.clientTop + parent.clientHeight);
          }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
            left = Math.max(left, box.left + parent.clientLeft);
            right = Math.min(right, box.left + parent.clientLeft + parent.clientWidth);
          }
        }
        if (bottom - top < 12 || right - left < 14) return null;
        return { top, right, height: bottom - top };
      };
      const paint = (track) => {
        const { el, thumb } = track;
        const bounds = visibleBounds(el);
        const maximum = Math.max(0, el.scrollHeight - el.clientHeight);
        if (bounds === null || maximum <= 1) {
          hide(track);
          return false;
        }
        const height = Math.min(bounds.height, Math.max(28, el.clientHeight / el.scrollHeight * bounds.height));
        track.travel = Math.max(0, bounds.height - height);
        const top = bounds.top + Math.max(0, Math.min(1, el.scrollTop / maximum)) * track.travel;
        thumb.style.display = "";
        thumb.style.top = `${top}px`;
        thumb.style.left = `${bounds.right - 14}px`;
        thumb.style.height = `${height}px`;
        thumb.setAttribute("aria-valuemax", String(Math.ceil(maximum)));
        thumb.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(maximum, el.scrollTop)))));
        return true;
      };
      const scheduleHide = (track) => {
        if (track.hideTimer !== 0) clearTimeout(track.hideTimer);
        track.hideTimer = 0;
        if (track.stopDrag !== null) return;
        track.hideTimer = setTimeout(() => {
          track.hideTimer = 0;
          if (track.stopDrag !== null || document.activeElement === track.thumb || track.thumb.matches(":hover")) return;
          track.thumb.removeAttribute(VISIBLE_ATTR);
        }, HIDE_DELAY_MS);
      };
      const reveal = (track) => {
        if (!paint(track)) return;
        track.thumb.setAttribute(VISIBLE_ATTR, "");
        scheduleHide(track);
      };
      const startDrag = (track, event) => {
        if (event.button !== 0 || !paint(track) || track.travel <= 0) return;
        event.preventDefault();
        event.stopPropagation();
        track.stopDrag?.();
        notifyChatIntent(track.el, event);
        const pointerId = event.pointerId;
        const startY = event.clientY;
        const startScroll = track.el.scrollTop;
        const oldSelect = document.body.style.userSelect;
        const oldCursor = document.body.style.cursor;
        const move = (next) => {
          if (next.pointerId !== pointerId) return;
          next.preventDefault();
          const maximum = Math.max(0, track.el.scrollHeight - track.el.clientHeight);
          track.el.scrollTop = Math.max(0, Math.min(maximum, startScroll + (next.clientY - startY) * maximum / Math.max(1, track.travel)));
          paint(track);
        };
        const finish = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", release);
          window.removeEventListener("pointercancel", release);
          window.removeEventListener("blur", finish);
          try {
            track.thumb.releasePointerCapture(pointerId);
          } catch {
          }
          document.body.style.userSelect = oldSelect;
          document.body.style.cursor = oldCursor;
          track.thumb.removeAttribute("data-dragging");
          track.stopDrag = null;
          scheduleHide(track);
        };
        const release = (next) => {
          if (next.pointerId === pointerId) finish();
        };
        track.stopDrag = finish;
        if (track.hideTimer !== 0) clearTimeout(track.hideTimer);
        track.hideTimer = 0;
        track.thumb.setAttribute(VISIBLE_ATTR, "");
        track.thumb.setAttribute("data-dragging", "");
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        try {
          track.thumb.setPointerCapture(pointerId);
        } catch {
        }
        window.addEventListener("pointermove", move, { passive: false });
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
        window.addEventListener("blur", finish);
      };
      const observeContent = (track) => {
        const current = /* @__PURE__ */ new Set([track.el, ...track.el.children]);
        for (const node of track.observed) if (!current.has(node)) track.resize.unobserve(node);
        for (const node of current) if (!track.observed.has(node)) track.resize.observe(node);
        track.observed = current;
      };
      const bind = (el) => {
        if (tracks.has(el)) return;
        const restoreChatGeometry = preserveChatGeometry(el);
        el.setAttribute(HOST_ATTR, "");
        let generatedId = null;
        if (el.id === "") {
          do {
            generatedId = `gx-scroll-host-${++nextId}`;
          } while (document.getElementById(generatedId) !== null);
          el.id = generatedId;
        }
        const thumb = document.createElement("div");
        thumb.setAttribute(THUMB_ATTR, "");
        thumb.setAttribute("role", "scrollbar");
        thumb.setAttribute("aria-label", label);
        thumb.setAttribute("aria-orientation", "vertical");
        thumb.setAttribute("aria-controls", el.id);
        thumb.setAttribute("aria-valuemin", "0");
        thumb.tabIndex = 0;
        thumb.style.zIndex = THUMB_Z;
        document.body.appendChild(thumb);
        const track = {
          el,
          thumb,
          generatedId,
          restoreChatGeometry,
          hideTimer: 0,
          travel: 0,
          stopDrag: null,
          resize: new ResizeObserver(() => scheduleSync()),
          observed: /* @__PURE__ */ new Set(),
          cleanups: []
        };
        const listen = (target, type, fn, options2) => {
          target.addEventListener(type, fn, options2);
          track.cleanups.push(() => target.removeEventListener(type, fn, options2));
        };
        listen(el, "scroll", () => reveal(track), { passive: true });
        listen(el, "pointermove", (event) => {
          const pointer = event;
          const right = el.getBoundingClientRect().right;
          if (pointer.clientX >= right - 16 && pointer.clientX <= right) reveal(track);
        }, { passive: true });
        listen(thumb, "pointerenter", () => reveal(track));
        listen(thumb, "pointerleave", () => scheduleHide(track));
        listen(thumb, "focus", () => reveal(track));
        listen(thumb, "blur", () => scheduleHide(track));
        listen(thumb, "pointerdown", (event) => startDrag(track, event));
        listen(thumb, "wheel", (event) => notifyChatIntent(el, event), { passive: true });
        listen(thumb, "keydown", (event) => {
          const key = event;
          const maximum = Math.max(0, el.scrollHeight - el.clientHeight);
          const positions = {
            ArrowUp: el.scrollTop - 40,
            ArrowDown: el.scrollTop + 40,
            PageUp: el.scrollTop - el.clientHeight * 0.9,
            PageDown: el.scrollTop + el.clientHeight * 0.9,
            Home: 0,
            End: maximum
          };
          const next = positions[key.key];
          if (next === void 0) return;
          key.preventDefault();
          key.stopPropagation();
          notifyChatIntent(el, key);
          el.scrollTop = Math.max(0, Math.min(maximum, next));
          reveal(track);
        });
        tracks.set(el, track);
        observeContent(track);
        paint(track);
      };
      const unbind = (el) => {
        const track = tracks.get(el);
        if (track === void 0) return;
        track.stopDrag?.();
        track.resize.disconnect();
        for (const cleanup of track.cleanups) cleanup();
        if (track.hideTimer !== 0) clearTimeout(track.hideTimer);
        el.removeAttribute(HOST_ATTR);
        track.restoreChatGeometry?.();
        if (track.generatedId !== null && el.id === track.generatedId) el.removeAttribute("id");
        track.thumb.remove();
        tracks.delete(el);
      };
      const sync = () => {
        const found = new Set(collectScrollHosts(/* @__PURE__ */ new Map()));
        for (const el of found) bind(el);
        for (const [el, track] of tracks) {
          if (!found.has(el) || !el.isConnected) unbind(el);
          else {
            observeContent(track);
            paint(track);
          }
        }
      };
      const syncThrottle = createFrameThrottle(sync, rafScheduler);
      const scheduleSync = () => {
        syncThrottle.schedule();
      };
      const observer = new MutationObserver((records) => {
        const relevant = records.some((record) => {
          if (record.target instanceof Element && record.target.closest(`[${THUMB_ATTR}]`) !== null) return false;
          if (record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every((node) => node instanceof Element && node.hasAttribute(THUMB_ATTR))) return false;
          return true;
        });
        if (relevant) scheduleSync();
      });
      sync();
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "open", "aria-hidden"]
      });
      window.addEventListener("resize", scheduleSync, { passive: true });
      window.addEventListener("scroll", scheduleSync, { passive: true, capture: true });
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", scheduleSync);
        window.removeEventListener("scroll", scheduleSync, true);
        syncThrottle.dispose();
        for (const el of [...tracks.keys()]) unbind(el);
      };
    }

    // src/client/theme/wordmark.ts
    var PLATE_SELECTOR = 'rect[x="129.348"]';
    function startWordmarkBadge() {
      let badge = null;
      let raf = 0;
      let plateObserver = null;
      let observedPlate = null;
      const remove = () => {
        badge?.remove();
        badge = null;
      };
      const ensure = () => {
        if (badge !== null) return badge;
        const element = document.createElement("div");
        element.setAttribute("data-glass-badge", "");
        const text = document.createElement("span");
        text.textContent = "Harness";
        element.append(text);
        document.body.append(element);
        badge = element;
        return element;
      };
      const unobservePlate = () => {
        if (plateObserver !== null && observedPlate !== null) {
          try {
            plateObserver.unobserve(observedPlate);
          } catch {
          }
        }
        observedPlate = null;
      };
      const observePlate = (plate) => {
        if (observedPlate === plate) return;
        unobservePlate();
        if (plateObserver === null) {
          plateObserver = new ResizeObserver(() => schedule());
        }
        plateObserver.observe(plate);
        observedPlate = plate;
      };
      const sync = () => {
        const dark = document.body.hasAttribute("data-ds-dark-theme");
        const plate = document.querySelector(PLATE_SELECTOR);
        if (!dark || plate === null) {
          unobservePlate();
          remove();
          return;
        }
        observePlate(plate);
        const rect = plate.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 4) {
          remove();
          return;
        }
        const element = ensure();
        element.style.left = `${rect.left - 1}px`;
        element.style.top = `${rect.top - 1}px`;
        element.style.width = `${rect.width + 2}px`;
        element.style.height = `${rect.height + 2}px`;
        element.style.fontSize = `${Math.max(7.5, Math.min(10, rect.height * 0.68))}px`;
      };
      const schedule = () => {
        if (raf !== 0) return;
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          sync();
        });
      };
      const observer = new MutationObserver(() => schedule());
      observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"], childList: true, subtree: true });
      window.addEventListener("resize", schedule);
      schedule();
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", schedule);
        if (raf !== 0) window.cancelAnimationFrame(raf);
        unobservePlate();
        plateObserver?.disconnect();
        plateObserver = null;
        remove();
      };
    }

    // src/client/theme/layer.ts
    var GlassLayer = class {
      constructor(settings, wallpaper) {
        this.settings = settings;
        this.wallpaper = wallpaper;
      }
      background = null;
      image = null;
      video = null;
      fades = [];
      cleanups = [];
      lastUrl = null;
      /**
       * 挂载主题层并订阅设置/壁纸变化。
       * @returns 卸载函数（插件停用时调用）。
       */
      start() {
        this.buildDom();
        this.cleanups.push(this.settings.subscribe(() => this.applySettings()));
        this.cleanups.push(this.wallpaper.subscribe(() => this.applyWallpaper(this.wallpaper.getSnapshot())));
        this.cleanups.push(startSeamStamper());
        this.cleanups.push(startSpotlight());
        this.cleanups.push(startOverlayScrollbar());
        this.cleanups.push(startWordmarkBadge());
        const themeObserver = new MutationObserver(() => {
          this.applySettings();
        });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
        this.cleanups.push(() => {
          themeObserver.disconnect();
        });
        this.applySettings();
        this.applyWallpaper(this.wallpaper.getSnapshot());
        return () => {
          for (const dispose of this.cleanups) {
            try {
              dispose();
            } catch {
            }
          }
          this.cleanups = [];
          this.teardown();
        };
      }
      /** 背景层与上下渐变带。 */
      buildDom() {
        const background = document.createElement("div");
        background.setAttribute("data-glass-bg", "");
        const image = document.createElement("img");
        image.alt = "";
        image.setAttribute("data-glass-image", "");
        const video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute("data-glass-video", "");
        const dim = document.createElement("div");
        dim.setAttribute("data-glass-dim", "");
        background.append(image, video, dim);
        document.body.prepend(background);
        const top = document.createElement("div");
        top.setAttribute("data-glass-fade", "top");
        const bottom = document.createElement("div");
        bottom.setAttribute("data-glass-fade", "bottom");
        document.body.append(top, bottom);
        this.background = background;
        this.image = image;
        this.video = video;
        this.fades = [top, bottom];
        document.documentElement.setAttribute("data-glass", "");
      }
      /** 把设置写成 CSS 变量与 html 属性。 */
      applySettings() {
        const s = this.settings.getSnapshot();
        const root = document.documentElement;
        const style = root.style;
        const dark = document.body.hasAttribute("data-ds-dark-theme");
        style.setProperty("--glass-accent", s.accent);
        style.setProperty("--glass-accent-ink", inkFor(s.accent));
        style.setProperty("--glass-blur", `${s.blur}px`);
        style.setProperty("--glass-frost", String(Math.min(s.frost / 50, 1.4)));
        style.setProperty("--glass-surface-frost", String(Math.min((s.frost + 20) / 50, 1.4)));
        style.setProperty("--glass-wallpaper-blur", `${s.wallpaperBlur}px`);
        style.setProperty("--glass-wallpaper-frost", String(s.wallpaperFrost / 100));
        style.setProperty("--glass-video-blur", `${s.videoBlur}px`);
        style.setProperty("--glass-video-dim", String((100 - s.videoBrightness) / 100 * 0.65));
        style.setProperty("--glass-brightness-black", String(dark ? Math.max(0, (50 - s.bgBrightness) / 50) : 0));
        style.setProperty("--glass-brightness-white", String(dark ? 0 : Math.max(0, (s.bgBrightness - 50) / 50)));
        root.toggleAttribute("data-glass-press", s.press);
        root.toggleAttribute("data-glass-spotlight", s.spotlight);
        root.setAttribute("data-glass", "");
      }
      /** 把当前壁纸写进背景层。 */
      applyWallpaper(snapshot) {
        const background = this.background;
        const image = this.image;
        const video = this.video;
        if (background === null || image === null || video === null) return;
        const entry = snapshot.entry;
        if (entry === void 0) return;
        if (entry === null) {
          background.setAttribute("data-media", "none");
          image.removeAttribute("src");
          video.pause();
          video.removeAttribute("src");
          video.load();
          this.lastUrl = null;
          document.documentElement.removeAttribute("data-glass-media");
          return;
        }
        background.setAttribute("data-media", entry.media);
        document.documentElement.setAttribute("data-glass-media", entry.media);
        if (entry.media === "video") {
          image.removeAttribute("src");
          if (this.lastUrl !== entry.url) {
            this.lastUrl = entry.url;
            video.setAttribute("src", entry.url);
            video.load();
          }
          void video.play().catch(() => {
            video.muted = true;
            void video.play().catch(() => void 0);
          });
          return;
        }
        video.pause();
        video.removeAttribute("src");
        video.load();
        if (this.lastUrl !== entry.url) {
          this.lastUrl = entry.url;
          image.setAttribute("src", entry.url);
        }
      }
      /** 移除所有节点与属性。 */
      teardown() {
        this.background?.remove();
        for (const fade of this.fades) fade.remove();
        this.background = null;
        this.image = null;
        this.video = null;
        this.fades = [];
        const root = document.documentElement;
        root.removeAttribute("data-glass");
        root.removeAttribute("data-glass-media");
        root.removeAttribute("data-glass-press");
        root.removeAttribute("data-glass-spotlight");
        for (const name of [
          "--glass-accent",
          "--glass-accent-ink",
          "--glass-blur",
          "--glass-frost",
          "--glass-surface-frost",
          "--glass-wallpaper-blur",
          "--glass-wallpaper-frost",
          "--glass-video-blur",
          "--glass-video-dim",
          "--glass-brightness-black",
          "--glass-brightness-white"
        ]) {
          root.style.removeProperty(name);
        }
      }
    };

    // src/client/ui/SettingsPage.tsx
    var import_react2 = require("react");

    // src/client/ui/controls.tsx
    var import_react = require("react");
    var import_jsx_runtime = require("react/jsx-runtime");
    function Slider(props) {
      const { title, desc, value, min, max, unit, onChange, valueAria, increaseAria, decreaseAria } = props;
      const [draft, setDraft] = (0, import_react.useState)(String(value));
      (0, import_react.useEffect)(() => {
        setDraft(String(value));
      }, [value]);
      const percent = max === min ? 0 : (value - min) / (max - min) * 100;
      const commit = (raw) => {
        const next = Number(raw);
        if (!Number.isFinite(next)) return;
        onChange(Math.min(max, Math.max(min, Math.round(next))));
      };
      const step = (delta) => {
        const next = Math.min(max, Math.max(min, value + delta));
        setDraft(String(next));
        onChange(next);
      };
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gx-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gx-row-text", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gx-row-title", children: title }),
          desc !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gx-row-desc", children: desc })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gx-control", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "gx-range",
              type: "range",
              min,
              max,
              value,
              style: { ["--gx-fill"]: `${percent}%` },
              "aria-label": title,
              onChange: (event) => onChange(Number(event.target.value))
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gx-num", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gx-stepper", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "number",
                  min,
                  max,
                  value: draft,
                  "aria-label": `${title}${valueAria ?? ""}`,
                  onChange: (event) => {
                    setDraft(event.target.value);
                    commit(event.target.value);
                  },
                  onBlur: () => {
                    if (!Number.isFinite(Number(draft))) setDraft(String(value));
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gx-stepper-arrows", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": `${increaseAria ?? "Increase"} ${title}`, disabled: value >= max, onClick: () => step(1), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { "aria-hidden": "true", viewBox: "0 0 16 16", width: "6", height: "6", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10", fill: "none", stroke: "currentColor", strokeWidth: "1" }) }) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": `${decreaseAria ?? "Decrease"} ${title}`, disabled: value <= min, onClick: () => step(-1), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { "aria-hidden": "true", viewBox: "0 0 16 16", width: "6", height: "6", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6", fill: "none", stroke: "currentColor", strokeWidth: "1" }) }) })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gx-unit", children: unit })
          ] })
        ] })
      ] });
    }
    function Switch(props) {
      const { title, desc, checked, onChange } = props;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gx-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gx-row-text", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gx-row-title", children: title }),
          desc !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gx-row-desc", children: desc })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gx-control", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "gx-switch",
            role: "switch",
            "aria-checked": checked,
            "aria-label": title,
            onClick: () => onChange(!checked)
          }
        ) })
      ] });
    }
    function AccentPicker(props) {
      const { value, onChange, title, desc, customTitle } = props;
      const colors = ["#F077AF", "#E5484D", "#F08A3C", "#1FA6B8", "#4D7CFE", "#8B6CF0", "#1F2329", "#FFFFFF"];
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gx-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gx-row-text", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gx-row-title", children: title }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gx-row-desc", children: desc })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gx-control", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gx-swatches", children: colors.map((color) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: `gx-sw${color === "#FFFFFF" ? " white" : ""}${value.toUpperCase() === color ? " on" : ""}`,
              style: { ["--gx-c"]: color },
              "aria-label": color,
              onClick: () => onChange(color)
            },
            color
          )) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "gx-custom", title: customTitle, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "color", value: /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#F077AF", onChange: (event) => onChange(event.target.value.toUpperCase()) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gx-hex", children: value.toUpperCase() })
        ] })
      ] });
    }

    // src/client/toast-core.js
    (function() {
      if (window.__dshSettingsToastV1) return;
      const queue = [], canceled = /* @__PURE__ */ new WeakSet();
      let current = null, node = null, timer = null, keyListener = null, priorFocus = null;
      function close(result) {
        const item = current;
        current = null;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (keyListener) {
          document.removeEventListener("keydown", keyListener, true);
          keyListener = null;
        }
        if (node) {
          node.remove();
          node = null;
        }
        if (priorFocus && priorFocus.isConnected && typeof priorFocus.focus === "function") priorFocus.focus();
        priorFocus = null;
        if (item && item.resolve) item.resolve(result === true);
        render();
      }
      function render() {
        if (current || queue.length === 0 || !document.body) return;
        const item = queue.shift();
        if (canceled.has(item.owner)) {
          if (item.resolve) item.resolve(false);
          render();
          return;
        }
        current = item;
        node = document.createElement("div");
        node.dataset.dshSettingsToast = "";
        node.setAttribute("role", item.kind === "confirm" ? "alertdialog" : "alert");
        node.setAttribute("aria-label", item.text);
        node.style.cssText = "position:fixed;top:40px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;pointer-events:none;max-width:min(640px,calc(100vw - 48px));padding:12px 16px;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-toast-bg,#303134);color:var(--dsw-alias-toast-label,#fff);font:14px/22px var(--dsw-font-family, sans-serif);box-shadow:0 6px 22px #0003;overflow-wrap:anywhere;";
        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        if (item.kind === "success") {
          icon.style.cssText = "display:grid;place-items:center;flex:none;color:var(--dsw-alias-state-success-primary,#00d765)";
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          for (const [name, value] of [["width", "16"], ["height", "16"], ["viewBox", "0 0 16 16"], ["fill", "none"], ["stroke-width", "1"]]) svg.setAttribute(name, value);
          for (const d of ["M12.5303 6.53027L8.80273 10.2578C8.54967 10.5109 8.31796 10.7439 8.10645 10.9141C7.88375 11.0932 7.616 11.2602 7.27344 11.3145C7.09229 11.3431 6.90771 11.3431 6.72656 11.3145C6.384 11.2602 6.11625 11.0932 5.89355 10.9141C5.68204 10.7439 5.45033 10.5109 5.19727 10.2578L3.46973 8.53027L4.53027 7.46973L6.25781 9.19727C6.53457 9.47402 6.70036 9.63859 6.83398 9.74609C6.95637 9.84453 6.98241 9.83644 6.96094 9.83301C6.98679 9.83709 7.01321 9.83709 7.03906 9.83301C7.01759 9.83644 7.04363 9.84453 7.16602 9.74609C7.29964 9.63859 7.46543 9.47402 7.74219 9.19727L11.4697 5.46973L12.5303 6.53027Z", "M14.5996 8C14.5996 4.35492 11.6451 1.40039 8 1.40039C4.35492 1.40039 1.40039 4.35492 1.40039 8C1.40039 11.6451 4.35492 14.5996 8 14.5996C11.6451 14.5996 14.5996 11.6451 14.5996 8ZM15.9004 8C15.9004 12.363 12.363 15.9004 8 15.9004C3.63695 15.9004 0.0996094 12.363 0.0996094 8C0.0996094 3.63695 3.63695 0.0996094 8 0.0996094C12.363 0.0996094 15.9004 3.63695 15.9004 8Z"]) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.setAttribute("fill", "currentColor");
            svg.append(path);
          }
          icon.append(svg);
        } else {
          icon.textContent = "!";
          icon.style.cssText = "display:grid;place-items:center;flex:none;width:16px;height:16px;border:1.5px solid currentColor;border-radius:50%;font-size:11px;line-height:1;color:" + (item.kind === "error" ? "#ff9587" : "#ffca7a");
        }
        const text = document.createElement("span");
        text.textContent = item.text;
        text.style.cssText = "min-width:0;max-height:50vh;overflow:auto;";
        node.append(icon, text);
        if (item.kind === "confirm") {
          for (const [label, answer] of [[item.labels && item.labels[0] || "确认", "yes"], [item.labels && item.labels[1] || "取消", "no"]]) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.dataset.answer = answer;
            btn.textContent = label;
            btn.style.cssText = "pointer-events:auto;flex:none;border:0;background:none;padding:2px 3px;font:inherit;cursor:pointer;color:var(--glass-accent,var(--dsw-alias-brand-primary,#f077af))";
            btn.addEventListener("click", () => close(answer === "yes"));
            node.append(btn);
          }
          priorFocus = document.activeElement;
          keyListener = (e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close(false);
              return;
            }
            if (e.key !== "Tab") return;
            const buttons = Array.from(node.querySelectorAll("button"));
            if (!buttons.length) return;
            const index = buttons.indexOf(document.activeElement);
            const next = index < 0 ? e.shiftKey ? buttons.length - 1 : 0 : (index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
            e.preventDefault();
            buttons[next].focus();
          };
          document.addEventListener("keydown", keyListener, true);
        } else timer = setTimeout(() => close(false), item.kind === "error" ? 8e3 : 4e3);
        document.body.append(node);
        if (item.kind === "confirm") node.querySelector('[data-answer="no"]')?.focus();
      }
      window.__dshSettingsToastV1 = {
        activate(owner) {
          canceled.delete(owner);
        },
        show(owner, kind, text) {
          text = String(text);
          if (canceled.has(owner)) return;
          if (current && current.owner === owner && current.kind === kind && current.text === text || queue.some((item) => item.owner === owner && item.kind === kind && item.text === text)) return;
          queue.push({ owner, kind, text });
          render();
        },
        confirm(owner, text, labels) {
          return new Promise((resolve) => {
            if (canceled.has(owner) || current && current.owner === owner && current.kind === "confirm" || queue.some((item) => item.owner === owner && item.kind === "confirm")) {
              resolve(false);
              return;
            }
            queue.push({ owner, kind: "confirm", text: String(text), labels, resolve });
            render();
          });
        },
        cancel(owner) {
          canceled.add(owner);
          for (let i = queue.length - 1; i >= 0; i--) if (queue[i].owner === owner) {
            const item = queue.splice(i, 1)[0];
            if (item.resolve) item.resolve(false);
          }
          if (current && current.owner === owner) close(false);
        }
      };
    })();

    // src/client/ui/SettingsPage.tsx
    var import_jsx_runtime2 = require("react/jsx-runtime");
    function useDarkScheme() {
      const [dark, setDark] = (0, import_react2.useState)(() => document.body.hasAttribute("data-ds-dark-theme"));
      (0, import_react2.useEffect)(() => {
        const observer = new MutationObserver(() => setDark(document.body.hasAttribute("data-ds-dark-theme")));
        observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
        return () => observer.disconnect();
      }, []);
      return dark;
    }
    function SettingsPage(props) {
      const { settings, wallpaper, t } = props;
      const s = (0, import_react2.useSyncExternalStore)(settings.subscribe, settings.getSnapshot);
      const w = (0, import_react2.useSyncExternalStore)(wallpaper.subscribe, wallpaper.getSnapshot);
      const dark = useDarkScheme();
      const imageInput = (0, import_react2.useRef)(null);
      const videoInput = (0, import_react2.useRef)(null);
      const owner = (0, import_react2.useRef)({}).current;
      const toast = window.__dshSettingsToastV1;
      (0, import_react2.useEffect)(() => {
        toast.activate(owner);
        return () => toast.cancel(owner);
      }, [owner, toast]);
      (0, import_react2.useEffect)(() => {
        void wallpaper.refresh().then(() => {
          const error = wallpaper.getSnapshot().error;
          if (error !== null) toast.show(owner, "error", error);
        });
      }, [wallpaper, owner, toast]);
      const entry = w.entry;
      const media = entry?.media;
      const brightnessMin = dark ? 0 : 50;
      const brightnessMax = dark ? 50 : 100;
      const brightness = Math.min(brightnessMax, Math.max(brightnessMin, s.bgBrightness));
      const sliderAria = { valueAria: t("numValue"), increaseAria: t("increase"), decreaseAria: t("decrease") };
      const update = (patch) => {
        if (!settings.update(patch)) toast.show(owner, "error", t("toastSaveFail"));
      };
      const pick = (input) => input?.click();
      const onFile = (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file !== void 0) void wallpaper.upload(file).then((success) => {
          if (success) toast.show(owner, "success", t("toastWallpaperUpdated"));
          else {
            const error = wallpaper.getSnapshot().error;
            if (error !== null) toast.show(owner, "error", error);
          }
        });
      };
      const remove = async () => {
        if (entry === null || entry === void 0) return;
        if (!await toast.confirm(owner, t("confirmDeleteWallpaper"), [t("confirm"), t("cancel")])) return;
        const success = await wallpaper.remove();
        if (success) toast.show(owner, "success", t("toastWallpaperDeleted"));
        else {
          const error = wallpaper.getSnapshot().error;
          if (error !== null) toast.show(owner, "error", error);
        }
      };
      const reset = async () => {
        if (!await toast.confirm(owner, t("confirmReset"), [t("confirm"), t("cancel")])) return;
        if (settings.reset()) toast.show(owner, "success", t("toastResetDone"));
        else toast.show(owner, "error", t("toastSaveFail"));
      };
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "gx-page", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: "gx-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h1", { className: "gx-title", children: t("label") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "gx-btn", onClick: () => void reset(), children: t("reset") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "gx-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: "gx-card-title", children: t("sectionTheme") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            AccentPicker,
            {
              value: s.accent,
              onChange: (accent) => update({ accent }),
              title: t("accentTitle"),
              desc: t("accentDesc"),
              customTitle: t("accentCustom")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            Slider,
            {
              title: t("blurTitle"),
              desc: t("blurDesc"),
              value: s.blur,
              min: 0,
              max: 40,
              unit: "px",
              onChange: (blur) => update({ blur }),
              ...sliderAria
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            Slider,
            {
              title: t("frostTitle"),
              desc: t("frostDesc"),
              value: s.frost,
              min: 0,
              max: 100,
              unit: "%",
              onChange: (frost) => update({ frost }),
              ...sliderAria
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "gx-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: "gx-card-title", children: t("sectionBg") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "gx-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "gx-row-text", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "gx-row-title", children: t("wallpaper") }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "gx-control gx-wallpaper", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "gx-btn", onClick: () => void wallpaper.reveal().then((success) => {
                if (success) toast.show(owner, "success", t("toastFolderOpened"));
                else {
                  const error = wallpaper.getSnapshot().error;
                  if (error !== null) toast.show(owner, "error", error);
                }
              }), children: t("openFolder") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "gx-thumb", children: media === "image" && entry !== null && entry !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { src: entry.url, alt: "" }) : media === "video" && entry !== null && entry !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("video", { src: entry.url, muted: true, loop: true, autoPlay: true, playsInline: true }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "gx-thumb-empty", children: t("noWallpaper") }) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "gx-btn", disabled: w.busy, onClick: () => pick(imageInput.current), children: t("pickImage") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "gx-btn", disabled: w.busy, onClick: () => pick(videoInput.current), children: t("pickVideo") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "gx-btn danger", disabled: w.busy || entry === null || entry === void 0, onClick: () => void remove(), children: t("delete") })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { ref: imageInput, type: "file", accept: "image/*,.avif", hidden: true, onChange: onFile }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { ref: videoInput, type: "file", accept: "video/*", hidden: true, onChange: onFile }),
          media !== "video" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              Slider,
              {
                title: t("wallpaperBlurTitle"),
                desc: t("wallpaperBlurDesc"),
                value: s.wallpaperBlur,
                min: 0,
                max: 40,
                unit: "px",
                onChange: (wallpaperBlur) => update({ wallpaperBlur }),
                ...sliderAria
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              Slider,
              {
                title: t("wallpaperFrostTitle"),
                desc: t("wallpaperFrostDesc"),
                value: s.wallpaperFrost,
                min: 0,
                max: 100,
                unit: "%",
                onChange: (wallpaperFrost) => update({ wallpaperFrost }),
                ...sliderAria
              }
            )
          ] }),
          media === "video" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              Slider,
              {
                title: t("videoBlurTitle"),
                desc: t("videoBlurDesc"),
                value: s.videoBlur,
                min: 0,
                max: 40,
                unit: "px",
                onChange: (videoBlur) => update({ videoBlur }),
                ...sliderAria
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              Slider,
              {
                title: t("videoBrightnessTitle"),
                desc: t("videoBrightnessDesc"),
                value: s.videoBrightness,
                min: 0,
                max: 100,
                unit: "%",
                onChange: (videoBrightness) => update({ videoBrightness }),
                ...sliderAria
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            Slider,
            {
              title: t("bgBrightnessTitle"),
              desc: dark ? t("bgBrightnessDescDark") : t("bgBrightnessDescLight"),
              value: brightness,
              min: brightnessMin,
              max: brightnessMax,
              unit: "%",
              onChange: (value) => update({ bgBrightness: value }),
              ...sliderAria
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "gx-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: "gx-card-title", children: t("sectionEffects") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            Switch,
            {
              title: t("pressTitle"),
              desc: t("pressDesc"),
              checked: s.press,
              onChange: (press) => update({ press })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            Switch,
            {
              title: t("spotlightTitle"),
              desc: t("spotlightDesc"),
              checked: s.spotlight,
              onChange: (spotlight) => update({ spotlight })
            }
          )
        ] })
      ] });
    }

    // src/client/index.tsx
    var import_jsx_runtime3 = require("react/jsx-runtime");
    var NS = "glass-theme";
    var DICTS = {
      zh: {
        label: "玻璃主题",
        reset: "恢复默认",
        sectionTheme: "主题",
        sectionBg: "背景",
        sectionEffects: "特效",
        accentTitle: "重点色",
        accentDesc: "按钮、开关、滑杆与辉光共用",
        accentCustom: "自定义颜色",
        blurTitle: "玻璃模糊度",
        blurDesc: "玻璃卡片背后内容的模糊半径",
        frostTitle: "磨砂度",
        frostDesc: "玻璃上的雾面遮罩浓度，越高越不透明",
        wallpaper: "壁纸",
        openFolder: "打开文件夹",
        pickImage: "选择图片",
        pickVideo: "选择视频",
        delete: "删除",
        noWallpaper: "无壁纸",
        wallpaperBlurTitle: "壁纸模糊度",
        wallpaperBlurDesc: "壁纸本身的模糊半径",
        wallpaperFrostTitle: "壁纸磨砂度",
        wallpaperFrostDesc: "软雾遮罩，只加雾提对比",
        videoBlurTitle: "视频模糊度",
        videoBlurDesc: "视频画面的模糊半径",
        videoBrightnessTitle: "视频亮度",
        videoBrightnessDesc: "视频专用额外压暗雾；发亮/压黑请用「背景亮度」的白/黑膜",
        bgBrightnessTitle: "背景亮度",
        bgBrightnessDescDark: "黑膜压暗：50 原样，0 近黑",
        bgBrightnessDescLight: "白膜提亮：50 原样，100 近白",
        pressTitle: "悬停上浮",
        pressDesc: "鼠标悬停时玻璃卡片轻微上浮",
        spotlightTitle: "鼠标辉光",
        spotlightDesc: "跟随光标的柔光，颜色跟重点色走",
        toastSaveFail: "无法保存设置，重启后可能失效",
        toastWallpaperUpdated: "壁纸已更新",
        toastWallpaperDeleted: "壁纸已删除",
        toastFolderOpened: "已打开壁纸文件夹",
        toastResetDone: "已恢复默认设置",
        confirmDeleteWallpaper: "删除当前壁纸？文件会从壁纸文件夹移除。",
        confirmReset: "恢复主题默认设置？当前壁纸不会删除。",
        confirm: "确认",
        cancel: "取消",
        numValue: "（数值）",
        increase: "增加",
        decrease: "减少",
        scrollContent: "滚动内容"
      },
      en: {
        label: "Glass Theme",
        reset: "Restore defaults",
        sectionTheme: "Theme",
        sectionBg: "Background",
        sectionEffects: "Effects",
        accentTitle: "Accent colour",
        accentDesc: "Shared by buttons, switches, sliders and the cursor glow",
        accentCustom: "Custom colour",
        blurTitle: "Glass blur",
        blurDesc: "Blur radius behind frosted glass cards",
        frostTitle: "Frost",
        frostDesc: "Fog opacity on glass; higher is more opaque",
        wallpaper: "Wallpaper",
        openFolder: "Open folder",
        pickImage: "Choose image",
        pickVideo: "Choose video",
        delete: "Delete",
        noWallpaper: "No wallpaper",
        wallpaperBlurTitle: "Wallpaper blur",
        wallpaperBlurDesc: "Blur radius applied to the wallpaper itself",
        wallpaperFrostTitle: "Wallpaper frost",
        wallpaperFrostDesc: "Soft fog overlay for contrast",
        videoBlurTitle: "Video blur",
        videoBlurDesc: "Blur radius on the video frame",
        videoBrightnessTitle: "Video brightness",
        videoBrightnessDesc: "Extra dimming fog for video; use Background brightness for white/black films",
        bgBrightnessTitle: "Background brightness",
        bgBrightnessDescDark: "Black film: 50 is neutral, 0 is near black",
        bgBrightnessDescLight: "White film: 50 is neutral, 100 is near white",
        pressTitle: "Hover lift",
        pressDesc: "Glass cards rise slightly on hover",
        spotlightTitle: "Cursor glow",
        spotlightDesc: "Soft glow that follows the cursor, tinted by the accent",
        toastSaveFail: "Could not save settings; they may reset after restart",
        toastWallpaperUpdated: "Wallpaper updated",
        toastWallpaperDeleted: "Wallpaper deleted",
        toastFolderOpened: "Opened wallpaper folder",
        toastResetDone: "Defaults restored",
        confirmDeleteWallpaper: "Delete the current wallpaper? The file will be removed from the wallpaper folder.",
        confirmReset: "Restore theme defaults? The current wallpaper will be kept.",
        confirm: "Confirm",
        cancel: "Cancel",
        numValue: " value",
        increase: "Increase",
        decrease: "Decrease",
        scrollContent: "Scroll content"
      }
    };
    var plugin = {
      name: "glass-theme",
      inject: ["slots", "locale"],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), "glass-theme: dictionaries");
        ctx.effect(() => {
          const style = document.createElement("style");
          style.setAttribute("data-plugin", "dsh-glass-theme");
          style.textContent = `${theme_default}
    ${settings_default}`;
          document.head.appendChild(style);
          return () => style.remove();
        }, "glass-theme: styles");
        const initial = loadInitialSettings();
        const settings = new SettingsStore(initial.settings);
        const wallpaper = new WallpaperStore();
        const layer = new GlassLayer(settings, wallpaper);
        ctx.effect(() => {
          const dispose = layer.start();
          void (async () => {
            await wallpaper.refresh();
            const current = wallpaper.getSnapshot().entry;
            const canImport = initial.legacyWallpaper !== null && (current === null || current === void 0 || current.isDefault);
            if (canImport && initial.legacyWallpaper !== null) {
              const imported = await wallpaper.importLegacy(initial.legacyWallpaper);
              if (imported) markLegacyWallpaperMigrated();
            }
          })();
          return dispose;
        }, "glass-theme: layer");
        ctx.inject(["slots", "locale"], (scope) => {
          const slots = scope.get("slots");
          const locale = scope.get("locale") ?? ctx.locale;
          if (!slots || !locale) return;
          const t = locale.bind(NS);
          scope.effect(() => slots.inject("settings.section", () => slots.register(
            { name: "settings.section", id: "glass-theme", order: 22, label: () => t("label"), locale: NS },
            () => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SettingsPage, { settings, wallpaper, t })
          )));
        });
      }
    };
    var index_default = plugin;

    return module.exports.default ?? module.exports;
  },
});
