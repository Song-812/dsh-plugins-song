// dsh-session-delete — 客户端半边。
//
// 两处界面：
//   1. 会话行末尾 hover 出现的一个垃圾桶（官方插槽 sidebar.workspaces.session.row.action，
//      与内核自己的 archive / pin 按钮同一排、同一份几何）；
//   2. 点下去之后的确认框（注册在 shell.overlay，帧级浮层，不被侧栏滚动容器裁切）。
//
// 刻意没有的东西：拖拽、吉祥物、台账、设置页、撤销按钮、全局提示条。
// 删成功就是那一行消失；删失败就是那一行还在。
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
        /* 打不开时主人可以自己点「新会话」 */
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
    function readPanelActive(props) {
      if (typeof props.usePanelInfo !== 'function') return false
      try {
        return props.usePanelInfo((info) => info.activePanelId !== null) === true
      } catch {
        return false
      }
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
      const panelActive = readPanelActive(props)

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
        if (disabled || sessionId === '') return
        void postJson(API_CHECK, { sessionId }).then((answer) => {
          if (answer.ok !== true || answer.deletable !== true) {
            setVerdict({ deletable: false, reason: answer.reason ?? null })
            return
          }
          pendingStore.set(buildPending({
            sessionId,
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

    /** 确认框：一句话（带 token）+ 取消 / 删除，默认焦点在取消。 */
    function ConfirmDialog(props) {
      const ctx = props.ctx
      const pending = react.useSyncExternalStore(pendingStore.subscribe, pendingStore.read)
      const [busy, setBusy] = react.useState(false)

      // 换一张确认框就重置忙碌态；Esc 只在不忙时能关（删除请求在飞时按 Esc 会留下
      // 一个已经提交、却看不见的删除，还可能被重复提交）。
      react.useEffect(() => {
        setBusy(false)
      }, [pending])

      react.useEffect(() => {
        if (pending === null || busy === true) return undefined
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          pendingStore.set(null)
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [pending, busy])

      if (pending === null) return null
      const text = pending.text
      // 回收站不可用时问句自带「将永久删除、无法找回」，其余时候保持原话术。
      const question = questionFor(pending, text)

      const confirm = async () => {
        if (busy) return
        // 记下自己这一张确认框：请求飞在路上时主人可能又开了另一张（删别的会话），
        // 旧响应不许把新确认框一起关掉。
        const target = pending
        setBusy(true)
        const result = await postJson(API_DELETE, { sessionId: target.sessionId })
        // 成功时那一行由 api-session/removed 广播摘掉；失败时它留在原地，
        // 这里都不再额外提示 —— 列表本身就是回执。
        if (pendingStore.read() === target) pendingStore.set(null)
        // 删掉的正是当前正在看的那条：界面不能停在一个已不存在的会话上，补一个空白会话。
        // 以点击确认框时的 wasCurrent 为准：宿主在返回 200 之前就会广播 api-session/removed，
        // 若此时再读 retainInfo，常已被清掉，误判成「不是当前」从而不开空白会话。
        // 中途切走仍可能偶发多开一个空白（见 README 已知限制）。
        const wasCurrent = result?.ok === true && target.wasCurrent === true
        if (shouldStartSession(result, { wasCurrent })) startBlankSession(ctx)
      }

      const cancel = () => {
        if (busy) return
        pendingStore.set(null)
      }

      return h('div', {
        className: 'dsh-session-delete-scrim',
        onClick: cancel,
      }, h('div', {
        className: 'dsh-session-delete-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': question,
        onClick: (event) => event.stopPropagation(),
      },
        h('p', { className: 'dsh-session-delete-question' }, question),
        h('div', { className: 'dsh-session-delete-actions' },
          h('button', {
            type: 'button',
            className: 'dsh-session-delete-btn',
            autoFocus: true,
            disabled: busy,
            onClick: cancel,
          }, text.cancel),
          h('button', {
            type: 'button',
            className: 'dsh-session-delete-btn dsh-session-delete-danger',
            disabled: busy,
            onClick: () => void confirm(),
          }, busy ? text.deleting : text.confirm)),
      ))
    }

    /** 按钮与确认框的样式；颜色一律走内核主题变量，深浅色自动跟随。 */
    const CSS = [
      '.dsh-session-delete-action{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:16px;height:16px;padding:0;border:none;border-radius:var(--dsw-radius-xs);background:transparent;color:var(--dsw-alias-label-tertiary);line-height:1;cursor:pointer;transition:color .12s ease,background .12s ease;}',
      '.dsh-session-delete-action:hover{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger,transparent);}',
      '.dsh-session-delete-action:disabled{color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary));cursor:not-allowed;opacity:.45;}',
      '.dsh-session-delete-action:disabled:hover{background:transparent;}',
      '.dsh-session-delete-action:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px;}',
      '.dsh-session-delete-action svg{width:16px;height:16px;display:block;}',
      '.dsh-session-delete-scrim{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:auto;background:var(--dsw-alias-bg-mask-1,rgba(8,10,16,.45));z-index:60;}',
      '.dsh-session-delete-dialog{width:376px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:17px 17px 13px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,transparent);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-2,#1b1e25));color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv3,0 24px 60px rgba(0,0,0,.45));font-family:var(--dsw-font-family,inherit);}',
      '.dsh-session-delete-question{margin:0 0 14px;font-size:13.5px;line-height:1.55;}',
      '.dsh-session-delete-actions{display:flex;justify-content:flex-end;gap:8px;}',
      '.dsh-session-delete-btn{height:30px;padding:0 14px;border:1px solid transparent;border-radius:7px;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer;background:var(--dsw-alias-button-ghost-active-fill,var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14)));color:var(--dsw-alias-label-primary);}',
      '.dsh-session-delete-btn:hover{background:var(--dsw-alias-interactive-bg-hover-solid,var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.22)));}',
      '.dsh-session-delete-btn:disabled{cursor:default;opacity:.6;}',
      '.dsh-session-delete-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#6b8afd);outline-offset:1px;}',
      '.dsh-session-delete-danger{background:var(--dsw-alias-state-error-primary,#c8393a);color:#fff;font-weight:600;}',
      '.dsh-session-delete-danger:hover{background:var(--dsw-alias-state-error-primary,#c8393a);filter:brightness(1.08);}',
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
