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

// dsh-global-rules 浏览器半边：在「设置」里挂一个「全局规则」页。
//
// 无构建写法：window.__ModuleLoader__.load({ id, factory })，
// id 必须与本包 package.json 的 name 逐字一致，否则客户端半边不会被送出。
// 读写规则正文的逻辑在宿主半边（lib/index.js），这里只管视图。
//
// 设计要点：
//   · 标题「全局规则」，字号字重与设置里其他插件页一致（17px / 700 / 字距 .06em）
//   · 顶部那行「编辑 ~/.dsh/AGENTS.md…」说明整行删掉，不再显示路径
//   · 右上角加「恢复默认」：点一下先问「整页恢复出厂？」，确认后把文件清成 0 字节
//     （宿主会先把旧规则备份，再清空）；确认框一直等到点选或离开设置页
//   · 提示只说结果（已保存 / 已清空 / 保存失败 / 读取失败 / 清空失败），不写技术原因
// 2026-10-26 卡片对齐：
//   · 一张「规则」卡，卡里直接放编辑器（无选项标题/说明）
//   · 「文件尚不存在…」保留，放保存按钮旁（与已保存等同位置，可互相替换）
//   · 「保存」与「恢复默认」用玻璃 inset 壳；顶距/字阶/卡片对齐其他插件页
window.__ModuleLoader__.load({
	id: "dsh-global-rules",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const h = react.createElement;
		const { useCallback, useEffect, useState, useRef } = react;

		// 模块名 / 本地化命名空间 / 设置页 id 都是这个；与宿主导出的 name 一致。
		const NS = "global-rules";

		// 宿主半边在 Connection 的 /api 围栏内注册这个精确路径。
		const API_PATH = "/api/global-rules";
		const inject = ["slots", "locale"];

		const DICTS = {
			zh: {
				label: "全局规则",
				cardTitle: "规则",
				reset: "恢复默认",
				confirmQuestion: "确定清空全局规则？",
				confirm: "确认",
				cancel: "取消",
				notExists: "文件尚不存在，保存将创建它。",
				loading: "加载中…",
				placeholder: "# 全局规则\n\n在这里编写对每个会话生效的指令…",
				save: "保存",
				saving: "保存中…",
				saved: "已保存",
				cleared: "已清空",
				saveFailed: "保存失败",
				readFailed: "读取失败",
				resetFailed: "清空失败",
				staleSuffix: "：文件已被其他窗口修改，请重新打开设置页",
			},
			en: {
				label: "Global Rules",
				cardTitle: "Rules",
				reset: "Restore defaults",
				confirmQuestion: "Clear all global rules?",
				confirm: "Confirm",
				cancel: "Cancel",
				notExists: "File does not exist yet; saving will create it.",
				loading: "Loading…",
				placeholder: "# Global Rules\n\nWrite instructions here that take effect across every session…",
				save: "Save",
				saving: "Saving…",
				saved: "Saved",
				cleared: "Cleared",
				saveFailed: "Save failed",
				readFailed: "Read failed",
				resetFailed: "Clear failed",
				staleSuffix: ": the file was changed in another window; reopen this page",
			},
		};

		// 手写包 import 不了别人的 CSS module，所以挂一段自己的 <style>。
		// 只引用 --dsw-alias-* 主题 token，深浅色都跟主题走；卡片/按钮对齐其他插件页。
		const CSS = `
.dgr-page { display: flex; flex-direction: column; gap: 8px; width: 100%; min-width: 0; box-sizing: border-box;
  color: var(--dsw-alias-label-primary); padding: 12px 0 14px; max-width: 600px; font-family: inherit; }
.dgr-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; margin: 0 0 4px; padding: 0; }
.dgr-title { font-size: 17px; font-weight: 700; line-height: 24px; margin: 0; letter-spacing: .06em; color: var(--dsw-alias-label-primary); }
.dgr-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dgr-card {
  border-radius: 12px; padding: 2px 18px 4px; margin: 0; min-width: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 34%, transparent);
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.dgr-card-title {
  font-family: inherit; font-size: 15px; font-weight: 650; line-height: 22px;
  margin: 0 0 18px; padding-top: 10px; letter-spacing: .05em;
  color: var(--dsw-alias-label-primary); }
.dgr-hint { margin: 0; font-size: 12px; line-height: 18px;
  color: color-mix(in srgb, var(--dsw-alias-label-secondary) 68%, transparent); }
.dgr-editor { width: 100%; min-height: 320px; box-sizing: border-box;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 13px; line-height: 1.5;
  padding: 12px; color: inherit; resize: vertical; border: 0; border-radius: var(--dsw-radius-md, 8px);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent);
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent), 0 1px 2px rgba(19,45,83,.06); }
.dgr-editor:focus { outline: none;
  box-shadow: inset 0 0 0 .5px var(--dsw-alias-brand-primary), 0 1px 2px rgba(19,45,83,.06); }
.dgr-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 0 10px; }
.dgr-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; flex: none;
  font-family: inherit; font-size: 13px; line-height: 20px; height: 32px; padding: 0 12px; white-space: nowrap;
  border-radius:var(--dsw-radius-md,8px); cursor: pointer; border: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent);
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent), 0 1px 2px rgba(19,45,83,.06);
  color: var(--dsw-alias-label-primary); transition: background .15s; }
.dgr-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dgr-btn:disabled { opacity: .45; cursor: default; }
.dgr-page :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
@media (max-width: 600px) { .dgr-actions { max-width: 100%; } .dgr-editor { min-height: 260px; } }
@media (prefers-reduced-motion: reduce) { .dgr-btn { transition: none; } }
`;

		function GlobalRulesSection(props) {
			const t = props.t;
			const [content, setContent] = useState("");
			const [loaded, setLoaded] = useState(false);
			const [exists, setExists] = useState(true);
			const [readFailed, setReadFailed] = useState(false);
			// 磁盘上那份内容的版本：保存时带回去，别的窗口改过就让宿主拒掉，不静默覆盖。
			const [version, setVersion] = useState("");
			const [busy, setBusy] = useState(false);
			const owner = useRef({}).current;
			const alive = useRef(true);
			const toast = window.__dshSettingsToastV1;
			useEffect(() => {
				alive.current = true;
				toast.activate(owner);
				return () => { alive.current = false; toast.cancel(owner); };
			}, [owner]);
			const setNotice = (notice) => { if (notice) toast.show(owner, notice.kind === 'ok' ? 'success' : 'error', notice.text); };

			useEffect(() => {
				let cancelled = false;
				fetch(API_PATH, { cache: "no-store" })
					.then((response) => {
						if (!response.ok) throw new Error("read-failed");
						return response.json();
					})
					.then((data) => {
						if (cancelled) return;
						setContent(String(data.content || ""));
						setVersion(String(data.version || ""));
						setExists(Boolean(data.exists));
						setLoaded(true);
					})
					.catch(() => {
						if (cancelled) return;
						// 读不到内容时绝不能让人再点保存/清空：编辑框是空的，一写就把真规则冲掉。
						setReadFailed(true);
						setNotice({ kind: "error", text: t("readFailed") });
						setLoaded(true);
					});
				return () => {
					cancelled = true;
				};
			}, []);

			/** 统一的写请求：成功显示一句结果，失败也只说不写原因。 */
			const send = useCallback((payload, onDone, okText, failText) => {
				if (!alive.current) return;
				setBusy(true);
				setNotice(null);
				fetch(API_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload),
				})
					.then(async (response) => {
						const data = await response.json().catch(() => ({}));
						if (!response.ok || data.ok !== true) throw new Error(response.status === 409 ? failText + t("staleSuffix") : failText);
						if (!alive.current) return;
						if (typeof data.version === "string") setVersion(data.version);
						onDone();
						setNotice({ kind: "ok", text: okText });
					})
					.catch((error) => {
						if (!alive.current) return;
						setNotice({ kind: "error", text: error.message || failText });
					})
					.finally(() => { if (alive.current) setBusy(false); });
			}, []);

			const save = () => send({ content, baseVersion: version }, () => setExists(true), t("saved"), t("saveFailed"));

			const reset = () => {
				send({ action: "reset", baseVersion: version }, () => {
					setContent("");
					// 版本号由 send 按宿主返回值更新（清空后的版本 = 空内容的版本），这里不能清成空串，
					// 否则下一次保存会带空 baseVersion，宿主直接放行、冲突保护失效。
					setExists(true);
				}, t("cleared"), t("resetFailed"));
			};

			const actions = [h("button", { key: "reset", type: "button", className: "dgr-btn", disabled: busy || !loaded || readFailed, onClick: async () => { if (await toast.confirm(owner, t("confirmQuestion"), [t("confirm"), t("cancel")])) reset(); } }, t("reset"))];

			return h("div", { className: "dgr-page" },
				h("style", { key: "css" }, CSS),
				h("div", { key: "head", className: "dgr-head" },
					h("h1", { key: "title", className: "dgr-title" }, t("label")),
					h("div", { key: "actions", className: "dgr-actions" }, actions),
				),
				h("div", { key: "card", className: "dgr-card" },
					h("h2", { key: "ct", className: "dgr-card-title" }, t("cardTitle")),
					!loaded ? h("p", { key: "loading", className: "dgr-hint" }, t("loading")) : h("textarea", {
						key: "editor",
						className: "dgr-editor",
						value: content,
						onChange: (event) => setContent(event.target.value),
						spellCheck: false,
						placeholder: t("placeholder"),
						"aria-label": t("label"),
						readOnly: readFailed || busy,
					}),
					h("div", { key: "foot", className: "dgr-foot" },
						h("button", {
							key: "save",
							type: "button",
							className: "dgr-btn",
							disabled: busy || !loaded || readFailed,
							onClick: save,
						}, busy ? t("saving") : t("save")),
						!exists ? h("span", { key: "notExists", className: "dgr-hint" }, t("notExists")) : null,
					),
				),
			);
		}

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, DICTS), "global-rules: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: NS,
				order: 21,
				locale: NS,
				label: () => t("label"),
			}, GlobalRulesSection));
		}

		exports.name = NS;
		exports.inject = inject;
		exports.apply = apply;
		exports.DICTS = DICTS;
		// ⚠️ 这一行不能删：factory 必须返回 exports，否则 DSH 拿不到模块、插件会致命退出。
		return module.exports;
	},
});
