/* DSH启动动画 · 注入侧引导层
 *
 * 职责（就这四件，别的一概不做）：
 *   1. 在 DSH 页面里建一个 Shadow DOM 覆盖层，把参考动画引擎按「原生模式」跑起来；
 *   2. 提供作用域化的 window/document 适配器，让引擎只碰覆盖层内部，绝不碰 DSH 自己的节点；
 *   3. 观察 DSH 界面是否真的就绪（开机卡片消失 / 应用挂载完成），就绪了才放行揭幕；
 *   4. 揭幕或跳过之后把自己整套卸干净：删覆盖层、摘掉转发出去的监听、清掉定时器。
 *
 * 本文件在构建时被拼进注入行，作用域内有：
 *   BOOT                    —— 宿主写入的整包数据（css / markup / assets / contours / gate / settings …）
 *   __DSH_LAUNCH_ENGINE__   —— 参考动画引擎（已改成局部常量，不污染页面全局）
 *
 * 黑匣子：每个关键节点往 window.__DSH_LAUNCH_ANIMATION_TRACE__ 里写一条记录，
 * 客户端半边会把它连同页面实况回报给宿主落盘（$DSH_HOME/launch-animation/diagnostics.json（默认 ~/.dsh/launch-animation/diagnostics.json））。
 * 2026-10-08 就是靠这套东西定位「注入行没生效」这类只能在真实页面里看到的问题。
 */
(function () {
  'use strict';

  // ---- 黑匣子：尽可能早地开始记，连「BOOT 缺失」这种事也要留痕 ----
  const trace = (window.__DSH_LAUNCH_ANIMATION_TRACE__ = window.__DSH_LAUNCH_ANIMATION_TRACE__ || []);
  const note = (event, extra) => {
    try { trace.push(Object.assign({ t: Date.now(), event }, extra || {})); } catch (_) {}
  };
  const domFacts = () => {
    let rootKids = -1;
    try {
      const rootEl = document.getElementById('root');
      rootKids = rootEl ? rootEl.childElementCount : -1;
    } catch (_) {}
    return { bootCard: Boolean(document.querySelector('[data-dsh-boot]')), rootKids, readyState: document.readyState };
  };
  note('script-start', domFacts());

  if (!BOOT || typeof BOOT !== 'object') { note('abort:no-boot'); return; }
  if (window.__DSH_LAUNCH_ANIMATION_ACTIVE__ === true) { note('abort:already-active'); return; }
  window.__DSH_LAUNCH_ANIMATION_ACTIVE__ = true;

  // 宿主半边每次注入都会带一份运行时覆盖（开关档位、身份图），在这里并进 BOOT
  try {
    const override = globalThis.__DSH_LAUNCH_OVERRIDE__;
    if (override && typeof override === 'object') {
      note('override', { settings: override.settings, hasAvatar: typeof override.avatar === 'string' });
      if (override.settings && typeof override.settings === 'object') {
        BOOT.settings = Object.assign({}, BOOT.settings, override.settings);
      }
      if (typeof override.avatar === 'string' && override.avatar !== '') {
        BOOT.assets = Object.assign({}, BOOT.assets, { avatar: override.avatar });
      }
    }
    delete globalThis.__DSH_LAUNCH_OVERRIDE__;
  } catch (_) {}

  const debug = BOOT.debug === true;
  const preview = BOOT.preview === true;
  const settings = BOOT.settings || {};
  const log = (...args) => { if (debug) { try { console.log('[dsh-launch-animation]', ...args); } catch (_) {} } };

  const realDoc = document;
  const host = realDoc.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = realDoc.createElement('style');
  const body = realDoc.createElement('div');

  // 深浅主题：DSH 的主题插件把结果打在真实 <html>/<body> 上；Shadow DOM 里选不到祖先属性，
  // 所以这里读一次映射成宿主 class，让标题栏那一条的底色跟着主题走。
  function isDark() {
    try {
      if (realDoc.body && realDoc.body.hasAttribute('data-ds-dark-theme')) return true;
      const src = realDoc.documentElement ? realDoc.documentElement.dataset.dsThemeSource : '';
      if (src === 'dark') return true;
      if (src === 'light') return false;
      return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (_) { return true; }
  }

  host.id = 'dsh-launch-animation';
  host.className = 'dslan-host ' + (isDark() ? 'dslan-dark' : 'dslan-light');
  host.setAttribute('data-dsh-launch-animation', '');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block;margin:0;padding:0;border:0;background:transparent;';

  body.className = 'dslan-body' + (preview ? '' : ' embedded');
  if (settings.showSkipHint === false) body.classList.add('dslan-no-skip');
  style.textContent = BOOT.css;
  body.innerHTML = BOOT.markup;
  shadow.appendChild(style);
  shadow.appendChild(body);

  // ---- 作用域化适配器：引擎眼里这就是它的 window/document ----
  const forwarded = [];
  function forward(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    forwarded.push([target, type, fn, opts]);
  }

  const docEl = {
    style: host.style,
    dataset: host.dataset,
    classList: host.classList,
    setAttribute: (k, v) => host.setAttribute(k, v),
    removeAttribute: (k) => host.removeAttribute(k),
    getAttribute: (k) => host.getAttribute(k)
  };

  const scopedDoc = {
    get body() { return body; },
    get documentElement() { return docEl; },
    get hidden() { return realDoc.hidden; },
    get visibilityState() { return realDoc.visibilityState; },
    createElement: (tag) => realDoc.createElement(tag),
    createElementNS: (ns, tag) => realDoc.createElementNS(ns, tag),
    querySelector: (sel) => shadow.querySelector(sel),
    querySelectorAll: (sel) => shadow.querySelectorAll(sel),
    getElementById: (id) => shadow.getElementById(id),
    addEventListener: (type, fn, opts) => forward(realDoc, type, fn, opts),
    removeEventListener: (type, fn, opts) => realDoc.removeEventListener(type, fn, opts)
  };

  // 简版档位走引擎自己的 fast 模式（4 秒）；完整档 14.5 秒。
  // 预览页不挂 native（要的就是参考实现那套画面），插件里挂 native（要那套揭幕挤压效果）。
  const params = [];
  if (settings.native !== false) params.push('native=1');
  if (settings.mode === 'fast') params.push('mode=fast');
  const search = params.length ? '?' + params.join('&') : '';

  const scopedWin = {
    location: { search, href: window.location.href, hash: '', pathname: '/' },
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    performance: window.performance,
    getComputedStyle: window.getComputedStyle.bind(window),
    matchMedia: window.matchMedia.bind(window),
    Path2D: window.Path2D,
    addEventListener: (type, fn, opts) => forward(window, type, fn, opts),
    removeEventListener: (type, fn, opts) => window.removeEventListener(type, fn, opts),
    CONTOUR_PATHS: BOOT.contours,
    AEMEATH_ASSETS: BOOT.assets,
    LAUNCHER_CONFIG: BOOT.config,
    LAUNCHER_DURATION_FOR_MODE: BOOT.durationForMode
  };
  scopedWin.window = scopedWin;
  scopedWin.self = scopedWin;
  scopedWin.top = scopedWin;
  scopedWin.parent = scopedWin; // parent === window ⇒ 引擎判定「非嵌入」，由我们手动挂 embedded 样式
  scopedWin.document = scopedDoc;

  // ---- 门控状态：DSH 界面就绪前，动画钉在等待屏不动 ----
  const gate = BOOT.gate || { timeoutMs: 25000, pollMs: 100 };
  const state = { progress: 0, phase: 'injecting' };

  let controls = null, poll = 0, guard = 0, hardGuard = 0, observer = null, finished = false
  let captionStyle = null;

  /**
   * 开机卡片还在不在 —— 只认「在不在 DOM 里」。
   *
   * ⚠️ 2026-10-08 踩过的坑：这里原本用 getClientRects().length === 0 判断「卡片已经消失」，
   * 结果真实应用里卡片可能因为样式还没套上/被 CSS 先藏着而没有尺寸，
   * 于是被误判成「界面早就挂载好了」→ 静默跳过整段动画（不报错、不崩溃、什么都没显示）。
   * 现在一律按存在性判断；「就绪」只看卡片是否真的被移除。
   */
  function bootCard() { return realDoc.querySelector('[data-dsh-boot]'); }

  function uiReadyReason() {
    if (bootCard()) return null; // 卡片还在 = 还没就绪
    const rootEl = realDoc.getElementById('root');
    if (rootEl && rootEl.childElementCount > 0) return 'app-mounted';
    return 'boot-card-gone';
  }

  function markReady(reason) {
    if (state.phase === 'ready') return;
    state.progress = 1;
    state.phase = 'ready';
    note('ui-ready', { reason });
    log('DSH 界面就绪 → 放行揭幕：', reason);
  }

  function cleanup(reason) {
    if (finished) return;
    finished = true;
    note('cleanup', { reason, ms: Date.now() - trace[0].t });
    try { if (controls && typeof controls.destroy === 'function') controls.destroy(); } catch (_) {}
    if (poll) { clearInterval(poll); poll = 0; }
    if (guard) { clearTimeout(guard); guard = 0; } if (hardGuard) { clearTimeout(hardGuard); hardGuard = 0; }
    if (observer) { try { observer.disconnect(); } catch (_) {} observer = null; }
    for (const [target, type, fn, opts] of forwarded) {
      try { target.removeEventListener(type, fn, opts); } catch (_) {}
    }
    forwarded.length = 0;
    restoreCaption();
    try { host.remove(); } catch (_) {}
    try { realDoc.documentElement.removeAttribute('data-dslan'); } catch (_) {}
    window.__DSH_LAUNCH_ANIMATION_ACTIVE__ = false;
    log('覆盖层已卸载：', reason);
  }

  /**
   * 顶部那条原生标题栏（Windows 的 titleBarOverlay，40px，最小化/最大化/关闭所在层）是外壳/系统
   * 画在网页内容之上的 —— 页面里任何元素都盖不住它（2026-10-08 实测确认）。
   *
   * 唯一能做的是「跟着变形」：外壳的 preload 会读页面里一个隐藏探针元素的
   *   span[style*="--dsw-specific-sidebar-fill"]
   * 的这两个 CSS 变量，再 setTitleBarOverlay() 画上去；而它会在 <head> 样式变动时重新读取。
   * 所以这里只针对那一个探针元素临时改色（完全不动应用自己的配色）：
   *   match       → 动画顶部的实际颜色，视觉上等于「标题栏被动画盖住」
   *   transparent → 透明，若系统认透明度，动画就真的从那条里透上来
   *   off         → 不碰
   * 动画结束（或跳过）时移除这段样式，标题栏自动回到应用原色。
   */
  // match：跟动画顶色（深浅主题各一套），不再写死深色
  const CAPTION_COLOR = {
    matchDark: 'rgb(23, 21, 31)',
    matchLight: 'rgb(245, 246, 247)',
    transparent: 'transparent',
  }
  const CAPTION_SYMBOL = {
    dark: 'rgb(242, 237, 245)',
    light: 'rgb(55, 53, 62)',
  }
  let captionColor = null
  let captionSymbol = null
  let captionMode = null
  let captionTimer = 0

  function captionFillFor(mode) {
    if (mode === 'transparent') return CAPTION_COLOR.transparent
    if (mode === 'match') return isDark() ? CAPTION_COLOR.matchDark : CAPTION_COLOR.matchLight
    return null
  }
  function captionSymbolFor(mode) {
    if (mode === 'transparent' || mode === 'match') return isDark() ? CAPTION_SYMBOL.dark : CAPTION_SYMBOL.light
    return CAPTION_SYMBOL.dark
  }

  function nudgeCaption() {
    try {
      realDoc.body.style.setProperty('--dslan-caption', '1')
      realDoc.body.style.removeProperty('--dslan-caption')
    } catch (_) {}
  }

  function captionProbe() {
    try { return realDoc.querySelector('span[style*="--dsw-specific-sidebar-fill"]'); } catch (_) { return null; }
  }

  /**
   * 把颜色直接写进探针的**行内样式**。
   *
   * 2026-10-08 实测：只往 <head> 里插样式表时，真机上标题栏没有吃到插件写的颜色
   * （诊断证明样式确实在页面里、探针也确实存在，而标题栏停在 #F5F6F7 = 应用主题色）。
   * 行内样式 + important 是 CSS 级联里的最高优先级，任何样式表都盖不住，
   * 所以这里双管齐下：样式表 + 行内样式。
   */
  function paintCaptionProbe() {
    const probe = captionProbe()
    if (!probe || !captionColor) return false
    try {
      probe.style.setProperty('--dsw-specific-sidebar-fill', captionColor, 'important')
      probe.style.setProperty('--dsw-alias-label-primary', captionSymbol || CAPTION_SYMBOL.dark, 'important')
      return true
    } catch (_) { return false }
  }

  function applyCaption(mode) {
    if (mode !== 'match' && mode !== 'transparent') return
    captionMode = mode
    captionColor = captionFillFor(mode)
    captionSymbol = captionSymbolFor(mode)
    try {
      captionStyle = realDoc.createElement('style')
      captionStyle.id = 'dsh-launch-animation-caption'
      captionStyle.textContent =
        'span[style*="--dsw-specific-sidebar-fill"]{' +
        '--dsw-specific-sidebar-fill:' + captionColor + ' !important;' +
        '--dsw-alias-label-primary:' + captionSymbol + ' !important;}'
      ;(realDoc.head || realDoc.documentElement).appendChild(captionStyle)
      const painted = paintCaptionProbe()
      nudgeCaption()
      // 探针由外壳 preload 在 DOMContentLoaded 时才创建，可能比我们晚；
      // 而且外壳只在 <head>/<body> 变动时重新取色 —— 所以动画期间小步补刷。
      captionTimer = setInterval(() => { if (paintCaptionProbe()) nudgeCaption() }, 400)
      note('caption-applied', { mode, color: captionColor, inline: painted })
      log('标题栏已随动画变色：', mode, painted ? '（行内已写入）' : '（探针尚未出现，等待重试）')
    } catch (error) {
      note('caption-failed', { message: String((error && error.message) || error) })
    }
  }

  /**
   * 注入表是宿主在 DSH 启动时收集一次的，所以「改模式」原本必须重启才生效。
   * 这里在动画期间顺带问一次宿主路由，若刚改过模式，就地切过来 —— 以后切模式只要刷新页面。
   */
  function refreshCaptionMode() {
    try {
      if (typeof fetch !== 'function') return
      fetch('/api/launch-animation', { headers: { accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          const mode = data && data.settings ? data.settings.captionMode : null
          if (finished || !mode || mode === captionMode) return
          note('caption-mode-refresh', { from: captionMode, to: mode })
          restoreCaption()
          applyCaption(mode)
        })
        .catch(() => {})
    } catch (_) {}
  }
  function restoreCaption() {
    if (captionTimer) { clearInterval(captionTimer); captionTimer = 0 }
    const probe = captionProbe()
    if (probe) {
      try {
        probe.style.removeProperty('--dsw-specific-sidebar-fill')
        probe.style.removeProperty('--dsw-alias-label-primary')
      } catch (_) {}
    }
    if (captionStyle) {
      try { captionStyle.remove(); } catch (_) {}
      captionStyle = null
    }
    captionColor = null
    nudgeCaption()
    note('caption-restored', { probe: Boolean(probe) })
    log('标题栏已还原')
  }
  /**
   * 启动时向宿主取一次自定义素材（换壁纸后的成品图 + 重算好的线稿）。
   * 这样「换图 → 刷新页面」就生效，不必重启 DSH；取不到就用包内默认素材，静默回退。
   * 超时压到 1.2 秒，绝不让开机被拖住。
   */
  async function loadCustomAssets() {
    try {
      if (typeof fetch !== 'function') return null
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = setTimeout(() => { if (controller !== null) controller.abort() }, 1200)
      const response = await fetch('/api/launch-animation/assets', controller !== null ? { signal: controller.signal } : undefined)
      clearTimeout(timer)
      if (!response.ok) return null
      const data = await response.json()
      if (!data || data.custom !== true) return null
      return data
    } catch (_) {
      return null
    }
  }
  function start() {
    if (preview) {
      // 预览页：当成页面里的一张卡片，不铺满视口，也不等 DSH 界面
      host.style.cssText = 'position:relative;display:block;width:100%;margin:0 auto;background:transparent;';
      const stage = realDoc.createElement('div');
      stage.className = 'dslan-preview-stage';
      stage.appendChild(host);
      realDoc.body.appendChild(stage);
      note('mounted', { mode: 'preview' });
    } else {
      // 「注入过晚」只在一种情况下成立：开机卡片真的不在了，而且 #root 里已经有东西 —— 那说明界面已经挂载好，
      // 这时不盖正在使用的界面。（注意：卡片「看不见」不算晚，见 bootCard 的注释。）
      const rootEl = realDoc.getElementById('root');
      if (!bootCard() && rootEl && rootEl.childElementCount > 0) {
        note('skip:injected-late', domFacts());
        log('注入过晚：DSH 界面已就绪，本次不播放');
        finished = true;
        window.__DSH_LAUNCH_ANIMATION_ACTIVE__ = false;
        return;
      }
      const parent = realDoc.documentElement || realDoc.body;
      parent.appendChild(host);
      try { realDoc.documentElement.setAttribute('data-dslan', 'mounted'); } catch (_) {}
      note('mounted', Object.assign({ mode: 'overlay', parent: parent === realDoc.documentElement ? 'html' : 'body' }, domFacts()));
      applyCaption(settings.captionMode);
      refreshCaptionMode();
    }

    try {
      controls = __DSH_LAUNCH_ENGINE__({
        window: scopedWin,
        document: scopedDoc,
        location: scopedWin.location,
        config: BOOT.config,
        durationForMode: BOOT.durationForMode,
        state,
        onEvent: (action, details) => {
          note('engine-event', { action });
          log('动画事件：', action, details || '');
          if (action !== 'complete') return;
          if (preview) {
            // 预览页：揭幕收尾后自动再放一遍，方便反复看
            setTimeout(() => {
              cleanup('preview-loop');
              if (typeof window.__DSH_LAUNCH_PREVIEW_PLAY__ === 'function') {
                setTimeout(() => { try { window.__DSH_LAUNCH_PREVIEW_PLAY__(); } catch (_) {} }, 900);
              }
            }, 400);
            return;
          }
          setTimeout(() => cleanup('complete'), 120);
        }
      });
      note('engine-created');
    } catch (error) {
      // 引擎起不来就立刻放行，绝不把用户关在加载画面前
      note('engine-failed', { message: String((error && error.message) || error) });
      log('动画引擎启动失败：', error && error.message);
      cleanup('engine-failed');
      return;
    }

    // 揭幕阶段（挤压成线）把整层让开，别挡住下面已经就绪的界面
    observer = new MutationObserver(() => {
      const win = shadow.querySelector('.window');
      if (win && win.classList.contains('revealing')) host.style.pointerEvents = 'none';
    });
    observer.observe(shadow, { subtree: true, attributes: true, attributeFilter: ['class'] });

    if (preview) {
      markReady('preview');
    } else {
      poll = setInterval(() => {
        const reason = uiReadyReason();
        if (reason) { markReady(reason); if (poll) { clearInterval(poll); poll = 0; } }
      }, gate.pollMs || 100);
      guard = setTimeout(() => { markReady('timeout'); hardGuard = setTimeout(() => cleanup('timeout-hard'), 3000); }, gate.timeoutMs || 25000); // 到点必须能揭幕：动画被暂停（空格）或引擎卡住时，再宽限 3 秒强制卸载覆盖层，不依赖动画继续跑
    }

    if (debug) {
      window.__DSH_LAUNCH_ANIMATION__ = {
        skip: () => controls && controls.skip(),
        replay: () => controls && controls.replay(),
        ready: (why) => markReady(why || 'manual'),
        cleanup: (why) => cleanup(why || 'manual'),
        state,
        get elapsed() { return controls ? controls.elapsed : null; },
        get playing() { return controls ? controls.playing : null; },
        get completed() { return controls ? controls.completed : null; },
      };
    }

    // 不要壁纸：背景显现程度钉在 0，动画结束后不留常驻背景
    controls.boot({ wallpaperStrength: 0 }).then(() => {
      note('boot-resolved');
    }).catch((error) => {
      note('assets-failed', { message: String((error && error.message) || error) });
      log('素材装载失败：', error && error.message);
      cleanup('assets-failed');
    });
  }

  (async () => {
    // 先问一次宿主有没有自定义素材（换过壁纸的话），取到就替换掉包内默认的成品图与线稿
    const custom = await loadCustomAssets();
    if (custom !== null) {
      const contours = Array.isArray(custom.contours) ? custom.contours : null;
      if (contours !== null && contours.length > 0) scopedWin.CONTOUR_PATHS = contours;
      if (typeof custom.artwork === 'string' && custom.artwork !== '') {
        BOOT.assets = Object.assign({}, BOOT.assets, { artwork: custom.artwork });
        // scopedWin 是模块级对象、握的是「旧的那个 assets 对象」的引用，必须一起换，否则引擎拿到的还是出厂图
        scopedWin.AEMEATH_ASSETS = BOOT.assets;
      }
      note('custom-assets', { paths: contours ? contours.length : 0, points: custom.points || 0 });
      log('已使用自定义素材：', contours ? contours.length : 0, '条线稿');
    }
    try {
      start();
    } catch (error) {
      note('bootstrap-failed', { message: String((error && error.message) || error) });
      log('引导失败：', error && error.message);
      cleanup('bootstrap-failed');
    }
  })();
})();
