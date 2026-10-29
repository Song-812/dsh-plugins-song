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
      for (const [label, answer] of [[(item.labels && item.labels[0]) || '确认','yes'],[(item.labels && item.labels[1]) || '取消','no']]) {
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
    confirm(owner,text,labels){return new Promise(resolve=>{if(canceled.has(owner) || (current && current.owner===owner && current.kind==='confirm') || queue.some(item=>item.owner===owner && item.kind==='confirm')){resolve(false);return;}queue.push({owner,kind:'confirm',text:String(text),labels,resolve});render();});},
    cancel(owner){canceled.add(owner);for(let i=queue.length-1;i>=0;i--)if(queue[i].owner===owner){const item=queue.splice(i,1)[0];if(item.resolve)item.resolve(false);}if(current && current.owner===owner)close(false);}
  };
})();

// dsh-session-delete — 客户端半边。
//
// 两处界面：
//   1. 会话行末尾 hover 出现的一个垃圾桶（官方插槽 sidebar.workspaces.session.row.action，
//      与内核自己的 archive / pin 按钮同一排、同一份几何）；
//   2. 点下去之后的确认框（注册在 shell.overlay，帧级浮层，不被侧栏滚动容器裁切）。
//
// 删除确认及失败反馈复用顶部提示队列。
// 删除失败时通过顶部提示说明。
window.__ModuleLoader__.load({
  id: 'dsh-session-delete',
  factory: (require) => {
    const react = require('react')
    const h = react.createElement

    const NS = 'dsh-session-delete'
    const API_CHECK = '/dsh-session-delete/check'
    const API_DELETE = '/dsh-session-delete/delete'
    const ROW_ACTION_SLOT = 'sidebar.workspaces.session.row.action'
    const ROW_ACTION_ID = 'session-delete'
    /** 排在 archive(100) / pin(200) 与 ui-hide 的重命名(50) 后面。 */
    const ROW_ACTION_ORDER = 300
    const OVERLAY_SLOT = 'shell.overlay'
    const OVERLAY_ID = 'session-delete-confirm'
    const STYLE_ID = 'dsh-session-delete-style'

    /**
     * 宿主的回答要不要跨悬停记住。
     *
     * 只记住「可删」：可删不会自己变回去。「还在跑」「空白」却会随会话状态改变，
     * 一旦记死就会出现「明明跑完了、按钮还是灰的」的假灰 —— 那正是这里要避免的。
     */
    function canSkipCheck(verdict) {
      return verdict !== null && typeof verdict === 'object' && verdict.deletable === true
    }

    /** 这一行为什么不能删：只看宿主判定（还在跑 / 空白）；都能删就是 null。 */
    function rowReason(verdict) {
      if (verdict !== null && verdict.deletable === false) return verdict.reason ?? null
      return null
    }

    /** 按钮要不要禁用。没问过宿主时不禁用——点了会当场问一次，比先灰着更诚实。 */
    function rowBlocked(verdict) {
      return rowReason(verdict) !== null
    }

    /**
     * 收到 DSH 的会话运行状态事件后，这一行该怎么改判定。
     *
     * - 不是这条会话的事件：不动；
     * - 正在跑：立刻盖成「在跑」，别让旧的可删结论继续挂着；
     * - 跑完了：丢掉旧判定，按钮变可点（点下去还会再问一次宿主）。
     *
     * @param {{deletable: boolean, reason?: string|null}|null} verdict - 当前这一行的判定。
     * @param {string} changedId - 状态变化的那条会话 id。
     * @param {boolean} running - 它现在还在不在跑。
     * @param {string} sessionId - 这一行的会话 id。
     * @returns {{deletable: boolean, reason?: string|null}|null} 新的判定（null = 没问过，可点）。
     */
    function applyStatus(verdict, changedId, running, sessionId) {
      if (String(changedId) !== sessionId) return verdict
      return running === true ? { deletable: false, reason: 'running' } : null
    }

    /**
     * 删完要不要补一个空白会话。
     *
     * 只有「删的正是当前正在看的那条」且「删除真的成功」才补：否则界面会停在一条
     * 已经不存在的会话上。删失败就原地不动，列表本身就是回执。
     */
    function shouldStartSession(result, pending) {
      return result !== null && typeof result === 'object'
        && result.ok === true
        && pending !== null && pending.wasCurrent === true
    }

    /** 让界面开一个空白会话；打不开就算了，不额外弹错。 */
    function startBlankSession(ctx) {
      try {
        ctx?.get?.('uiWorkspace')?.startSession?.()
      } catch {
        /* 打不开时用户可以自己点「新会话」 */
      }
    }

    /**
     * 读插槽给的 `useSessionRetainInfo`。
     *
     * 这个 hook 的形状随内核版本变过（有时收会话 id、有时收选择器），传错会当场抛错、
     * 把整行渲染带崩。取不到或抛错都当作「不是当前会话」，宁可少一个判定。
     *
     * @param {Record<string, unknown>} props - 插槽 props。
     * @param {string} sessionId - 这一行的会话 id。
     * @returns {unknown} 保留信息，取不到为 undefined。
     */
    function readRetainInfo(props, sessionId) {
      if (typeof props.useSessionRetainInfo !== 'function') return undefined
      try {
        return props.useSessionRetainInfo(sessionId)
      } catch {
        return undefined
      }
    }

    /**
     * 读插槽给的 `usePanelInfo`：当前是不是开着设置之类的全局面板。
     * @param {Record<string, unknown>} props - 插槽 props。
     * @returns {boolean} 面板开着为 true。
     */
    function readPanelKey(props) {
      if (typeof props.usePanelInfo !== 'function') return undefined
      try { return props.usePanelInfo((info) => info.activePanelId) } catch { return undefined }
    }

    /**
     * 安全地取 API 网关的 remote 服务。
     *
     * 没在 `inject` 里声明的服务，Cordis 下直接写 `ctx.remote` 会抛错，组件一渲染就崩、
     * 整个垃圾桶消失（2026-10-26 踩过）。这里一律走 `ctx.get` 并兜住异常，取不到就当没有。
     */
    function remoteOf(ctx) {
      try {
        const remote = ctx?.get?.('remote')
        return remote !== null && typeof remote === 'object' ? remote : undefined
      } catch {
        return undefined
      }
    }
    /** 界面文案；用哪种语言看当前 locale，取不到就中文。 */
    const TEXT = {
      zh: {
        action: '删除这条会话',
        trashLabel: '删除会话',
        askWithTokens: (label) => `这条会话用了 ${label} token，删除吗？`,
        ask: '删除这条会话？',
        // 回收站被禁用/配额满时删除会变成永久的：这话必须说在按下「删除」之前。
        askWithTokensPermanent: (label) => `这条会话用了 ${label} token，但回收站不可用，将永久删除、无法找回。删除吗？`,
        askPermanent: '回收站不可用：这条会话将永久删除、无法找回。删除吗？',
        // 删前探测只是怀疑（可能不准），所以话说得比 permanent 软一档：「可能」「风险」。
        askWithTokensSuspect: (label) => `这条会话用了 ${label} token，回收站可能不可用：这次删除有永久丢失风险。确定吗？`,
        askSuspect: '回收站可能不可用：这次删除有永久丢失风险，确定吗？',
        cancel: '取消',
        confirm: '删除',
        deleting: '删除中…',
        deleteFailed: '删除失败或未完成，请检查会话列表和回收站后再重试。',
        reasonRunning: '会话还在跑，先停下来再删',
        reasonBlank: '空白会话不用删，DSH 需要时会立刻再建一个',
      },
      en: {
        action: 'Delete this session',
        trashLabel: 'Delete session',
        askWithTokens: (label) => `This session used ${label} tokens. Delete it?`,
        ask: 'Delete this session?',
        askWithTokensPermanent: (label) => `Recycle bin unavailable: this session used ${label} tokens and will be permanently deleted, with no way back. Delete it?`,
        askPermanent: 'Recycle bin unavailable: this session will be permanently deleted, with no way back. Delete it?',
        askWithTokensSuspect: (label) => `Recycle bin may be unavailable: this session used ${label} tokens, and this deletion risks permanent loss. Delete it?`,
        askSuspect: 'Recycle bin may be unavailable: this deletion risks permanent loss. Delete it?',
        cancel: 'Cancel',
        confirm: 'Delete',
        deleting: 'Deleting…',
        deleteFailed: 'Deletion was not completed. Check the session list and Recycle Bin before retrying.',
        reasonRunning: 'This session is still running',
        reasonBlank: 'A blank session comes right back',
      },
    }

    /**
     * 点下垃圾桶时的待办快照：宿主 /check 答什么就记什么。
     * `permanent` 只认显式传的 true —— 宿主没说就按可还原处理，不许自己吓自己。
     * `binStatus` 是删前探测结论：只在宿主明说 'suspect' 时才换风险话术，没说就是 unknown。
     *
     * @param {{sessionId: string, wasCurrent: boolean, title: string}} base - 这一行的基本信息。
     * @param {Record<string, unknown>} answer - 宿主 /check 的回答。
     * @param {object} text - 当前语言的文案表。
     * @returns {object} 确认框的待办状态。
     */
    function buildPending(base, answer, text) {
      return {
        ...base,
        label: typeof answer.label === 'string' ? answer.label : '',
        text,
        permanent: answer.permanent === true,
        binStatus: typeof answer.binStatus === 'string' ? answer.binStatus : 'unknown',
      }
    }

    /**
     * 确认框的问句。三种话术，优先级从高到低：
     *   1. permanent（上次删除的铁证）→「将永久删除、无法找回」；
     *   2. binStatus === 'suspect'（删前探测的预警）→「可能不可用：有永久丢失风险」；
     *   3. 其余（ok / unknown）→ 原话术。
     *
     * @param {{label: string, permanent?: boolean, binStatus?: string}} pending - 确认框的待办状态。
     * @param {object} text - 当前语言的文案表。
     * @returns {string} 问句。
     */
    function questionFor(pending, text) {
      if (pending.permanent === true) {
        return pending.label === '' ? text.askPermanent : text.askWithTokensPermanent(pending.label)
      }
      if (pending.binStatus === 'suspect') {
        return pending.label === '' ? text.askSuspect : text.askWithTokensSuspect(pending.label)
      }
      return pending.label === '' ? text.ask : text.askWithTokens(pending.label)
    }

    /** 当前语言的文案表。 */
    function pickText(ctx) {
      try {
        const id = String(ctx.get('locale')?.getLocale?.()?.id ?? ctx.get('locale')?.getLocale?.()?.locale ?? '')
        return id.toLowerCase().startsWith('en') ? TEXT.en : TEXT.zh
      } catch {
        return TEXT.zh
      }
    }

    /** POST 一个 JSON，返回解析后的对象；网络或解析失败时返回 `{ok:false}`。 */
    async function postJson(path, body) {
      try {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify(body),
        })
        const payload = await response.json()
        return payload !== null && typeof payload === 'object' ? payload : { ok: false }
      } catch {
        return { ok: false }
      }
    }

    /**
     * 这条会话是不是「正在聊的这一条」。
     *
     * 两个条件同时成立才算：
     *   ① 主视图正持有它（`retainedBy.mainView > 0`）—— 侧栏判断当前会话用的就是这条；
     *   ② 眼下的界面是会话界面而不是设置、插件之类的全局面板（`panelActive === false`）。
     *
     * 现在它**不再用来禁止删除**（当前会话也能删），只用来决定删完之后要不要补一个空白会话。
     *
     * 后台网关（gateway）持有不算；`controllerOperation` 只出现在公开类型的来源名里，
     * 内核实现中没有用它表示「当前会话」，所以不拿它当依据。
     *
     * @param {{panelActive: boolean, retainedBy?: Record<string, number>}} facts - 该行的事实。
     * @returns {boolean} 正在聊为 true。
     */
    function isShownInPanel(facts) {
      if (facts.panelActive === true) return false
      const held = facts.retainedBy?.mainView
      return typeof held === 'number' && held > 0
    }

    /** 确认框的待办状态：谁要删、显示什么字。跨两个组件共享，所以放在工厂闭包里。 */
    const pendingStore = {
      current: null,
      listeners: new Set(),
      set(next) {
        pendingStore.current = next
        for (const listener of pendingStore.listeners) listener()
      },
      subscribe(listener) {
        pendingStore.listeners.add(listener)
        return () => pendingStore.listeners.delete(listener)
      },
      read() {
        return pendingStore.current
      },
    }

    const activeDeletes = new Set()
    const errorToastOwner = {}
    const deleteKey = (id) => id.startsWith('session-') ? id.slice(8) : id

    /** 一行里那个垃圾桶。悬停时由内核那一排自己显现，这里只负责判定与开框。 */
    function SessionDeleteAction(props) {
      const sessionId = String(props.sessionId ?? '')
      const [verdict, setVerdict] = react.useState(null)
      const [hovering, setHovering] = react.useState(false)
      const ctx = props.ctx

      // 悬停即问一次宿主要不要禁用；只有「可删」的答案值得记住。
      // 记死「还在跑」会让会话空闲后按钮依然是灰的——那正是之前的假灰。
      // force=true 时无视缓存强制重问（轮询用：可删之后会话又跑起来也要能发现）。
      const prefetch = (force) => {
        if (sessionId === '') return
        if (force !== true && canSkipCheck(verdict)) return
        void postJson(API_CHECK, { sessionId }).then((answer) => {
          if (answer.ok !== true) return
          setVerdict({ deletable: answer.deletable === true, reason: answer.reason ?? null })
        })
      }

      // 宿主说「还在跑」之后，等它跑完要自己解锁。两条路一起走：
      //   ① 悬停期间每 5 秒强制复核一次（不依赖任何服务，最稳）；
      //   ② 顺手订阅 DSH 的 api-session/status，状态一变立刻改判定（拿得到才订）。
      react.useEffect(() => {
        if (hovering !== true || sessionId === '') return undefined
        const timer = setInterval(() => prefetch(true), 5000)
        return () => clearInterval(timer)
      }, [hovering, sessionId, verdict])

      react.useEffect(() => {
        const remote = remoteOf(ctx)
        if (remote === undefined || typeof remote.$on !== 'function') return undefined
        let off
        try {
          off = remote.$on('api-session/status', (changedId, running) => {
            setVerdict((current) => applyStatus(current, changedId, running, sessionId))
          })
        } catch {
          return undefined
        }
        return typeof off === 'function' ? off : undefined
      }, [sessionId])

      // 主视图持有 + 会话界面正在展示，才算「正在聊的这一条」。两个 hook 都来自插槽的
      // standardProps，和内核侧栏判断当前会话用的是同一份数据。
      // 形状随内核版本变过，所以包了一层：取不到、抛错都当作「不是当前会话」，
      // 宁可少一个判定，也不能让整行渲染崩掉。
      const retainInfo = readRetainInfo(props, sessionId)
      const panelKey = readPanelKey(props)
      const panelKeyRef = react.useRef(panelKey)
      panelKeyRef.current = panelKey
      const mounted = react.useRef(true)
      react.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
      const panelActive = panelKey !== null && panelKey !== undefined
      react.useEffect(() => {
        const target = pendingStore.read()
        if (target && target.sessionId === sessionId && target.panelKey !== undefined && panelKey !== undefined && target.panelKey !== panelKey) pendingStore.set(null)
      }, [sessionId, panelKey])

      const isCurrent = sessionId !== '' && isShownInPanel({ panelActive, retainedBy: retainInfo?.retainedBy })
      const text = pickText(ctx)
      const reason = rowReason(verdict)
      const disabled = rowBlocked(verdict)
      const hint = {
        blank: text.reasonBlank,
        running: text.reasonRunning,
      }[reason] ?? text.action

      const press = (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (disabled || sessionId === '' || activeDeletes.has(deleteKey(sessionId))) return
        void postJson(API_CHECK, { sessionId }).then((answer) => {
          if (!mounted.current || (panelKey !== undefined && panelKeyRef.current !== panelKey)) return
          if (answer.ok !== true || answer.deletable !== true) {
            setVerdict({ deletable: false, reason: answer.reason ?? null })
            return
          }
          pendingStore.set(buildPending({
            sessionId,
            panelKey,
            wasCurrent: isCurrent,
            title: String(props.displayTitle ?? ''),
          }, answer, text))
        })
      }

      return h('button', {
        type: 'button',
        className: 'dsh-session-delete-action',
        'aria-label': text.trashLabel,
        'aria-disabled': disabled ? 'true' : undefined,
        disabled,
        title: hint,
        onMouseEnter: () => { setHovering(true); prefetch() },
        onMouseLeave: () => setHovering(false),
        onFocus: () => { setHovering(true); prefetch() },
        onBlur: () => setHovering(false),
        onClick: press,
      }, trashIcon())
    }

    /** 与行里其它按钮同一份 16px 描边风格。 */
    function trashIcon() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.8,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M4 7h16' }),
        h('path', { d: 'M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7' }),
        h('path', { d: 'M6.6 7l.8 11.4A2 2 0 0 0 9.4 20.4h5.2a2 2 0 0 0 2-1.9L17.4 7' }),
        h('path', { d: 'M10.4 11v5.4M13.6 11v5.4' }),
      )
    }

    /** 使用共享顶部提示确认；取消、卸载和页面切换不得触发删除。 */
    function ConfirmDialog(props) {
      const ctx = props.ctx
      const pending = react.useSyncExternalStore(pendingStore.subscribe, pendingStore.read)
      react.useEffect(() => () => window.__dshSettingsToastV1.cancel(errorToastOwner), [])
      react.useEffect(() => {
        if (pending === null) return undefined
        const target = pending
        const owner = {}
        const toast = window.__dshSettingsToastV1
        toast.activate(owner)
        let alive = true
        const cancel = () => { if (pendingStore.read() === target) pendingStore.set(null) }
        const visibility = () => { if (document.visibilityState === 'hidden') cancel() }
        window.addEventListener('pagehide', cancel)
        window.addEventListener('popstate', cancel)
        window.addEventListener('hashchange', cancel)
        document.addEventListener('visibilitychange', visibility)
        void (async () => {
          const confirmed = await toast.confirm(owner, questionFor(target, target.text), [target.text.confirm, target.text.cancel])
          if (!alive || pendingStore.read() !== target) return
          pendingStore.set(null)
          if (!confirmed) return
          const key = deleteKey(target.sessionId)
          if (activeDeletes.has(key)) return
          activeDeletes.add(key)
          try {
            const result = await postJson(API_DELETE, { sessionId: target.sessionId })
            if (result.ok !== true) {
              toast.activate(errorToastOwner)
              toast.show(errorToastOwner, 'error', target.text.deleteFailed)
              return
            }
            if (shouldStartSession(result, target)) startBlankSession(ctx)
          } finally {
            activeDeletes.delete(key)
          }
        })()
        return () => {
          alive = false
          toast.cancel(owner)
          window.removeEventListener('pagehide', cancel)
          window.removeEventListener('popstate', cancel)
          window.removeEventListener('hashchange', cancel)
          document.removeEventListener('visibilitychange', visibility)
        }
      }, [pending, ctx])
      return null
    }

    /** 行尾删除按钮的样式；颜色一律走内核主题变量，深浅色自动跟随。 */
    const CSS = [
      '.dsh-session-delete-action{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:16px;height:16px;padding:0;border:none;border-radius:var(--dsw-radius-xs);background:transparent;color:var(--dsw-alias-label-tertiary);line-height:1;cursor:pointer;transition:color .12s ease,background .12s ease;}',
      '.dsh-session-delete-action:hover{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger,transparent);}',
      '.dsh-session-delete-action:disabled{color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary));cursor:not-allowed;opacity:.45;}',
      '.dsh-session-delete-action:disabled:hover{background:transparent;}',
      '.dsh-session-delete-action:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px;}',
      '.dsh-session-delete-action svg{width:16px;height:16px;display:block;}',










    ].join('\n')

    /** 建（或复用）本插件唯一的样式表元素。 */
    function styleTag() {
      if (typeof document === 'undefined') return null
      const existing = document.getElementById(STYLE_ID)
      if (existing !== null) return existing
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.textContent = CSS
      ;(document.head ?? document.documentElement).appendChild(tag)
      return tag
    }

    function apply(ctx) {
      ctx.effect(() => {
        const tag = styleTag()
        return () => {
          if (tag !== null) tag.remove()
        }
      }, 'session-delete: stylesheet')

      ctx.inject(['slots'], (scope) => {
        const slots = scope.get('slots')
        if (slots === undefined || slots === null) return

        scope.effect(() => slots.inject(ROW_ACTION_SLOT, () => slots.register(
          { name: ROW_ACTION_SLOT, id: ROW_ACTION_ID, order: ROW_ACTION_ORDER },
          (props) => h(SessionDeleteAction, { ...props, ctx }),
        )))

        scope.effect(() => slots.inject(OVERLAY_SLOT, () => slots.register(
          { name: OVERLAY_SLOT, id: OVERLAY_ID, order: 40 },
          (props) => h(ConfirmDialog, { ...props, ctx }),
        )))
      })
    }

    const module = { exports: {} }
    module.exports.name = NS
    module.exports.apply = apply
    module.exports.__test__ = {
      isShownInPanel, canSkipCheck, rowReason, rowBlocked, shouldStartSession, applyStatus,
      buildPending, questionFor, TEXT,
    }
    return module.exports
  },
})
