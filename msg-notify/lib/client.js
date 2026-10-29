/* 可独立加载；同一窗口所有设置插件共用队列。 */
(function () {
  if (window.__dshSettingsToastV1) return;
  const queue = [], canceled = new WeakSet();
  let current = null, node = null, timer = null, keyListener = null, priorFocus = null;
  function close(result) {
    const item = current; current = null;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (keyListener) { document.removeEventListener('keydown', keyListener, true); keyListener = null; }
    if (node) { node.remove(); node = null; }
    if (priorFocus && priorFocus.isConnected && typeof priorFocus.focus === 'function') priorFocus.focus();
    priorFocus = null;
    if (item && item.resolve) item.resolve(result === true);
    render();
  }
  function render() {
    if (current || queue.length === 0 || !document.body) return;
    const item = queue.shift();
    if (canceled.has(item.owner)) { if (item.resolve) item.resolve(false); render(); return; }
    current = item;
    node = document.createElement('div');
    node.dataset.dshSettingsToast = '';
    node.setAttribute('role', item.kind === 'confirm' ? 'alertdialog' : 'alert');
    node.setAttribute('aria-label', item.text);
    node.style.cssText = 'position:fixed;top:40px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;pointer-events:none;max-width:min(640px,calc(100vw - 48px));padding:12px 16px;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-toast-bg,#303134);color:var(--dsw-alias-toast-label,#fff);font:14px/22px var(--dsw-font-family, sans-serif);box-shadow:0 6px 22px #0003;overflow-wrap:anywhere;';
    const icon = document.createElement('span'); icon.setAttribute('aria-hidden','true');
    if (item.kind === 'success') {
      icon.style.cssText = 'display:grid;place-items:center;flex:none;color:var(--dsw-alias-state-success-primary,#00d765)';
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      for (const [name,value] of [['width','16'],['height','16'],['viewBox','0 0 16 16'],['fill','none'],['stroke-width','1']]) svg.setAttribute(name,value);
      for (const d of ["M12.5303 6.53027L8.80273 10.2578C8.54967 10.5109 8.31796 10.7439 8.10645 10.9141C7.88375 11.0932 7.616 11.2602 7.27344 11.3145C7.09229 11.3431 6.90771 11.3431 6.72656 11.3145C6.384 11.2602 6.11625 11.0932 5.89355 10.9141C5.68204 10.7439 5.45033 10.5109 5.19727 10.2578L3.46973 8.53027L4.53027 7.46973L6.25781 9.19727C6.53457 9.47402 6.70036 9.63859 6.83398 9.74609C6.95637 9.84453 6.98241 9.83644 6.96094 9.83301C6.98679 9.83709 7.01321 9.83709 7.03906 9.83301C7.01759 9.83644 7.04363 9.84453 7.16602 9.74609C7.29964 9.63859 7.46543 9.47402 7.74219 9.19727L11.4697 5.46973L12.5303 6.53027Z","M14.5996 8C14.5996 4.35492 11.6451 1.40039 8 1.40039C4.35492 1.40039 1.40039 4.35492 1.40039 8C1.40039 11.6451 4.35492 14.5996 8 14.5996C11.6451 14.5996 14.5996 11.6451 14.5996 8ZM15.9004 8C15.9004 12.363 12.363 15.9004 8 15.9004C3.63695 15.9004 0.0996094 12.363 0.0996094 8C0.0996094 3.63695 3.63695 0.0996094 8 0.0996094C12.363 0.0996094 15.9004 3.63695 15.9004 8Z"]) { const path = document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',d); path.setAttribute('fill','currentColor'); svg.append(path); }
      icon.append(svg);
    } else {
      icon.textContent = '!';
      icon.style.cssText = 'display:grid;place-items:center;flex:none;width:16px;height:16px;border:1.5px solid currentColor;border-radius:50%;font-size:11px;line-height:1;color:' + (item.kind === 'error' ? '#ff9587' : '#ffca7a');
    }
    const text = document.createElement('span'); text.textContent = item.text; text.style.cssText='min-width:0;max-height:50vh;overflow:auto;'; node.append(icon,text);
    if (item.kind === 'confirm') {
      for (const [label, answer] of [['确认','yes'],['取消','no']]) {
        const btn = document.createElement('button'); btn.type='button'; btn.dataset.answer=answer; btn.textContent=label;
        btn.style.cssText='pointer-events:auto;flex:none;border:0;background:none;padding:2px 3px;font:inherit;cursor:pointer;color:var(--glass-accent,var(--dsw-alias-brand-primary,#f077af))';
        btn.addEventListener('click',()=>close(answer==='yes')); node.append(btn);
      }
      priorFocus = document.activeElement;
      keyListener = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); return; }
        if (e.key !== 'Tab') return;
        const buttons = Array.from(node.querySelectorAll('button'));
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement);
        const next = index < 0 ? (e.shiftKey ? buttons.length - 1 : 0) : (index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        e.preventDefault(); buttons[next].focus();
      };
      document.addEventListener('keydown', keyListener, true);
    } else timer=setTimeout(()=>close(false),item.kind==='error'?8000:4000);
    document.body.append(node); if(item.kind==='confirm') node.querySelector('[data-answer="no"]')?.focus();
  }
  window.__dshSettingsToastV1 = {
    activate(owner){canceled.delete(owner);},
    show(owner,kind,text){
      text=String(text);
      if(canceled.has(owner)) return;
      if((current && current.owner===owner && current.kind===kind && current.text===text) || queue.some(item=>item.owner===owner && item.kind===kind && item.text===text)) return;
      queue.push({owner,kind,text}); render();
    },
    confirm(owner,text){return new Promise(resolve=>{if(canceled.has(owner) || (current && current.owner===owner && current.kind==='confirm') || queue.some(item=>item.owner===owner && item.kind==='confirm')){resolve(false);return;}queue.push({owner,kind:'confirm',text:String(text),resolve});render();});},
    cancel(owner){canceled.add(owner);for(let i=queue.length-1;i>=0;i--)if(queue[i].owner===owner){const item=queue.splice(i,1)[0];if(item.resolve)item.resolve(false);}if(current && current.owner===owner)close(false);}
  };
})();

// dsh-msg-notify — Client half (browser bundle).
//
// 手写在 harness module-loader 格式里：`require` 只回答平台外部依赖（react），
// 其余全部内联。设置页 UI、试听、会话检测与重复计时均已接入。
//
// 设计约定（改动前请先读）：
//   1. 颜色一律走主题变量（--dsw-alias-*），不写死色值，明暗两套主题都成立。
//   2. 页面结构对齐其他插件：页头 + 分组卡片 + 选项说明。
//   3. 试听时按钮里随声音跳动的三根竖条是唯一动效记忆点。
window.__ModuleLoader__.load({
  id: 'dsh-msg-notify',
  factory: (require) => {
    const react = require('react');
    const h = react.createElement;
    // 优先使用 DSH 官方菜单；宿主未提供时仍可用原生下拉框。
    let OfficialMenu = null;
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
      if (typeof primitives.Menu === 'function') OfficialMenu = primitives.Menu;
    } catch (e) { /* 旧宿主缺组件时回退 */ }

    // ================= 设置 =================
    const STORE_KEY = 'dsh-msg-notify.v1';

    const TONES = [
      { id: 'ding', label: '叮咚' },
      { id: 'fault', label: '低沉' },
      { id: 'tap', label: '轻点' },
      { id: 'none', label: '静音' },
    ];
    const REPEATS = [
      { id: 'off', label: '不重复' },
      { id: 'three', label: '再响 3 次' },
      { id: 'always', label: '一直重复' },
    ];
    // 四类提醒：顺序 = 严重程度从低到高。说明文案固定，不改语义。
    const KINDS = [
      { id: 'question', label: '需要回答', hint: '需要你选择或回答时', tone: 'tap' },
      { id: 'done', label: '输出完成', hint: '一轮回复结束时', tone: 'ding' },
      { id: 'failed', label: '发生错误', hint: '运行中断或报错时', tone: 'fault' },
      { id: 'stalled', label: '卡住', hint: '连续 5 分钟没有进展', tone: 'fault' },
    ];

    const has = (list, id) => list.some(item => item.id === id);

    function defaults() {
      const kinds = {};
      for (const kind of KINDS) kinds[kind.id] = { tone: kind.tone, repeat: 'off' };
      return { version: 1, kinds };
    }

    // 读盘：逐字段校验，坏值退回默认，不让旧数据把 UI 弄崩。
    function loadSettings() {
      const base = defaults();
      let raw = null;
      try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return base; }
      if (!raw) return base;
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { return base; }
      if (!parsed || typeof parsed !== 'object' || !parsed.kinds) return base;
      const out = defaults();
      for (const kind of KINDS) {
        const src = parsed.kinds[kind.id];
        if (!src || typeof src !== 'object') continue;
        out.kinds[kind.id] = {
          tone: has(TONES, src.tone) ? src.tone : kind.tone,
          repeat: has(REPEATS, src.repeat) ? src.repeat : 'off',
        };
      }
      return out;
    }

    // 当前生效的设置：引擎每拍都读它，所以改完下一次判断就是新值。
    let settings = loadSettings();

    // 设置写盘 + 广播。引擎与设置页都走这一条路，改完立刻生效（含停掉正在跑的重复）。
    const settingsListeners = new Set();
    function persistSettings(next) {
      settings = next;
      let saved = true;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch (e) { saved = false; }
      for (const fn of settingsListeners) { try { fn(); } catch (e) {} }
      return saved;
    }

    // ================= 发声（试听用） =================
    // 只做三种内置音色。没有用户音量滑杆；各音色有内置 gain（约 0.35–0.8），
    // 整体仍跟随系统音量。
    const PATTERNS = {
      ding: [
        { at: 0, freq: 523.25, dur: 0.18, type: 'sine', gain: 0.8 },
        { at: 0.15, freq: 783.99, dur: 0.35, type: 'sine', gain: 0.8 },
      ],
      fault: [
        { at: 0, freq: 196, dur: 0.2, type: 'sawtooth', gain: 0.35 },
        { at: 0.18, freq: 130.81, dur: 0.4, type: 'sawtooth', gain: 0.35 },
      ],
      tap: [
        { at: 0, freq: 1046.5, dur: 0.07, type: 'triangle', gain: 0.7 },
        { at: 0.1, freq: 1046.5, dur: 0.07, type: 'triangle', gain: 0.7 },
      ],
    };

    let audioCtx = null;
    function audioContext() {
      if (typeof window === 'undefined') return null;
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      if (!audioCtx) {
        try { audioCtx = new Ctor(); } catch (e) { return null; }
      }
      if (audioCtx.state === 'suspended') {
        // resume() 返回 Promise：只包 try/catch 接不住异步拒绝，会变成未处理的 rejection。
        try {
          const resumed = audioCtx.resume();
          if (resumed && typeof resumed.catch === 'function') resumed.catch(() => { /* 下次手势再试 */ });
        } catch (e) { /* 下次手势再试 */ }
      }
      return audioCtx;
    }

    // 返回这次试听的大致时长（毫秒），供按钮里的跳动条控制节奏。
    function playTone(tone) {
      const pattern = PATTERNS[tone];
      if (!pattern) return 0;
      const ctx = audioContext();
      if (!ctx) return 0;
      const schedule = () => {
        const base = ctx.currentTime + 0.06;
        for (const note of pattern) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = note.type;
          osc.frequency.value = note.freq;
          const startAt = base + note.at;
          gain.gain.setValueAtTime(0, startAt);
          gain.gain.linearRampToValueAtTime(note.gain, startAt + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, startAt + note.dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startAt);
          osc.stop(startAt + note.dur + 0.05);
        }
      };
      if (ctx.state === 'running') schedule();
      else {
        // 恢复成功才排声音；失败（没权限 / 没硬件）就安静跳过，别留未处理拒绝、也别假装响过。
        try {
          const resumed = ctx.resume();
          if (resumed && typeof resumed.then === 'function') {
            resumed.then(() => { if (ctx.state === 'running') schedule(); }, () => {});
          }
        } catch (e) { /* 同上 */ }
      }
      let end = 0;
      for (const note of pattern) end = Math.max(end, note.at + note.dur);
      return Math.round(end * 1000);
    }

    // 浏览器自动播放策略：未有用户手势时 AudioContext 常为 suspended，提醒会静默。
    // 在页面上挂一次捕获态手势监听，尽早 resume；成功后卸掉。
    let audioUnlockBound = false;
    function armAudioUnlock() {
      if (audioUnlockBound || typeof document === 'undefined') return () => {};
      if (typeof document.addEventListener !== 'function') return () => {};
      audioUnlockBound = true;
      const events = ['pointerdown', 'keydown', 'touchstart', 'click'];
      let active = true;
      const cleanup = () => {
        if (!active) return;
        active = false;
        for (const type of events) { try { document.removeEventListener(type, unlock, true); } catch (e) {} }
        audioUnlockBound = false;
      };
      const unlock = () => {
        if (!active) return;
        try {
          const ctx = audioContext();
          if (!ctx) return;
          if (ctx.state === 'running') {
            cleanup();
            return;
          }
          const resumed = ctx.resume();
          if (resumed && typeof resumed.then === 'function') {
            resumed.then(() => {
              if (active && ctx.state === 'running') cleanup();
            }, () => {});
          }
        } catch (e) { /* 下次手势再试 */ }
      };
      for (const type of events) {
        try { document.addEventListener(type, unlock, { capture: true, passive: true }); }
        catch (e) {
          try { document.addEventListener(type, unlock, true); } catch (e2) {}
        }
      }
      return cleanup;
    }

    // ================= 服务形状探测 =================
    // 「完成/出错/卡住」检测依赖 DSH 客户端内部服务的形状（sessions.list /
    // binding().eventSource / lastAgentError / uiSession.sessionStatus）。DSH 升级一旦
    // 改了形状，旧代码的 try/catch 会静默兜底，检测悄悄失灵却无从察觉。这里把形状探测
    // 抽成纯函数；探测失败时 console.warn 一次（模块级布尔防刷屏），点名是哪个服务不符。
    const shapeWarned = new Set();

    /** 每种不符文案只警告一次；message 可以是数组（合并成一条），要写清是哪个服务的形状不符。 */
    function warnShapeOnce(message) {
      const text = Array.isArray(message) ? message.join('；') : String(message);
      if (!text || shapeWarned.has(text)) return;
      shapeWarned.add(text);
      console.warn('dsh-msg-notify: ' + text +
        '（DSH 升级可能改了客户端内部服务的形状，「完成/出错/卡住」检测会静默失灵）');
    }

    /**
     * 纯函数：探测 sessions 服务形状，返回不符项数组（空数组 = 形状完好）。
     * 只看本插件用到的入口：list.getSnapshot / list.subscribe / binding(id)。
     */
    function sessionShapeIssues(sessions) {
      if (!sessions || typeof sessions !== 'object') return ['sessions 服务缺失'];
      const issues = [];
      const list = sessions.list;
      if (!list || typeof list.getSnapshot !== 'function') issues.push('sessions.list.getSnapshot 不可用');
      if (!list || typeof list.subscribe !== 'function') issues.push('sessions.list.subscribe 不可用');
      if (typeof sessions.binding !== 'function') issues.push('sessions.binding(id) 不可用');
      return issues;
    }

    /** 纯函数：探测 uiSession.sessionStatus 形状，返回不符项数组（空 = 完好）。 */
    function statusShapeIssues(uiSession) {
      if (!uiSession || typeof uiSession !== 'object') return ['uiSession 服务缺失'];
      const status = uiSession.sessionStatus;
      if (!status) return ['uiSession.sessionStatus 缺失'];
      const issues = [];
      if (typeof status.getSnapshot !== 'function') issues.push('uiSession.sessionStatus.getSnapshot 不可用');
      if (typeof status.subscribe !== 'function') issues.push('uiSession.sessionStatus.subscribe 不可用');
      return issues;
    }

    // ================= 引擎常量 =================
    const REPEAT_MS = 30 * 1000;        // 重复提醒的固定间隔
    const STALL_MS = 5 * 60 * 1000;     // 多久没有任何动静算“卡住”
    const POLL_MS = 5 * 1000;           // 卡住检测的轮询节拍
    const SETTLE_MS = 250;              // 跑完之后等一小会儿再判定完成/出错

    // ================= 样式 =================
    const CSS = `
.mn-page { display: flex; flex-direction: column; gap: 8px; width: 100%; min-width: 0; box-sizing: border-box;
  color: var(--dsw-alias-label-primary); padding: 12px 0 14px; max-width: 600px; font-family: inherit; }
.mn-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; margin: 0 0 4px; padding: 0; }
.mn-title { font-size: 17px; font-weight: 700; line-height: 24px; margin: 0; letter-spacing: .06em; color: var(--dsw-alias-label-primary); }
.mn-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.mn-confirm { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.mn-card {
  border-radius: 12px; padding: 2px 18px 4px; margin: 0; min-width: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 34%, transparent);
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.mn-card-title {
  font-family: inherit; font-size: 15px; font-weight: 650; line-height: 22px;
  margin: 0 0 18px; padding-top: 10px; letter-spacing: .05em;
  color: var(--dsw-alias-label-primary); }
.mn-row { display: flex; align-items: center; justify-content: space-between; gap: 12px 24px;
  padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.mn-card .mn-row:last-child { border-bottom: 0; }
.mn-main { min-width: 0; }
.mn-label {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 13.5px; font-weight: 500; line-height: 20px; letter-spacing: 0;
  color: var(--dsw-alias-label-primary); }
.mn-desc {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 12px; font-weight: 400; line-height: 18px; margin-top: 3px; max-width: 300px; letter-spacing: 0;
  color: color-mix(in srgb, var(--dsw-alias-label-secondary) 68%, transparent); }
.mn-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; flex: 0 0 auto; max-width: 100%; }
.mn-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; flex: none;
  font-family: inherit; font-size: 13px; line-height: 20px; height: 32px; padding: 0 12px; white-space: nowrap;
  border-radius:var(--dsw-radius-md,8px); cursor: pointer; border: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent);
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent), 0 1px 2px rgba(19,45,83,.06);
  color: var(--dsw-alias-label-primary); transition: background .15s; }
.mn-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.mn-btn:disabled { opacity: .45; cursor: default; }
.mn-btnGhost { color: var(--dsw-alias-label-secondary); }
.mn-btnDanger { border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); background: transparent; box-shadow: none; }
.mn-pick { position: relative; display: inline-flex; }
.mn-select { appearance: none; box-sizing: border-box; height: 32px; padding: 0 26px 0 10px; font-family: inherit; font-size: 13px; line-height: 20px;
  color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent);
  border: 0; border-radius: var(--dsw-radius-md, 8px); cursor: pointer;
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent), 0 1px 2px rgba(19,45,83,.06); }
.mn-select:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.mn-select:disabled { opacity: .45; cursor: default; }
.mn-select.mn-menu-trigger { text-align: left; }
.mn-tone .mn-select { width: 80px; }
.mn-repeat .mn-select { width: 112px; }
.mn-chev { position: absolute; right: 9px; top: 50%; width: 9px; height: 6px; margin-top: -3px; pointer-events: none; color: var(--dsw-alias-label-secondary); }
.mn-play { display: inline-grid; box-sizing: border-box; place-items: center; width: 32px; height: 32px; padding: 0;
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent);
  border: 0; border-radius:var(--dsw-radius-md,8px); cursor: pointer;
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent), 0 1px 2px rgba(19,45,83,.06);
  transition: background-color .15s, color .15s; }
.mn-play:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.mn-play:disabled { opacity: .45; cursor: default; }
.mn-bars { display: flex; align-items: center; gap: 2px; height: 12px; }
.mn-bars span { width: 2px; height: 12px; border-radius: 1px; background: var(--dsw-alias-brand-primary); transform: scaleY(.35); transform-origin: center; }
.mn-play[data-playing="true"] .mn-bars span { animation: mn-bounce .36s ease-in-out infinite alternate; }
.mn-play[data-playing="true"] .mn-bars span:nth-child(2) { animation-delay: .12s; }
.mn-play[data-playing="true"] .mn-bars span:nth-child(3) { animation-delay: .24s; }
@keyframes mn-bounce { from { transform: scaleY(.3); } to { transform: scaleY(1); } }
.mn-page :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
@media (max-width: 600px) { .mn-row { flex-wrap: wrap; } .mn-controls { flex-wrap: wrap; } .mn-actions { max-width: 100%; } }
@media (prefers-reduced-motion: reduce) { .mn-btn, .mn-play { transition: none; } .mn-play[data-playing="true"] .mn-bars span { animation: none; transform: scaleY(.8); } }
`;

    // ================= 小组件 =================
    function Chevron() {
      return h('svg', { className: 'mn-chev', viewBox: '0 0 10 6', 'aria-hidden': true },
        h('path', { d: 'M1 1l4 4 4-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function PlayButton(props) {
      return h('button', {
        type: 'button',
        className: 'mn-play',
        title: '试听',
        'aria-label': props.label + ' 试听',
        'data-playing': props.playing ? 'true' : 'false',
        disabled: props.disabled,
        onClick: props.onClick,
      }, props.playing
        ? h('span', { className: 'mn-bars', 'aria-hidden': true }, h('span'), h('span'), h('span'))
        : h('svg', { width: 10, height: 12, viewBox: '0 0 10 12', 'aria-hidden': true },
            h('path', { d: 'M1.4 1.2l7.2 4.8-7.2 4.8z', fill: 'currentColor' })));
    }

    function OfficialPick(props) {
      const [open, setOpen] = react.useState(false);
      const selected = props.options.find(option => option.id === props.value);
      const anchor = h('button', {
        type: 'button', className: 'mn-select mn-menu-trigger',
        'aria-label': props.label, 'aria-haspopup': 'menu', 'aria-expanded': open,
        disabled: props.disabled,
        onClick: () => setOpen(value => !value),
      }, selected ? selected.label : '', h(Chevron));
      return h('span', { className: 'mn-pick ' + (props.variant === 'repeat' ? 'mn-repeat' : 'mn-tone') },
        h(OfficialMenu, {
          open, anchor, items: props.options, selectedId: props.value,
          selection: 'fill', portal: true, align: 'end',
          onClose: () => setOpen(false),
          onSelect: id => { setOpen(false); props.onChange(id); },
        }));
    }

    function Pick(props) {
      if (OfficialMenu !== null) return h(OfficialPick, props);
      return h('span', { className: 'mn-pick ' + (props.variant === 'repeat' ? 'mn-repeat' : 'mn-tone') },
        h('select', {
          className: 'mn-select',
          value: props.value,
          'aria-label': props.label,
          disabled: props.disabled,
          onChange: e => props.onChange(e.target.value),
        }, props.options.map(option => h('option', { key: option.id, value: option.id }, option.label))),
        h(Chevron));
    }

    // ================= 设置页 =================
    function Panel() {
      const state = react.useState(loadSettings);
      const settings = state[0];
      const setSettings = state[1];
      const playState = react.useState('');
      const playing = playState[0];
      const setPlaying = playState[1];
      const owner = react.useRef({}).current;
      const toast = window.__dshSettingsToastV1;
      react.useEffect(() => { toast.activate(owner); return () => toast.cancel(owner); }, [owner]);
      const timer = react.useRef(null);

      react.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
      // 其它标签页改了设置（storage → loadSettings → listeners）时，同步本页 React 状态。
      react.useEffect(() => {
        const sync = () => { try { setSettings(loadSettings()); } catch (e) {} };
        settingsListeners.add(sync);
        return () => { settingsListeners.delete(sync); };
      }, []);

      function commit(next) {
        const saved = persistSettings(next);
        setSettings(next);
        if (!saved) toast.show(owner, 'error', '无法保存设置，重启后可能失效');
        return saved;
      }

      function patchKind(kindId, patch) {
        const next = {
          version: 1,
          kinds: Object.assign({}, settings.kinds),
        };
        next.kinds[kindId] = Object.assign({}, settings.kinds[kindId], patch);
        commit(next);
      }

      function preview(kindId) {
        const config = settings.kinds[kindId];
        const ms = playTone(config.tone);
        if (!ms) return;
        setPlaying(kindId);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setPlaying(id => (id === kindId ? '' : id)), ms + 160);
      }

      async function resetAll() {
        if (!await toast.confirm(owner, '恢复消息提示默认设置？')) return;
        if (commit(defaults())) toast.show(owner, 'success', '已恢复默认设置');
      }

      const rows = KINDS.map(kind => {
        const config = settings.kinds[kind.id];
        const silent = config.tone === 'none';
        return h('div', { className: 'mn-row', key: kind.id },
          h('div', { className: 'mn-main' },
            h('div', { className: 'mn-label' }, kind.label),
            h('div', { className: 'mn-desc' }, kind.hint)),
          h('div', { className: 'mn-controls' },
            h(Pick, {
              label: kind.label + ' 音色',
              value: config.tone,
              options: TONES,
              onChange: tone => patchKind(kind.id, { tone }),
            }),
            h(Pick, {
              label: kind.label + ' 重复',
              value: config.repeat,
              options: REPEATS,
              variant: 'repeat',
              disabled: silent,
              onChange: repeat => patchKind(kind.id, { repeat }),
            }),
            h(PlayButton, {
              label: kind.label,
              disabled: silent,
              playing: playing === kind.id,
              onClick: () => preview(kind.id),
            })));
      });

      return h('div', { className: 'mn-page' },
        h('div', { className: 'mn-head' },
          h('h1', { className: 'mn-title' }, '消息提示'),
          h('div', { className: 'mn-actions' },
            h('button', { type: 'button', className: 'mn-btn', onClick: () => void resetAll() }, '恢复默认'))),
        h('div', { className: 'mn-card' },
          h('h2', { className: 'mn-card-title' }, '提示音'),
          rows));
    }

    // ================= 挂载 =================
    function apply(ctx) {
      ctx.effect(() => armAudioUnlock());
      // 插件自己持有原生定时器，挂到 fiber 上，卸载时统一清理。
      const ownTimeout = (fn, ms) => {
        let dispose = () => {};
        try {
          dispose = ctx.effect(() => {
            const id = window.setTimeout(() => { try { dispose(); } catch (e) {} fn(); }, ms);
            return () => { try { window.clearTimeout(id); } catch (e) {} };
          });
        } catch (e) { return () => {}; }
        return dispose;
      };
      const ownInterval = (fn, ms) => {
        try {
          return ctx.effect(() => {
            const id = window.setInterval(fn, ms);
            return () => { try { window.clearInterval(id); } catch (e) {} };
          });
        } catch (e) { return () => {}; }
      };

      // ---------- 读会话状态 ----------
      const prev = new Map();      // id -> { running, pending, err }
      const runs = new Map();      // id -> { err }：本轮开始时的错误基线
      const settling = new Set();
      const settleTimers = new Map(); // id -> 取消函数：结算倒计时可被“又重新跑起来”打断

      /** 取消这个会话还没落地的结算（重新开跑、变成提问、或离开列表时都要取消）。 */
      function cancelSettle(id) {
        const dispose = settleTimers.get(id);
        settleTimers.delete(id);
        settling.delete(id);
        if (typeof dispose === 'function') { try { dispose(); } catch (e) {} }
      }
      const chains = new Map();    // `${id}|${kind}` -> 重复计时器
      const stalledSeen = new Set();
      // id -> { last, pendingTools, dispose }：这个会话最后一次真实动静。
      // 接不上事件流的会话不进这张表，也就永远不会被判成卡住（宁可不喊，不冤枉）。
      const activity = new Map();

      const keyOf = (id, kind) => id + '|' + kind;
      const configOf = kind => (settings.kinds && settings.kinds[kind]) || { tone: 'none', repeat: 'off' };

      function listOf() {
        const sessions = ctx.get('sessions');
        return sessions && sessions.list ? sessions.list : null;
      }
      function rowOf(id) {
        const list = listOf();
        if (!list || typeof list.getSnapshot !== 'function') return undefined;
        let snap = null;
        try { snap = list.getSnapshot(); } catch (e) { return undefined; }
        const byId = (snap && snap.byId) || {};
        return byId[id];
      }
      function statusOf(id) {
        const ui = ctx.get('uiSession');
        if (!ui || !ui.sessionStatus) return undefined;
        try {
          const map = ui.sessionStatus.getSnapshot();
          return map ? (map.get ? map.get(id) : map[id]) : undefined;
        } catch (e) { return undefined; }
      }
      // 审批不单独响铃，但须保留其状态，避免把等待审批误判为完成或卡住。
      function pendingKindOf(id) {
        const state = statusOf(id);
        const pending = state && state.pendingInteraction;
        if (!pending || typeof pending.kind !== 'string') return undefined;
        return pending.kind === 'approval' ? 'approval' : 'question';
      }
      function runningOf(id, fallback) {
        const state = statusOf(id);
        return state && typeof state.running === 'boolean' ? state.running : !!fallback;
      }
      function lastErrorOf(id) {
        try {
          const sessions = ctx.get('sessions');
          if (!sessions || !sessions.binding) return null;
          const binding = sessions.binding(id);
          const snap = binding && binding.session && binding.session.getSnapshot();
          return snap && snap.lastAgentError ? snap.lastAgentError : null;
        } catch (e) { return null; }
      }
      /**
       * 从事件窗口估算未返回命令数。
       * orphanResults：窗口开头出现未配对的 tool/result（旧 call 已被裁掉），配对不可靠。
       */
      function analyzeTools(entries) {
        let pending = 0;
        let orphanResults = 0;
        for (const entry of entries || []) {
          if (!entry || entry.type !== 'event') continue;
          const type = entry.event && entry.event.type;
          if (type === 'tool/call') pending += 1;
          else if (type === 'tool/result') {
            if (pending > 0) pending -= 1;
            else orphanResults += 1;
          }
        }
        return { pending, orphanResults };
      }

      /** 这个会话是否还有在跑的子智能体（父会话在等它，不算卡住）。 */
      function hasRunningChild(id) {
        const list = listOf();
        if (!list || typeof list.getSnapshot !== 'function') return false;
        let snap = null;
        try { snap = list.getSnapshot(); } catch (e) { return false; }
        const byId = (snap && snap.byId) || {};
        for (const childId of Object.keys(byId)) {
          const child = byId[childId];
          if (!child || child.parentSessionId !== id) continue;
          if (runningOf(childId, child.running)) return true;
        }
        return false;
      }

      /**
       * 接上一个在跑会话的事件流：流式增量、命令开始与返回、消息落盘都会叫醒我们。
       * 接不上（这个会话没在客户端打开过）就什么都不记，卡住检测自然不碰它。
       */
      function trackActivity(id) {
        if (activity.has(id)) return;
        const sessions = ctx.get('sessions');
        let source;
        try {
          const binding = sessions && sessions.binding ? sessions.binding(id) : undefined;
          source = binding && binding.eventSource;
        } catch (e) { source = undefined; }
        if (!source || typeof source.subscribe !== 'function' || typeof source.getSnapshot !== 'function') return;
        // pendingTools 以 append 增量维护，避免窗口裁掉旧 tool/call 后重算配对出错。
        // toolsUnreliable：replace/首次重算时发现前导孤立 result，宁可不报卡住。
        const record = { last: Date.now(), pendingTools: 0, toolsUnreliable: false, dispose: null };
        const applyEntries = (entries) => {
          for (const entry of entries || []) {
            if (!entry || entry.type !== 'event') continue;
            const type = entry.event && entry.event.type;
            if (type === 'tool/call') record.pendingTools += 1;
            else if (type === 'tool/result') record.pendingTools = Math.max(0, record.pendingTools - 1);
          }
        };
        const recount = (entries) => {
          const analysis = analyzeTools(entries);
          record.pendingTools = analysis.pending;
          record.toolsUnreliable = analysis.orphanResults > 0;
        };
        // 往上翻历史（prepend）只是加载旧记录，不算“有动静”。
        const refresh = () => {
          let snapshot;
          try { snapshot = source.getSnapshot(); } catch (e) { return; }
          const change = snapshot && snapshot.change;
          if (change && change.kind === 'prepend') return;
          if (change && change.kind === 'append' && Array.isArray(change.entries)) {
            applyEntries(change.entries);
            record.last = Date.now();
            return;
          }
          // replace / 首次 / 未知：从窗口重算；有孤立 result 则标记不可靠。
          recount(snapshot && snapshot.entries);
          record.last = Date.now();
        };
        try { record.dispose = source.subscribe(refresh); } catch (e) { return; }
        activity.set(id, record);
        refresh();
      }

      function forgetActivity(id) {
        const record = activity.get(id);
        if (!record) return;
        activity.delete(id);
        try { if (record.dispose) record.dispose(); } catch (e) {}
      }

      /** 卡住 = 在跑、却已经连续 STALL_MS 没有任何真实动静。 */
      function isStalled(id) {
        const row = rowOf(id);
        if (!row) return false;
        if (!runningOf(id, row.running)) return false;
        // 等用户回答或审批时事件流常安静，不算卡住。
        if (pendingKindOf(id) !== undefined) return false;
        const state = activity.get(id);
        if (!state) return false;                    // 拿不到动静，就不猜
        if (state.toolsUnreliable) return false;     // 窗口配对不可靠，宁可不报
        if (state.pendingTools > 0) return false;    // 还有命令挂着，算它在干活
        if (hasRunningChild(id)) return false;       // 在等子智能体
        return Date.now() - state.last > STALL_MS;
      }

      // ---------- 响一声 + 重复链 ----------
      function fire(kind) {
        const config = configOf(kind);
        if (!config || config.tone === 'none') return;
        try { playTone(config.tone); } catch (e) { /* 没有音频设备时静默失败 */ }
      }

      function stopChain(id, kind) {
        const key = keyOf(id, kind);
        const record = chains.get(key);
        if (!record) return;
        try { record.dispose(); } catch (e) {}
        chains.delete(key);
      }
      function stopAllChains() {
        for (const record of [...chains.values()]) stopChain(record.id, record.kind);
      }

      // 这条重复链还该不该继续：条件没了就停。
      function stillActive(id, kind) {
        if (kind === 'question') return pendingKindOf(id) === 'question';
        if (kind === 'stalled') return isStalled(id);
        return !runningOf(id, false); // 完成/出错：响到这个会话又跑起来（或次数用完）
      }

      function startChain(id, kind, remainingOverride) {
        const config = configOf(kind);
        const mode = config && config.repeat;
        if (!mode || mode === 'off' || config.tone === 'none') return;
        if (chains.has(keyOf(id, kind))) return;
        let remaining;
        if (typeof remainingOverride === 'number') remaining = remainingOverride;
        else remaining = mode === 'three' ? 3 : Infinity;
        const record = { id, kind, remaining, dispose: null };
        record.dispose = ownInterval(() => {
          if (!stillActive(id, kind)) { stopChain(id, kind); return; }
          if (record.remaining !== Infinity && record.remaining <= 0) { stopChain(id, kind); return; }
          if (record.remaining !== Infinity) record.remaining -= 1;
          fire(kind);
          if (record.remaining !== Infinity && record.remaining <= 0) stopChain(id, kind);
        }, REPEAT_MS);
        chains.set(keyOf(id, kind), record);
      }

      // ---------- 事件边沿 ----------
      function settleRun(id) {
        if (settling.has(id)) return;
        const run = runs.get(id);
        runs.delete(id);
        settling.add(id);
        const dispose = ownTimeout(() => {
          settleTimers.delete(id);
          try {
            // 这 250ms 里状态可能已经变了：又重新跑起来、变成等回答、或者会话被删了。
            // 旧逻辑不查这些，会在“任务已重启/已删除”之后还响一声完成。
            const row = prev.get(id);
            if (!row) return;
            if (row.running) return;
            if (row.pending !== undefined) return;
            const err = lastErrorOf(id);
            const failed = !!(err != null && (!run || err !== run.err));
            const kind = failed ? 'failed' : 'done';
            fire(kind);
            startChain(id, kind);
          } finally {
            settling.delete(id);
          }
        }, SETTLE_MS);
        settleTimers.set(id, dispose);
      }

      function observe(list) {
        const byId = (list && list.byId) || {};
        for (const id of Object.keys(byId)) {
          const row = byId[id] || {};
          const running = runningOf(id, row.running);
          const pending = pendingKindOf(id);
          const before = prev.get(id);
          if (before) {
            if (pending === 'approval' && before.pending !== 'approval') cancelSettle(id);
            if (pending === 'question' && before.pending !== 'question') {
              // 提问优先：同一拍里“停了 + 要回答”时只响提问，别再补一声完成。
              cancelSettle(id);
              fire('question');
              startChain(id, 'question');
            } else if (pending !== 'question' && before.pending === 'question') {
              stopChain(id, 'question');
            }
            if (before.running && !running) {
              forgetActivity(id);
              settleRun(id);
            } else if (!before.running && running) {
              cancelSettle(id);
              // 新一轮开始：不把上一轮残留的 lastAgentError 当基线，
              // 否则同文案失败会被误判成「完成」。
              runs.set(id, { err: null });
              stalledSeen.delete(id);
              stopChain(id, 'done');
              stopChain(id, 'failed');
            }
          } else if (running) {
            // 第一次见到这个会话就在跑：记下错误基线，别再当成“刚开始跑”。
            runs.set(id, { err: lastErrorOf(id) });
          }
          prev.set(id, { running, pending });
        }
        // 已离开列表的会话：清干净，别留幽灵计时器
        for (const id of [...prev.keys()]) {
          if (Object.prototype.hasOwnProperty.call(byId, id)) continue;
          prev.delete(id);
          runs.delete(id);
          cancelSettle(id);
          stalledSeen.delete(id);
          forgetActivity(id);
          for (const kind of ['question', 'done', 'failed', 'stalled']) stopChain(id, kind);
        }
      }

      function tick() {
        const list = listOf();
        if (!list) return;
        observe(list.getSnapshot());
      }
      function seed(list) {
        const byId = (list && list.byId) || {};
        for (const id of Object.keys(byId)) {
          const row = byId[id] || {};
          prev.set(id, { running: runningOf(id, row.running), pending: pendingKindOf(id) });
          if (runningOf(id, row.running)) runs.set(id, { err: lastErrorOf(id) });
        }
      }

      // ---------- 设置变化：立刻停 + 按新设置重挂 ----------
      function reconcile() {
        // 完成/出错的重复链若还该继续，记下剩余次数，停掉后按新设置接上，避免改设置直接掐掉。
        const resume = [];
        for (const record of [...chains.values()]) {
          if (record.kind !== 'done' && record.kind !== 'failed') continue;
          if (!stillActive(record.id, record.kind)) continue;
          resume.push({ id: record.id, kind: record.kind, remaining: record.remaining });
        }
        stopAllChains();
        for (const [id, state] of prev) {
          if (state.pending === 'question') startChain(id, 'question');
        }
        for (const id of stalledSeen) startChain(id, 'stalled');
        for (const item of resume) startChain(item.id, item.kind, item.remaining);
      }
      ctx.effect(() => {
        settingsListeners.add(reconcile);
        return () => { settingsListeners.delete(reconcile); };
      });

      // 别的窗口改了设置也要跟（storage 事件）
      ctx.effect(() => {
        if (typeof window === 'undefined' || !window.addEventListener) return () => {};
        const onStorage = event => {
          if (event && event.key && event.key !== STORE_KEY) return;
          settings = loadSettings();
          reconcile();
        };
        window.addEventListener('storage', onStorage);
        return () => { try { window.removeEventListener('storage', onStorage); } catch (e) {} };
      });

      // ---------- 订阅 ----------
      ctx.inject(['sessions'], (scope) => {
        scope.effect(() => {
          const sessions = scope.get('sessions');
          for (const issue of sessionShapeIssues(sessions)) warnShapeOnce(issue);
          if (!sessions || !sessions.list) return () => {};
          const list = sessions.list;
          seed(list.getSnapshot());
          return list.subscribe(tick);
        });
      });
      // 挂起交互（提问）在 sessionStatus 上发布，不会触发列表订阅，必须单独订阅。
      ctx.inject(['uiSession'], (scope) => {
        scope.effect(() => {
          const ui = scope.get('uiSession');
          for (const issue of statusShapeIssues(ui)) warnShapeOnce(issue);
          if (!ui || !ui.sessionStatus || !ui.sessionStatus.subscribe) return () => {};
          // 先对齐一次“挂起”基线：加载前就挂着的提问不该被当成新事件。
          for (const [id, state] of prev) state.pending = pendingKindOf(id);
          return ui.sessionStatus.subscribe(tick);
        });
      });

      // ---------- 卡住检测 ----------
      ownInterval(() => {
        const list = listOf();
        if (!list) return;
        const byId = list.getSnapshot().byId || {};
        for (const id of Object.keys(byId)) {
          const row = byId[id] || {};
          // 在跑的会话先接上事件流，再判它是不是真的一点动静都没有。
          if (runningOf(id, row.running)) trackActivity(id);
          if (!isStalled(id)) {
            stalledSeen.delete(id);
            stopChain(id, 'stalled');
            continue;
          }
          if (stalledSeen.has(id)) continue;
          stalledSeen.add(id);
          fire('stalled');
          startChain(id, 'stalled');
        }
      }, POLL_MS);

      // 插件卸载时放开所有事件流订阅，并关掉 AudioContext。
      ctx.effect(() => () => {
        for (const id of [...activity.keys()]) forgetActivity(id);
        if (audioCtx) {
          try { audioCtx.close(); } catch (e) {}
          audioCtx = null;
        }
      });

      // 样式挂到插件 fiber 上，卸载时自动移除（避免 HMR 反复叠加）。
      ctx.effect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-plugin', 'dsh-msg-notify');
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => style.remove();
      });

      // 服务可能晚于插件就绪，用 inject + effect 等它到位再注册，避免永久不注册。
      ctx.inject(['slots'], (scope) => {
        const slots = scope.get('slots');
        if (!slots) return;
        scope.effect(() => slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'dsh-msg-notify', order: 23.5, label: () => '消息提示' },
          () => h(Panel))));
      });
    }

    return {
      name: 'dsh-msg-notify',
      inject: [],
      apply,
      // 仅供离线测试调用；不属于运行时对外接口。
      __test__: { sessionShapeIssues, statusShapeIssues, warnShapeOnce },
    };
  },
});
