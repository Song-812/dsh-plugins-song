// dsh-plugins-panel client bundle: registers the sidebar 「插件」 page, which
// takes the place of the shipped one in the sidebar while leaving that page
// itself untouched — its install / uninstall / configure / detail views stay
// reachable through the 「官方管理页」 button at the foot of this page.
// Hand-written __ModuleLoader__ factory (no build step). React, the UI
// primitives and the icons come from the loader's module table.
//
// The page mirrors other plugins’ sidebar pages:
// the same frame (centered 960px column, 20px/500 title, 13px secondary intro,
// top-right icon button) and the same card list (icon seat, display name,
// package name, one-line description, controls at the end), with the layout in
// one injected <style> tag; panel titles/descriptions are read-only.
//
// 两个分组：内置（DSH 自带）与自制（profile 里用 link: / file: 装的）。每行可
// 改名（原名退到副标题，清空即恢复）、可写一句自己的简介（清空即用官方那句）、
// 行首六点手柄按住可拖动排序（只在同组内）。组头可改名、可一键开关整组（方向
// 锁存、按组记忆）、可折叠（按组记忆）。
//
// Enable/disable is NOT a file edit: it calls the shipped
// remote.pluginManager.setPluginEnabled(entryId, enabled) Remote, which persists
// the row's override and hot-reloads the row. Only a row the Remote reports as
// addressable (carrying a patchId and no readOnlyReason) can be switched.
window.__ModuleLoader__.load({ id: "dsh-plugins-panel", factory: (require) => {

	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	const react = require("react");
	const h = react.createElement;
	/** Counts the complete group; search only changes the rows below it. */
	function GroupStatus({ items, loading, synced, t }) {
		const off = items.filter((item) => item.enabled === false).length;
		return h("span", { className: "plp-groupStatus" },
			h("span", { className: "plp-count" }, t("summary", { total: items.length, off })),
			h("span", { className: !loading && synced === true ? "plp-statusOk" : "plp-statusWarn", role: "status" },
				h("span", { className: "plp-dot" }),
				loading ? t("loading") : synced === true ? t("synced") : t("unsynced")),
		);
	}

	const { useState, useEffect, useCallback, useRef, useLayoutEffect } = react;
	/** Older React builds have no layout effect; falling back keeps the page alive. */
	const useLayout = typeof useLayoutEffect === "function" ? useLayoutEffect : useEffect;

	/** UI primitives the page prefers; each has a plain fallback below. */
	let primitives = {};
	try {
		primitives = require("@deepseek-ai/dsh-client-ui-primitives");
	} catch {
		primitives = {};
	}

	const NS = "plugins-panel";
	/** Nav id and the keyed `main` key must be identical; one addresses the other. */
	const PANEL_ID = "dsh-plugins-panel";
	const API_PATH = "/api/plugins-panel";
	/** `remote.pluginManager` answers the row inventory and the enable/disable call. */
	const inject = ["slots", "locale", "remote", "remote.pluginManager"];
	/** The nav sits just after the shipped plugins entry (order 0), before related sidebar pages. */
	const PANEL_ORDER = 0.1;

	//#region styles

	const CSS = [
		// Page gap stays 32px; only adjacent groups gain 16px (48px total).
		".plp-page > .plp-group + .plp-group{margin-top:16px}",
		".plp-group[data-lifted]{opacity:.98;position:relative;z-index:5;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover));box-shadow:0 12px 28px rgba(0,0,0,.24),inset 0 0 0 1px var(--dsw-alias-brand-primary,#2f81f7);will-change:transform}",
		".plp-groupGrip{align-self:center}",
		".plp-groupHeadSplit + .plp-cards,.plp-groupHeadSplit + .plp-empty{margin-top:24px}",
		".plp-resetBtn:hover:not(:disabled),.plp-collapseBtn:hover:not(:disabled),.plp-iconButton:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 96%,transparent);color:var(--dsw-alias-label-primary)}",
		".plp-subhead{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0;width:100%}",
		".plp-resetBtn,.plp-collapseBtn,.plp-iconButton{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;font-family:inherit;font-size:13px;line-height:20px;font-weight:400;height:32px;white-space:nowrap;border-radius:8px;border:0;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent),0 1px 2px rgba(19,45,83,.06);color:var(--dsw-alias-label-primary);transition:background .15s}",
		".plp-resetBtn:disabled,.plp-collapseBtn:disabled,.plp-iconButton:disabled{opacity:.45;cursor:default}",
		".plp-search input{height:32px!important}",
		".plp-groupTitle{overflow-wrap:anywhere}",
		".plp-groupStatus{display:inline-flex;align-items:center;gap:8px 12px;flex-wrap:wrap;font-size:12px;line-height:20px}",
		".plp-groupStatus .plp-count{font-size:12px;white-space:nowrap}",
		".plp-page{box-sizing:border-box;height:100%;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;align-items:center;gap:32px;padding:0 clamp(24px,4vw,48px) 48px;overflow:auto}",
		".plp-page>*{width:100%;max-width:960px}",
		".plp-head{box-sizing:border-box;display:flex;flex-direction:column;gap:4px;padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}",
		".plp-title{margin:0;font-size:20px;font-weight:500;line-height:28px}",
		".plp-intro{margin:0;min-width:0;flex:1;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
		".plp-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex:none}",
		".plp-search{width:200px;height:32px;flex:none;box-sizing:border-box}",
		".plp-search input{font:inherit;font-size:13px;font-weight:400;color:var(--dsw-alias-label-primary)}",
		".plp-search input::placeholder{color:var(--dsw-alias-label-tertiary);opacity:1}",
		".plp-iconButton{width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;flex:none;cursor:pointer}",
		".plp-iconWrap{display:inline-flex}",
		".plp-status{margin:0;display:flex;align-items:center;flex-wrap:wrap;gap:6px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:13px;line-height:20px}",
		".plp-dot{width:7px;height:7px;border-radius:50%;flex:none;background:currentColor}",
		".plp-statusOk{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));display:inline-flex;align-items:center;gap:6px}",
		".plp-statusWarn{color:var(--dsw-alias-state-warn-primary,#e0a458);display:inline-flex;align-items:center;gap:6px}",
		".plp-group{display:flex;flex-direction:column;gap:8px}",
		".plp-groupHead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}",
		".plp-groupTitle{margin:0;font-size:16px;font-weight:500;line-height:24px}",
		".plp-count{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums;font-size:14px}",
		".plp-cards{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px}",
		".plp-card{margin:0 -8px;border-radius:var(--dsw-radius-xl,12px)}",
		".plp-card:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}",
		".plp-cardHead{box-sizing:border-box;display:flex;align-items:center;gap:14px;padding:8px;min-height:80px}",
		".plp-cardIcon{position:relative;width:40px;height:40px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1));border-radius:var(--dsw-radius-md,8px);color:var(--dsw-alias-label-secondary)}",
		".plp-cardIconImg{position:absolute;left:50%;top:50%;width:20px;height:20px;object-fit:contain;transform:translate(-50%,-50%);border-radius:4px}",
		".plp-cardMain{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}",
		".plp-titleRow{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}",
		".plp-name{font-size:14px;font-weight:500;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		".plp-card[data-state=off] .plp-name{color:var(--dsw-alias-label-secondary)}",
		".plp-sub{margin:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		".plp-note{margin:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px;overflow-wrap:anywhere}",
		".plp-reason{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;overflow-wrap:anywhere}",
		".plp-ok{margin:0;color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px}",
		".plp-cardEnd{display:inline-flex;align-items:center;gap:10px;flex:none}",
		".plp-dotSlot{width:10px;height:10px;flex:none;display:inline-flex;align-items:center;justify-content:center}",
		".plp-stateUp{color:var(--dsw-alias-state-success-primary,#3fa46a)}",
		".plp-stateDown{color:var(--dsw-alias-state-warn-primary,#e0a458)}",
		".plp-stateOff{color:var(--dsw-alias-state-idle-primary,var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary)))}",
		".plp-stateFailed{color:var(--dsw-alias-state-error-primary)}",
		".plp-empty{margin:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:13px;line-height:20px}",
		".plp-groupHeadSplit{align-items:center;flex-wrap:wrap}",
		".plp-groupActions{margin-left:auto;display:flex;align-items:center;gap:10px;flex:none}",
		".plp-lead{display:inline-flex;align-items:center;gap:1px;flex:none}",
		".plp-grip{width:22px;height:24px;flex:none;padding:0;display:inline-flex;align-items:center;justify-content:center;border:0;background:0 0;border-radius:var(--dsw-radius-sm,4px);color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));opacity:.45;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}",
		".plp-grip{touch-action:none;cursor:grab}",
		".plp-grip:active{cursor:grabbing}",
		".plp-card:hover .plp-grip,.plp-groupHead:hover .plp-grip,.plp-grip:focus-visible{opacity:1;color:var(--dsw-alias-label-secondary)}",
		".plp-collapseBtn{display:inline-flex;align-items:center;gap:4px;padding:0 12px;cursor:pointer}",
		".plp-resetBtn{padding:0 12px;cursor:pointer}",
		".plp-card[data-dragging]{opacity:.85;position:relative;z-index:1;background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));box-shadow:0 6px 18px rgba(0,0,0,.18),inset 0 0 0 1px var(--dsw-alias-brand-primary,#2f81f7)}",
		// The picked-up look: the row floats above the list while it is dragged and
		// eases back down on release.
		".plp-card[data-lifted]{opacity:.98;position:relative;z-index:5;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover));box-shadow:0 12px 28px rgba(0,0,0,.24),inset 0 0 0 1px var(--dsw-alias-brand-primary,#2f81f7);will-change:transform}",
		".plp-dragChip{display:inline-flex;align-items:center;height:18px;flex:none;padding:0 7px;border-radius:9px;background:var(--dsw-alias-brand-primary,#2f81f7);color:var(--dsw-alias-label-primary-foreground);font-size:11px;line-height:1;white-space:nowrap}",
		".plp-card[data-drop=into]{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary,#2f81f7)}",
		".plp-chevron{display:inline-flex;transition:transform .15s ease}",
		".plp-main{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}",
		".plp-nameRow{display:flex;align-items:baseline;gap:6px;min-width:0}",
		".plp-namePlain{font-weight:500}",
		".plp-version{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums}",
		".plp-descRow{display:flex;align-items:center;gap:6px;min-width:0;margin-top:0}",
		".plp-desc{flex:1 1 auto;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		".plp-descEmpty{opacity:.6}",
		".plp-descInput{width:min(520px,100%);font-size:12px;font-weight:400;line-height:18px}",
			".plp-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
].join("");

	/**
	 * Single-group specialization of the skills sidebar's group drag:
	 * immediate mouse pickup, touch hold, arithmetic follow, edge scroll and settle.
	 * These pages have one group, so release never writes a card/group order.
	 */
	function GroupGrip({ t }) {
		const lifecycle = useRef({ hold: null, settling: null });
		const resetElement = (element) => {
			element.style.transition = "";
			element.style.transform = "";
			element.removeAttribute("data-lifted");
			element.removeAttribute("data-dragging");
		};
		const clearSettling = () => {
			const settling = lifecycle.current.settling;
			if (settling === null) return;
			clearTimeout(settling.timer);
			if (settling.frame !== undefined && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(settling.frame);
			resetElement(settling.element);
			lifecycle.current.settling = null;
		};
		const finish = (animate) => {
			const hold = lifecycle.current.hold;
			if (hold === null) return;
			lifecycle.current.hold = null;
			if (hold.timer !== undefined) clearTimeout(hold.timer);
			if (hold.frame !== undefined && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(hold.frame);
			window.removeEventListener("pointermove", hold.move);
			window.removeEventListener("pointerup", hold.release);
			window.removeEventListener("pointercancel", hold.release);
			window.removeEventListener("scroll", hold.onScroll, true);
			window.removeEventListener("blur", hold.cancel);
			if (hold.active) {
				for (const [name, value] of [["user-select", hold.previousSelect], ["cursor", hold.previousCursor]]) {
					if (value === "" || value === undefined) document.body.style.removeProperty(name);
					else document.body.style[name === "user-select" ? "userSelect" : name] = value;
				}
			}
			try { hold.grip.releasePointerCapture(hold.pointerId); } catch { /* Capture may already be lost. */ }
			hold.element.removeAttribute("data-lifted");
			hold.element.removeAttribute("data-dragging");
			if (!animate || !hold.active) { resetElement(hold.element); return; }
			// Same 240ms ease-out / 340ms cleanup as the skills page's settleElement.
			hold.element.style.transition = "transform .24s ease-out, box-shadow .24s ease-out";
			const settling = { element: hold.element, frame: undefined, timer: undefined };
			lifecycle.current.settling = settling;
			const land = () => {
				if (lifecycle.current.settling === settling) hold.element.style.transform = "translateY(0px) scale(1)";
			};
			if (typeof window.requestAnimationFrame === "function") settling.frame = window.requestAnimationFrame(land);
			else land();
			settling.timer = setTimeout(() => {
				if (lifecycle.current.settling !== settling) return;
				resetElement(hold.element);
				lifecycle.current.settling = null;
			}, 340);
		};
		useEffect(() => () => { finish(false); clearSettling(); }, []);
		const gripDown = (event) => {
			if (typeof event.button === "number" && event.button !== 0) return;
			const element = event.currentTarget.closest("section.plp-group");
			if (element === null) return;
			finish(false);
			clearSettling();
			event.preventDefault();
			let scroller = element.parentElement;
			while (scroller !== null && scroller !== undefined && scroller.scrollHeight <= scroller.clientHeight + 4) scroller = scroller.parentElement;
			if (scroller === null || scroller === undefined) scroller = document.scrollingElement ?? null;
			const hold = {
				element, scroller, grip: event.currentTarget, pointerId: event.pointerId,
				startX: event.clientX, startY: event.clientY, lastY: event.clientY,
				scrollTop0: scroller === null ? 0 : scroller.scrollTop,
				active: false, timer: undefined, frame: undefined,
			};
			// Like the skills page, use grab-time arithmetic, never an animated rect.
			const updateFollow = () => {
				const scrollShift = hold.scroller === null ? 0 : hold.scroller.scrollTop - hold.scrollTop0;
				const dy = hold.lastY - hold.startY + scrollShift;
				hold.element.style.transition = FOLLOW_TRANSITION;
				hold.element.style.transform = `translateY(${dy}px) scale(1.01)`;
			};
			const autoScroll = () => {
				const scroller = hold.scroller;
				if (scroller === null || typeof scroller.getBoundingClientRect !== "function") return;
				const rect = scroller.getBoundingClientRect();
				let delta = 0;
				if (hold.lastY < rect.top + EDGE_ZONE) delta = -Math.ceil(((rect.top + EDGE_ZONE - hold.lastY) / EDGE_ZONE) * EDGE_SPEED);
				else if (hold.lastY > rect.bottom - EDGE_ZONE) delta = Math.ceil(((hold.lastY - (rect.bottom - EDGE_ZONE)) / EDGE_ZONE) * EDGE_SPEED);
				if (delta === 0) return;
				const before = scroller.scrollTop;
				scroller.scrollTop = before + delta;
				if (scroller.scrollTop !== before) updateFollow();
			};
			hold.move = (moveEvent) => {
				if (moveEvent.pointerId !== hold.pointerId) return;
				if (!hold.active) {
					if (Math.abs(moveEvent.clientX - hold.startX) > 10 || Math.abs(moveEvent.clientY - hold.startY) > 10) finish(false);
					return;
				}
				moveEvent.preventDefault();
				hold.lastY = moveEvent.clientY;
				updateFollow();
			};
			hold.release = (releaseEvent) => {
				if (releaseEvent.pointerId === hold.pointerId) finish(true);
			};
			hold.cancel = () => finish(false);
			hold.onScroll = () => { if (hold.active) updateFollow(); };
			lifecycle.current.hold = hold;
			const arm = () => {
				if (lifecycle.current.hold !== hold) return;
				hold.active = true;
				hold.previousSelect = document.body.style.userSelect;
				hold.previousCursor = document.body.style.cursor;
				document.body.style.userSelect = "none";
				document.body.style.cursor = "grabbing";
				element.setAttribute("data-lifted", "");
				element.setAttribute("data-dragging", "");
				element.style.transition = "none";
				element.style.transform = "translateY(0px) scale(1)";
				const grow = () => {
					if (lifecycle.current.hold !== hold) return;
					// A move can arrive before this animation frame; never reset its offset.
					if (hold.lastY !== hold.startY || (hold.scroller !== null && hold.scroller.scrollTop !== hold.scrollTop0)) updateFollow();
					else {
						element.style.transition = "transform .18s ease, box-shadow .2s ease";
						element.style.transform = "translateY(0px) scale(1.01)";
					}
				};
				try { hold.grip.setPointerCapture(hold.pointerId); } catch { /* Window listeners still track synthetic pointers. */ }
				if (typeof window.requestAnimationFrame === "function") {
					const tick = () => {
						if (lifecycle.current.hold !== hold || !hold.active) return;
						autoScroll();
						hold.frame = window.requestAnimationFrame(tick);
					};
					// The grow frame is part of the same cancellable loop.
					hold.frame = window.requestAnimationFrame(() => { grow(); tick(); });
				} else grow();
				window.addEventListener("scroll", hold.onScroll, true);
			};
			window.addEventListener("pointermove", hold.move);
			window.addEventListener("pointerup", hold.release);
			window.addEventListener("pointercancel", hold.release);
			window.addEventListener("blur", hold.cancel);
			if (event.pointerType === "touch") hold.timer = setTimeout(arm, HOLD_MS);
			else arm();
		};
		return h("button", {
			type: "button", className: "plp-grip plp-groupGrip",
			"aria-label": t("reorder"), title: t("reorder"), onPointerDown: gripDown,
		}, h(HandleGlyph, null));
	}

	/** Install the stylesheet once, following the module system's convention. */
	function ensureCss() {
		if (typeof document === "undefined") return;
		const tagId = `${NS}/client.css`;
		if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) !== null) return;
		const tag = document.createElement("style");
		tag.dataset.plugin = NS;
		tag.dataset.pluginCss = tagId;
		tag.textContent = CSS;
		document.head.appendChild(tag);
	}

	//#endregion

	const DICTS = {
		zh: {
			panel: "插件",
			title: "插件",
			intro: "安装、启用和配置插件",
			refresh: "刷新",
			group: "插件",
			groupBuiltin: "内置插件",
			groupSelf: "自制插件",
			locked: "这个插件不能从这里停用（由 DSH 自己管理）",
			builtinLocked: "DSH 内置条目，本面板不提供开关",
			enable: "启用",
			disable: "停用",
			summary: "共 {total} 个 · 已关闭 {off} 个",
			loading: "读取中…",
			synced: "已同步",
			unsynced: "未同步",
			empty: "还没有读到任何插件。",
			enabled: "已启用",
			disabled: "已停用",
			failed: "启动失败",
			applied: "已生效",
			busy: "处理中…",
			writeFailed: "失败：{message}",
			notApplied: "没生效：DSH 里这一行仍然是{state}",
			overridden: "没生效：这一行被别的东西覆盖了",
			restartNeeded: "改动未即时生效，需要重启 DSH",
			loadFailed: "读取失败：{message}",
			readFailed: "读取失败：{message}",
			unknownError: "未知错误",
			authFailed: "会话未通过鉴权，请刷新页面后重试",
			badAnswer: "DSH 接口返回了看不懂的结果",
			cancelled: "没生效：这次改动被取消了",
			reorder: "按住拖动排序",
			dragging: "拖动中…",
			edit: "改名",
			editHint: "自定义名称（留空恢复原名）",
			collapse: "折叠",
			expand: "展开",
			knobOn: "一键启用本组全部",
			knobOff: "一键停用本组全部",
			bulkDone: "已切换 {ok} 个",
			bulkDoneSkip: "已切换 {ok} 个 · 跳过 {skip} 个",
			reset: "恢复默认",
			resetConfirm: "恢复默认会清掉这一页的自定义名称、分组名、排序和折叠状态，继续吗？",
			search: "搜索插件",
			editDesc: "改简介",
			descHint: "自己写一句简介（留空恢复官方简介）",
			descEmpty: "（没有简介）",
			noMatch: "没有匹配的插件（共 {total} 个）",
			saveFailed: "保存失败：{message}",
			saveNeedsRestart: "保存没生效（HTTP {status}）：宿主半边还是旧版本，重启一次 DSH 就好",
			prefsFailed: "偏好接口失败：{message}",
			selfMadeUnknown: "无法识别自制插件名单，侧栏可能为空；请重启 DSH 或检查 profile",
			patchFile: "官方管理页",
			jumpUnsupported: "当前 DSH 版本不支持直达",
		},
		en: {
			panel: "Plugins",
			title: "Plugins",
			intro: "Install, enable, and configure plugins",
			refresh: "Refresh",
			group: "Plugins",
			groupBuiltin: "Built-in",
			groupSelf: "Mine",
			locked: "This plugin cannot be disabled from here (managed by DSH itself)",
			builtinLocked: "DSH built-in entry — this panel offers no switch",
			enable: "Enable",
			disable: "Disable",
			summary: "{total} total · {off} off",
			loading: "Loading…",
			synced: "Synced",
			unsynced: "Not synced",
			empty: "No plugin was read.",
			enabled: "enabled",
			disabled: "disabled",
			failed: "failed to start",
			applied: "Applied",
			busy: "Working…",
			writeFailed: "Failed: {message}",
			notApplied: "Did not take effect: DSH still reports it {state}",
			overridden: "Did not take effect: another layer overrides this row",
			restartNeeded: "The change did not apply immediately; a DSH restart is required",
			loadFailed: "Failed to read: {message}",
			readFailed: "Failed to read: {message}",
			unknownError: "Unknown error",
			authFailed: "Session authentication failed, please refresh the page and try again",
			badAnswer: "The DSH interface returned an unexpected answer",
			cancelled: "Did not take effect: the change was cancelled",
			reorder: "Hold and drag to sort",
			dragging: "Dragging…",
			edit: "Rename",
			editHint: "Custom title (empty restores the original)",
			collapse: "Collapse",
			expand: "Expand",
			knobOn: "Enable everything in this group",
			knobOff: "Disable everything in this group",
			bulkDone: "Switched {ok}",
			bulkDoneSkip: "Switched {ok} · skipped {skip}",
			reset: "Reset",
			resetConfirm: "Reset clears this page's custom titles, group names, order and collapsed state. Continue?",
			search: "Search plugins",
			editDesc: "Edit description",
			descHint: "Your own one-line description (empty restores the shipped one)",
			descEmpty: "(no description)",
			noMatch: "No plugin matches (of {total})",
			saveFailed: "Save failed: {message}",
			saveNeedsRestart: "Not saved (HTTP {status}): the host half is still the old build — restart DSH once",
			prefsFailed: "Preferences request failed: {message}",
			selfMadeUnknown: "Could not identify self-made plugins; the list may be empty — restart DSH or check the profile",
			patchFile: "Official manager",
			jumpUnsupported: "This DSH version does not support opening it directly",
		},
	};

	/**
	 * Unwrap one shipped Remote answer.
	 *
	 * Every method declared `@Remote` resolves to an ENVELOPE — `{ ok: true, value }`
	 * or `{ ok: false, error: { message } }` — never to the payload itself. Reading
	 * the envelope as the payload is what made this page report
	 * "(inventory ?? []).filter is not a function" while the host half was fine.
	 * The shipped plugins page does the same thing (`if (!plugins.ok) ...;
	 * plugins.value`), so this mirrors it instead of guessing.
	 */
	function readAnswer(answer) {
		if (answer === null || typeof answer !== "object" || typeof answer.ok !== "boolean") return { ok: false, reason: "malformed" };
		if (answer.ok !== true) {
			const error = answer.error === null || answer.error === undefined ? undefined : answer.error.message;
			return { ok: false, reason: typeof error === "string" && error !== "" ? error : "refused" };
		}
		return { ok: true, value: answer.value };
	}

	/**
	 * One metadata text out of the shipped inventory. meta.title and
	 * meta.description are either a plain string or a locale record ({ en, zh, ... });
	 * prefer the locale service's own resolver, and fall back to a structural read so
	 * the page can never blank out when that resolver is absent.
	 */
	/** npm 包名去掉 `@作者/` 前缀后的短名（与 DSH 设置页的 moduleShortName 同思路）。 */
	function shortPackageName(name) {
		const at = name.indexOf("/");
		return name.startsWith("@") && at >= 0 ? name.slice(at + 1) : name;
	}
	/** 按当前界面语言从「字符串或 { en, zh, … } 记录」里取文案，与官方插件页同一套行为。 */
	function localeText(ctx, value) {
		if (typeof value === "string") return value;
		if (value === null || typeof value !== "object" || Array.isArray(value)) return "";
		// locale 服务暴露的是 getLocale()（快照里的 active 就是当前语言），并没有 resolveText。
		let active = "";
		try {
			const locale = typeof ctx.get === "function" ? ctx.get("locale") : undefined;
			if (locale !== undefined && locale !== null && typeof locale.getLocale === "function") {
				const snapshot = locale.getLocale();
				if (snapshot !== null && typeof snapshot === "object" && typeof snapshot.active === "string") active = snapshot.active;
			}
		} catch {
			// 取不到当前语言就往下退，绝不因此让页面空掉。
		}
		if (active !== "") {
			const lower = active.toLowerCase();
			const exact = value[lower];
			if (typeof exact === "string" && exact !== "") return exact;
			const primary = lower.split("-")[0];
			for (const [key, item] of Object.entries(value)) {
				if (typeof item !== "string" || item === "") continue;
				const name = key.toLowerCase();
				if (name === primary || name.startsWith(primary + "-")) return item;
			}
		}
		if (typeof value.en === "string") return value.en;
		for (const item of Object.values(value)) if (typeof item === "string") return item;
		return "";
	}

	/** The live row inventory, or a thrown error saying why it is unknown. */
	async function listRows(ctx, t) {
		const answer = readAnswer(await ctx.remote.pluginManager.listPlugins());
		if (!answer.ok) throw new Error(answer.reason === "malformed" || answer.reason === "refused" ? t("badAnswer") : answer.reason);
		if (!Array.isArray(answer.value)) throw new Error(t("badAnswer"));
		return answer.value;
	}

	//#region display preferences

	/**
	 * The follow easing. Short on purpose: a longer ease made the row feel like it
	 * was lagging behind the pointer, which reads as "not smooth" even though it is
	 * technically animated.
	 */
	/**
 * 跟随指针时**不能**留过渡：曾经的 `transform 90ms ease-out` 会让指针每移动一次就
 * 把目标位置往后推一次，过渡永远走不完 —— 快拖时行越落越远，松手还停在半路。
 * 这里刻意是 none（1:1 跟手）；落位与让位动画分别由 settleRow / FLIP 自己设过渡。
 */
const FOLLOW_TRANSITION = "none";

	/** How close to the edge of the scrolling area a drag starts auto-scrolling. */
	const EDGE_ZONE = 56;
	/** The fastest auto-scroll, in pixels per frame. */
	const EDGE_SPEED = 14;
	/** Hold this long on a grip to arm a drag on touch; a mouse arms at once. */
	const HOLD_MS = 300;

	/** Every group the page arranges, in the order they are drawn. */
	const GROUP_IDS = ["builtin", "self"];
	/**
	 * 面板实际列出来的组。
	 *
	 * 内置组（DSH 自己的包与内部条目）整组不显示：这些行被拨动时，官方管理器会按 patchId
	 * 把条目写进 profile 的 patch 文件并尝试热重载 —— 2026-10-11 因此写进 26 条冗余目标并
	 * 刷出一堆报错。要看它们、要装要卸，走「官方管理页」。
	 * 偏好结构仍然按 GROUP_IDS 走，已有的 builtin 键原样保留，将来想恢复显示改这里即可。
	 */
	const GROUP_VISIBLE = ["self"];

	function defaultPrefs() {
		return { titles: {}, desc: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} };
	}

	/** A { key: "text" } map: values trimmed, empty entries simply absent. */
	function readNames(raw) {
		const out = {};
		if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
		for (const [key, value] of Object.entries(raw)) {
			if (typeof value !== "string") continue;
			const name = value.trim();
			if (name !== "") out[key] = name;
		}
		return out;
	}

	/**
	 * The panel's own preferences, normalised. The host half owns the stored copy;
	 * an older host that does not report prefs yet simply yields the defaults, so
	 * the page keeps working before DSH is restarted.
	 *
	 * The shape is the group-aware one the host half sanitises:
	 *   titles / desc   row id -> text (this panel only; never the model)
	 *   groupTitles     group id -> group name
	 *   order           group id -> row id list
	 *   collapsed       group id -> true (absent means open)
	 *   bulk            group id -> boolean (the knob's latched direction)
	 */
	function normalizePrefs(raw) {
		const prefs = defaultPrefs();
		if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return prefs;
		const takeNames = (value, max = 200) => {
			const out = {};
			let count = 0;
			for (const [key, item] of Object.entries(readNames(value))) {
				if (count >= max) break;
				out[key.slice(0, 200)] = item.slice(0, 300);
				count += 1;
			}
			return out;
		};
		prefs.titles = takeNames(raw.titles);
		prefs.desc = takeNames(raw.desc);
		prefs.groupTitles = takeNames(raw.groupTitles);
		if (raw.order !== null && typeof raw.order === "object" && !Array.isArray(raw.order)) {
			let groups = 0;
			for (const [key, value] of Object.entries(raw.order)) {
				if (groups >= 20) break;
				if (!Array.isArray(value)) continue;
				const items = value.filter((item) => typeof item === "string" && item !== "").slice(0, 200).map((item) => item.slice(0, 200));
				if (items.length === 0) continue;
				prefs.order[key.slice(0, 200)] = items;
				groups += 1;
			}
		}
		if (raw.collapsed !== null && typeof raw.collapsed === "object" && !Array.isArray(raw.collapsed)) {
			let count = 0;
			for (const [key, value] of Object.entries(raw.collapsed)) {
				if (count >= 200) break;
				if (value === true) { prefs.collapsed[key.slice(0, 200)] = true; count += 1; }
			}
		}
		if (raw.bulk !== null && typeof raw.bulk === "object" && !Array.isArray(raw.bulk)) {
			let count = 0;
			for (const [key, value] of Object.entries(raw.bulk)) {
				if (count >= 200) break;
				if (value === true || value === false) { prefs.bulk[key.slice(0, 200)] = value; count += 1; }
			}
		}
		return prefs;
	}
	/**
	 * Apply the saved order. Each group keeps its own list, and plugin ids are unique
	 * across groups, so one rank map built from every group's list is enough: rows the
	 * page has seen keep the saved sequence, rows it has never seen (a plugin
	 * installed since) stay at their group's end in their default order.
	 */
	function applyOrder(list, prefs) {
		const rank = new Map();
		for (const ids of Object.values(prefs.order === null || typeof prefs.order !== "object" ? {} : prefs.order)) {
			if (!Array.isArray(ids)) continue;
			for (const [index, id] of ids.entries()) if (!rank.has(id)) rank.set(id, index);
		}
		if (rank.size === 0) return list;
		const known = list.filter((item) => rank.has(item.id)).sort((left, right) => rank.get(left.id) - rank.get(right.id));
		const rest = list.filter((item) => !rank.has(item.id));
		return [...known, ...rest];
	}
	/**
	 * Draw `items` in the order `ids` gives, appending anything the list does not
	 * mention (a row that appeared mid-drag must not vanish).
	 */
	function reorderBy(ids, items) {
		const byId = new Map(items.map((item) => [item.id, item]));
		const ordered = ids.map((id) => byId.get(id)).filter((item) => item !== undefined);
		const seen = new Set(ordered.map((item) => item.id));
		return [...ordered, ...items.filter((item) => !seen.has(item.id))];
	}

	/**
	 * Row tops by id (plus the picked-up row's own top), captured just before a
	 * live reorder so the FLIP pass can animate what moved.
	 */
	function snapshotTops(elements, draggedId) {
		const tops = new Map();
		let draggedTop;
		for (const [id, element] of elements) {
			if (element === null || element === undefined || typeof element.getBoundingClientRect !== "function") continue;
			const top = element.getBoundingClientRect().top;
			if (id === draggedId) draggedTop = top;
			else tops.set(id, top);
		}
		return { tops, draggedTop };
	}

	//#endregion

	//#region primitive fallbacks

	function LocalSwitch({ checked, onChange, label, disabled, title }) {
		return h("button", {
			type: "button", role: "switch", "aria-checked": checked, "aria-label": label, title, disabled,
			onClick: () => { if (!disabled) onChange(!checked); },
			style: {
				position: "relative", width: "36px", height: "20px", flex: "0 0 auto", padding: 0, border: "none",
				borderRadius: "10px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
				background: checked ? "var(--dsw-alias-brand-primary, #2f81f7)" : "rgba(128,128,128,0.35)",
			},
		}, h("span", {
			style: { position: "absolute", top: "2px", left: checked ? "18px" : "2px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff" },
		}));
	}

	function LocalTooltip({ label, children }) {
		return h("span", { title: label, style: { display: "inline-flex" } }, children);
	}

	/** The search box, spelled the same way the skills page spells it. */
	function LocalInput({ icon, className, ...rest }) {
		return h("span", { className, style: { display: "inline-flex", alignItems: "center" } },
			h("input", {
				...rest,
				style: {
					width: "100%",
					height: "32px",
					boxSizing: "border-box",
					padding: "0 10px",
					fontSize: "13px",
					color: "inherit",
					background: "transparent",
					border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
					borderRadius: "8px",
				},
			}));
	}

	const SwitchControl = primitives.Switch === undefined ? LocalSwitch : primitives.Switch;
	const TooltipControl = primitives.Tooltip === undefined ? LocalTooltip : primitives.Tooltip;
	const InputControl = primitives.Input === undefined ? LocalInput : primitives.Input;

	//#endregion

	/** The refresh glyph, used when the shipped icon set is unavailable. */
	function RefreshGlyph() {
		return h("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true },
			h("path", { d: "M19.5 12a7.5 7.5 0 1 1-2.4-5.45", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" }),
			h("path", { d: "M19.5 3.6v4.3h-4.3", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" }),
		);
	}

	const RefreshIcon = primitives.IconRefreshOutlineRegular === undefined ? RefreshGlyph : primitives.IconRefreshOutlineRegular;

	/** 图标座里的兜底图形：一个插头（primitives 取不到时才用）。 */
	function PluginsGlyph({ size = 20 }) {
		return h("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true },
			h("path", { d: "M9 3.5v4M15 3.5v4", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }),
			h("path", { d: "M6.5 7.5h11v4.2a5.5 5.5 0 0 1-11 0z", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" }),
			h("path", { d: "M12 17.2v3.3", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }),
		);
	}

	/**
	 * 图标座里的图形，与官方插件页同一套做法：插件自带图标（meta.icon）就用 <img> 显示；
	 * 没有图标、或图片解码失败时，露出底层官方的默认插件图标（primitives 的
	 * PluginArtworkDefault），primitives 也拿不到才用自绘插头。
	 *
	 * 底层先画、图片只是盖在上面并在 onError 时把自己 remove 掉，所以这里不需要 hook。
	 */
	function PluginArtwork({ src }) {
		const Default = primitives.PluginArtworkDefault;
		return [
			// 官方默认图的 viewBox 是 0 0 36 36，图形只占中部约 19.4 单位：按 36 渲染，
			// 图形视觉大小才和其他侧栏页 20px 的图标相当（按 20 渲染会缩成约 11px，又小又空）。
			Default === undefined ? h(PluginsGlyph, { key: "fallback", size: 20 }) : h(Default, { key: "fallback", size: 36 }),
			src === undefined || src === "" ? null : h("img", {
				key: "icon",
				className: "plp-cardIconImg",
				src,
				width: 20,
				height: 20,
				alt: "",
				onError: (event) => { event.currentTarget.remove(); },
			}),
		];
	}

	/** The six-dot grip at the front of a row: press and hold to drag. */
	function HandleGlyph() {
		const dots = [];
		for (const cx of [4, 10]) for (const cy of [3, 9, 15]) dots.push(h("circle", { key: `${cx}-${cy}`, cx, cy, r: 1.7 }));
		return h("svg", { width: 14, height: 18, viewBox: "0 0 14 18", fill: "currentColor", "aria-hidden": true }, dots);
	}



	/** The collapse chevron: down while open, right while collapsed. */
	function ChevronGlyph({ open }) {
		return h("svg", {
			width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true,
			style: { transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s ease" },
		}, h("path", { d: "M6 9.5l6 6 6-6", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }));
	}

	/** The icon-only button used for refresh. */
	function IconButton({ label, glyph, busy, disabled, onClick }) {
		return h(TooltipControl, { label, side: "bottom", delayMs: 500, focusDelayMs: 500, portal: true, disabled: disabled === true },
			h("button", {
				type: "button",
				className: "plp-iconButton",
				"aria-label": label,
				"aria-busy": busy === true ? true : undefined,
				disabled: disabled === true,
				onClick,
			}, h("span", { className: "plp-iconWrap", "aria-hidden": true },
				busy === true && primitives.StateDot !== undefined ? h(primitives.StateDot, { state: "ongoing", size: 16 }) : glyph,
			)),
		);
	}

	/** The status dot: enabled-with-tools, enabled-without-tools, disabled or failed. */
	function StatusDot({ state }) {
		const className = state === "up" ? "plp-stateUp" : state === "down" ? "plp-stateDown" : state === "failed" ? "plp-stateFailed" : "plp-stateOff";
		return h("span", { className: "plp-dotSlot", "aria-hidden": true },
			h("span", { className, style: { display: "inline-flex" } },
				primitives.StateDot === undefined
					? h("span", { className: "plp-dot" })
					: h(primitives.StateDot, { state: state === "up" ? "done" : state === "failed" ? "error" : state === "down" ? "warning" : "idle", size: 10 }),
			),
		);
	}

	function PluginRow(props) {
		const {
			server, state, custom, desc, dragging, rowRef, drop, t,
		} = props;
		// 显示名：改过名用自定义名（原名退到副标题），没改过就用官方给的显示名。
		const hasCustom = typeof custom === "string" && custom !== "";
		const title = hasCustom ? custom : server.name;
		// 「原本的名字」：官方显示名；官方没给就用去掉 @作者/ 的短名（免得把作者名露出来）。
		const original = typeof server.official === "string" && server.official !== ""
			? server.official
			: shortPackageName(server.moduleName);
		// 改过名 → 副标题一定画原名（自定义名只是另起一个标题，从不顶掉原名）；
		// 没改名 → 只在副标题能提供额外信息（包名与显示名不同）时才画。
		const subTitle = hasCustom
			? original
			: (title === server.moduleName || title === shortPackageName(server.moduleName) ? null : server.moduleName);
		// 简介：本面板里写过的优先，否则用插件自己的官方简介。
		const hasDesc = typeof desc === "string" && desc !== "";
		const descText = hasDesc ? desc : server.description;
		// 内置条目（DSH 自己的包与内部行）一律只读：拨它们的时候，官方管理器会按 patchId
		// 往 profile 的 patch 文件追加一条并尝试热重载 —— 会写脏文件并甩出一堆报错。
		const builtinLocked = server.group === "builtin";
		const locked = builtinLocked || (server.readOnly !== undefined && server.readOnly !== null);
		const stateKind = state === undefined ? undefined : state.kind;
		const connected = server.fiberPhase === "active";
		return h("li", {
			className: "plp-card",
			ref: rowRef,
			"data-lifted": dragging ? "1" : undefined,
			"data-drop": drop,
		},
			h("div", { className: "plp-cardHead" },
				h("span", { className: "plp-lead" },
					h("button", {
						type: "button",
						className: "plp-grip",
						"aria-label": dragging ? t("dragging") : t("reorder"),
						onPointerDown: (event) => props.onGripDown(event, server.id),
						onPointerMove: props.onGripMove,
					}, h(HandleGlyph, null)),
					
				),
				h("span", { className: "plp-cardIcon" }, h(PluginArtwork, { src: server.icon })),
				h("div", { className: "plp-main" },
					// 与其他插件同款：输入框画在名字上方，名字本身**不消失**（改名只是另起一个标题）。
					null,
					h("div", { className: "plp-nameRow" },
						h("span", { className: hasCustom ? "plp-name" : "plp-name plp-namePlain" }, title),
						server.version === "" ? null : h("span", { className: "plp-version" }, "v" + server.version),
					),
					// 显示名就是包名、或就是包名去掉 @作者/ 之后的短名时，不再画第二行 ——
					// 否则给插件补了 meta.title 之后，作者名又会从副标题冒出来。
					subTitle === null ? null : h("div", { className: "plp-sub" }, subTitle),
					h("div", { className: "plp-descRow" },
							h("span", { className: descText === "" ? "plp-desc plp-descEmpty" : "plp-desc" },
								descText === "" ? t("descEmpty") : descText),
							
						),
					// 处理中的行没有文案：不画那个空行，免得列表上下跳。
					stateKind === undefined || state.text === undefined ? null
						: h("p", { className: stateKind === "ok" ? "plp-ok" : "plp-reason" }, state.text),
					locked ? h("p", { className: "plp-reason" }, t(builtinLocked ? "builtinLocked" : "locked")) : null,
				),
				h("div", { className: "plp-cardEnd" },
					h(StatusDot, { state: connected ? "up" : server.enabled ? "down" : "idle" }),
					h(SwitchControl, {
						checked: server.enabled,
						disabled: locked || props.busy === true,
						label: t(server.enabled ? "disable" : "enable"),
						title: locked ? t(builtinLocked ? "builtinLocked" : "locked") : undefined,
						onChange: () => props.onToggle(server, !server.enabled),
					}),
				),
			),
		);
	}

	/** 官方管理页按钮的「不支持直达」警告只发一次，避免每点一次刷一条。 */
	let warnedNoJump = false;

	function PluginsPage(props) {
		const t = props.t;
		const ctx = props.ctx;
		const [servers, setServers] = useState(undefined);
		const [summary, setSummary] = useState({ total: 0, off: 0 });
		const [synced, setSynced] = useState(undefined);
		const [loading, setLoading] = useState(true);
		const [notice, setNotice] = useState(undefined);
		// The search box, the same affordance the skills page has. Unlike the rest of
		// the page's display state it is not persisted: a filter left over from the
		// last visit would look like missing servers.
		const [query, setQuery] = useState("");
		const [rowState, setRowState] = useState({});
		const alive = useRef(true);
		// The page's own display preferences: custom titles, in-group order, the
		// collapsed flag and the group's custom title. The host half stores them.
		const [prefs, setPrefs] = useState(() => defaultPrefs());
		const prefsLoaded = useRef(false);
		/** Last good self-made module list: prefs failure must not blank the page. */
		const selfMadeRef = useRef([]);
		const [bulkBusy, setBulkBusy] = useState(false);
		// Long-press drag: a 300ms hold arms it, then the pointer is captured and
		// moves only redraw the insertion marker.
		const [dragId, setDragId] = useState(null);
		const [dropIndex, setDropIndex] = useState(null);
		// The dragged order, drawn live while the pointer moves: the row follows the
		// pointer instead of the list only changing on release.
		const [preview, setPreview] = useState(null);
		const dropIndexRef = useRef(null);
		const holdRef = useRef(null);
		/** 每组的 <ul> 元素，按组 id 存：拖动时用它量落点，落点只在本组内算。 */
		const listRefs = useRef({});
		const previewRef = useRef(null);
		/** Every row element by id, so the drag can measure and animate itself. */
		const rowRefs = useRef(new Map());
		/** The offset currently applied to the picked-up row. */
		const dyRef = useRef(0);
		/** Row tops captured just before a live reorder, for the FLIP pass. */
		const flipRef = useRef(null);
		/** The FLIP offset currently applied to each row, so it can be discounted. */
		const glideRef = useRef(new Map());
		const settleTimer = useRef(undefined);
		/** 刷新的请求代次：只让最新那次把结果写进状态，旧响应不许覆盖。 */
		const refreshSeq = useRef(0);

		const setRow = useCallback((id, value) => {
			setRowState((current) => {
				const next = { ...current };
				if (value === undefined) delete next[id];
				else next[id] = value;
				return next;
			});
		}, []);

		/** 偏好的写请求排队：连续改名/拖动时，旧快照不能后到把新快照盖掉。 */
		const saveChain = useRef(Promise.resolve());

		/** Persist the display preferences locally, then to the host state file. */
		const savePrefs = useCallback((next) => {
			setPrefs(next);
			saveChain.current = saveChain.current.then(async () => {
				try {
					const response = await fetch(API_PATH, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ action: "prefs", prefs: next }),
					});
					if (!response.ok) {
						// An old host half (before this version's POST route) answers
						// 404/405; say so instead of showing a bare status code.
						setNotice({
							kind: "error",
							text: response.status === 405 || response.status === 404
								? t("saveNeedsRestart", { status: response.status })
								: t("saveFailed", { message: `HTTP ${response.status}` }),
						});
					}
				} catch (error) {
					setNotice({ kind: "error", text: t("saveFailed", { message: String(error.message ?? error) }) });
				}
			});
		}, [t]);

		/**
		 * Merge the owner's descriptors with DSH's live row inventory. The
		 * inventory is the only authority on whether a row is enabled, so it also
		 * drives the status dot together with the tool count.
		 *
		 * Row notices survive a reload on purpose: after a switch is flipped the
		 * page reloads its data, and wiping the "applied" confirmation at that
		 * moment would hide the very feedback the user just earned. Only an
		 * explicit refresh clears them.
		 */
		const refresh = useCallback(async (options) => {
			const ticket = ++refreshSeq.current;
			setLoading(true);
			setNotice(undefined);
			try {
				// 官方插件清单：与 DSH 自带插件页同一个接口，只读。
				// 条目形状（照 dsh-plugin-manager 的 remote schema 核对）：
				//   { entryId, moduleName, meta?: { title, description, icon, error },
				//     enabled, fiberPhase, patchId? , readOnlyReason? }
				// 带 patchId（且没有 readOnlyReason）的行才可切换；readOnlyReason 有两种：
				// management-required / unaddressable。
				let rows = [];
				let inventoryOk = false;
				try {
					rows = await listRows(ctx, t);
					inventoryOk = true;
				} catch (error) {
					if (alive.current && ticket === refreshSeq.current) {
						setSynced(false);
						setNotice({ kind: "error", text: t("loadFailed", { message: String(error.message ?? error) }) });
					}
				}

				// 本面板自己的东西：显示偏好 + 哪些插件是「自制」（profile 里 link:/file: 装的）
				let state = {};
				let prefsOk = false;
				try {
					const response = await fetch(API_PATH, { cache: "no-store" });
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const payload = await response.json();
					if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
						throw new Error(t("badAnswer"));
					}
					state = payload;
					prefsOk = true;
					if (Array.isArray(state.selfMade)) selfMadeRef.current = state.selfMade.slice();
				} catch (error) {
					if (alive.current && ticket === refreshSeq.current) {
						setSynced(false);
						setNotice({ kind: "error", text: t("prefsFailed", { message: String(error.message ?? error) }) });
					}
					state = {};
				}
				const selfMadeList = prefsOk && Array.isArray(state.selfMade)
					? state.selfMade
					: selfMadeRef.current;
				const selfMade = new Set(Array.isArray(selfMadeList) ? selfMadeList : []);
				if (prefsOk && selfMade.size === 0 && rows.length > 0 && alive.current && ticket === refreshSeq.current) {
					setNotice({ kind: "error", text: t("selfMadeUnknown") });
					setSynced(false);
				}

				const merged = rows.map((row) => {
					const meta = row.meta !== null && typeof row.meta === "object" ? row.meta : {};
					// meta.title / meta.description 可能是字符串，也可能是 { en, zh, ... } 记录。
					const title = localeText(ctx, meta.title);
					const name = title !== "" ? title : String(row.moduleName);
					const addressable = row.patchId !== undefined && row.patchId !== null;
					return {
						id: row.entryId ?? row.moduleName,
						entryId: row.entryId,
						moduleName: row.moduleName,
						// 不可寻址的行没有 patchId：留空，开关也会锁住并显示原因。
						path: addressable ? String(row.patchId) : "",
						name,
						// 官方给的显示名（可能为空 —— 官方包和自制包大多没写）。改过名时它当副标题用。
						official: title,
						description: localeText(ctx, meta.description),
						// 插件自带图标（官方 meta.icon 是纯字符串 URL / data URI）。
						icon: typeof meta.icon === "string" ? meta.icon : "",
						version: typeof row.version === "string" ? row.version : (typeof meta.version === "string" ? meta.version : ""),
						enabled: row.enabled === true,
						fiberPhase: row.fiberPhase,
						readOnly: row.readOnlyReason ?? (addressable ? undefined : "unaddressable"),
						group: selfMade.has(row.moduleName) ? "self" : "builtin",
					};
				});
				merged.sort((left, right) => String(left.id).localeCompare(String(right.id)));
				if (!alive.current || ticket !== refreshSeq.current) return false;
				setServers(merged);
				// 计数只算面板真正列出来的那组（内置组不显示，就不该进统计）。
				const visible = merged.filter((row) => GROUP_VISIBLE.includes(row.group));
				setSummary({ total: visible.length, off: visible.filter((row) => !row.enabled).length });
				// 清单与偏好都成功（或偏好失败但还有上次名单、且不是空名单误报）才标已同步。
				if (inventoryOk && prefsOk && !(selfMade.size === 0 && rows.length > 0)) setSynced(true);
				else if (inventoryOk && !prefsOk && selfMade.size > 0) setSynced(true);
				// 宿主的偏好只读一次：之后所有改动都走 savePrefs 往外写，
				// 这样后台刷新不会把刚做的排序冲掉。
				if (!prefsLoaded.current && prefsOk) {
					prefsLoaded.current = true;
					setPrefs(normalizePrefs(state.prefs));
				}
				if (options !== undefined && options.clearNotices === true) setRowState({});
				return inventoryOk && prefsOk && !(selfMade.size === 0 && rows.length > 0);
			} catch (error) {
				if (alive.current && ticket === refreshSeq.current) {
					setServers([]);
					setSynced(false);
					setNotice({ kind: "error", text: t("readFailed", { message: String(error.message ?? error) }) });
				}
				return false;
			} finally {
				if (alive.current && ticket === refreshSeq.current) setLoading(false);
			}
		}, [ctx, t]);

		useEffect(() => {
			alive.current = true;
			ensureCss();
			refresh();
			return () => { alive.current = false; };
		}, [refresh]);

		// Row drag listeners live on window; leaving the page mid-drag must clear them
		// and the grabbing cursor (GroupGrip already cleans itself up).
		useEffect(() => () => {
			const hold = holdRef.current;
			if (hold !== null) {
				if (hold.timer !== undefined) clearTimeout(hold.timer);
				if (hold.frame !== undefined && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(hold.frame);
				if (typeof window !== "undefined") {
					window.removeEventListener("pointermove", hold.move);
					window.removeEventListener("pointerup", hold.release);
					window.removeEventListener("pointercancel", hold.release);
					window.removeEventListener("scroll", hold.onScroll, true);
					if (hold.cancel !== undefined) window.removeEventListener("blur", hold.cancel);
				}
				holdRef.current = null;
			}
			if (typeof document !== "undefined") {
				document.body.style.removeProperty("user-select");
				document.body.style.removeProperty("cursor");
			}
			dropIndexRef.current = null;
			previewRef.current = null;
			dyRef.current = 0;
			if (settleTimer.current !== undefined) {
				clearTimeout(settleTimer.current);
				settleTimer.current = undefined;
			}
			for (const element of rowRefs.current.values()) {
				if (element === null || element === undefined) continue;
				element.style.transition = "";
				element.style.transform = "";
				element.removeAttribute("data-lifted");
				element.removeAttribute("data-dragging");
			}
		}, []);

		// The plugin manager announces every row change, including ones made
		// outside this page, so the list keeps itself current.
		useEffect(() => {
			if (ctx.remote === undefined || typeof ctx.remote.$on !== "function") return undefined;
			try {
				return ctx.remote.$on("plugin-manager/changed", () => { void refresh(); });
			} catch {
				return undefined;
			}
		}, [ctx, refresh]);

		const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

		/** Re-read the inventory until the row reports what we asked for. */
		const verifyRow = useCallback(async (server, wanted) => {
			const delays = [120, 300, 700];
			for (let attempt = 0; attempt <= delays.length; attempt += 1) {
				if (attempt > 0) await wait(delays[attempt - 1]);
				let inventory;
				try {
					inventory = await listRows(ctx, t);
				} catch {
					return { ok: false, text: t("unsynced") };
				}
				const row = inventory.find((item) => item.entryId === server.entryId || item.patchId === server.id);
				if (row === undefined) return { ok: false, text: t("writeFailed", { message: "row disappeared" }) };
				if (row.enabled === wanted) return { ok: true };
			}
			return { ok: false, text: t("notApplied", { state: wanted ? t("enabled") : t("disabled") }) };
		}, [ctx, t]);

		/** Enable or disable one row through the shipped Remote, then verify it. */
		const setEnabled = useCallback(async (server, enabled, deferRefresh = false) => {
			if (server.entryId === undefined) {
				setRow(server.id, { kind: "error", text: t("writeFailed", { message: "row is not addressable" }) });
				return false;
			}
			setRow(server.id, { kind: "busy" });
			try {
				const answer = readAnswer(await ctx.remote.pluginManager.setPluginEnabled(server.entryId, enabled));
				if (!answer.ok) {
					setRow(server.id, { kind: "error", text: t("writeFailed", { message: answer.reason === "malformed" ? t("badAnswer") : answer.reason }) });
					return false;
				}
				// The Host reports the outcome in `value.application`. A refusal is
				// `ok: false`; an override is one of these values, NOT a returned
				// string, and "restart-required" still counts as saved.
				const outcome = answer.value === null || typeof answer.value !== "object" ? {} : answer.value;
				if (outcome.application === "overridden") {
					setRow(server.id, { kind: "locked", text: t("overridden") });
					return false;
				}
				if (outcome.application === "cancelled") {
					setRow(server.id, { kind: "error", text: t("cancelled") });
					return false;
				}
				if (outcome.application === "failed") {
					const reported = outcome.error === null || outcome.error === undefined ? undefined : (outcome.error.diagnostic ?? outcome.error.code);
					setRow(server.id, { kind: "error", text: t("writeFailed", { message: String(reported ?? t("unknownError")) }) });
					return false;
				}
				if (outcome.application === "restart-required") {
					setRow(server.id, { kind: "locked", text: t("restartNeeded") });
					return false;
				}
				const verified = await verifyRow(server, enabled);
				if (!verified.ok) {
					setRow(server.id, { kind: "locked", text: verified.text });
					return false;
				}
				setRow(server.id, { kind: "ok", text: t("applied") });
				if (!deferRefresh) void refresh();
				return true;
			} catch (error) {
				setRow(server.id, { kind: "error", text: t("writeFailed", { message: String(error.message ?? error) }) });
				return false;
			}
		}, [ctx, t, setRow, verifyRow, refresh]);

		const onToggle = useCallback((server, enabled) => { void setEnabled(server, enabled); }, [setEnabled]);

		const persisted = applyOrder(servers ?? [], prefs);
		/** 一行属于哪个分组。 */
		const groupKey = (server) => (server.group === "self" ? "self" : "builtin");
		const groupKeyOf = (id) => {
			const found = persisted.find((server) => server.id === id);
			return found === undefined ? "builtin" : groupKey(found);
		};
		/**
		 * One row's searchable text: 自定义名 / 官方显示名 / 包名 / 行 id / 官方简介 /
		 * 这里写的简介 / 版本行 —— 用户要搜的那几样都能命中。
		 */
		const searchable = (server) => {
			const custom = prefs.titles[server.id];
			const own = prefs.desc[server.id];
			return [
				custom === undefined ? "" : custom,
				server.name,
				server.moduleName,
				typeof server.id === "string" ? server.id : "",
				server.description,
				own === undefined ? "" : own,
				server.version === "" ? "" : "v" + server.version,
			].join(" ").toLowerCase();
		};
		const needle = query.trim().toLowerCase();
		/** 一组里被搜索框放行的行，顺序就是保存的顺序。 */
		const visibleOf = (groupId) => {
			const items = persisted.filter((server) => groupKey(server) === groupId);
			return needle === "" ? items : items.filter((server) => searchable(server).includes(needle));
		};
		const dragGroup = dragId === null ? null : groupKeyOf(dragId);
		/**
		 * 一组画什么：可见的行；拖动进行时只有被拖的那一组按预览顺序画，这样被拖的
		 * 行跟着指针走，而落点只在同组内算。
		 */
		const itemsOf = (groupId) => {
			const kept = visibleOf(groupId);
			return preview !== null && dragGroup === groupId ? reorderBy(preview, kept) : kept;
		};
		/**
		 * 每一组当前画出来的键序。它必须能在拖动期间被事件闭包读到：按住手柄那一刻
		 * dragId 还是 null，所以键序不能绑在 dragId 上（绑上去事件里永远是空数组）。
		 */
		const keysOfGroup = (groupId) => itemsOf(groupId).map((server) => server.id);
		const keysOf = keysOfGroup(dragGroup === null ? "builtin" : dragGroup);
		const dragFrom = dragId === null ? -1 : keysOf.indexOf(dragId);

		const toggleCollapse = (groupId) => {
			const next = { ...(prefs.collapsed ?? {}) };
			next[groupId] = next[groupId] !== true;
			savePrefs({ ...prefs, collapsed: next });
		};

		const resetPage = () => {
			if (!globalThis.confirm(t("resetConfirm"))) return;
			savePrefs(defaultPrefs());
		};

		//#region long-press drag

		const clearHold = () => {
			const hold = holdRef.current;
			if (hold === null) return;
			if (hold.timer !== undefined) clearTimeout(hold.timer);
			if (hold.frame !== undefined && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(hold.frame);
			if (typeof window !== "undefined") {
				window.removeEventListener("pointermove", hold.move);
				window.removeEventListener("pointerup", hold.release);
				window.removeEventListener("pointercancel", hold.release);
				window.removeEventListener("scroll", hold.onScroll, true);
				if (hold.cancel !== undefined) window.removeEventListener("blur", hold.cancel);
			}
			if (typeof document !== "undefined") {
				if (hold.previousSelect === "" || hold.previousSelect === undefined) document.body.style.removeProperty("user-select");
				else document.body.style.userSelect = hold.previousSelect;
				if (hold.previousCursor === "" || hold.previousCursor === undefined) document.body.style.removeProperty("cursor");
				else document.body.style.cursor = hold.previousCursor;
			}
			holdRef.current = null;
			dropIndexRef.current = null;
			setDragId(null);
			setDropIndex(null);
		};

		/** Drop the live preview (a cancelled drag saves nothing). */
		const clearPreview = () => {
			if (previewRef.current === null) return;
			previewRef.current = null;
			setPreview(null);
		};

		/** The picked-up row's element, when the page really has a DOM. */
		const rowElement = (id) => {
			const element = rowRefs.current.get(id);
			return element === undefined || element === null || typeof element.getBoundingClientRect !== "function" ? undefined : element;
		};

		/**
		 * Write the follow offset straight onto the element.
		 *
		 * Routing this through React state re-rendered every row on every pointer
		 * move, which dropped frames on a long list. `animate` is false at the one
		 * moment where the offset has to jump: when the row's own slot moves, the
		 * correction must land in the same frame as the layout shift, otherwise the
		 * row drifts a whole row height while the list slides underneath it.
		 */
		const applyLift = (element, dy, animate) => {
			if (element === undefined) return;
			element.style.transition = animate ? FOLLOW_TRANSITION : "none";
			element.style.transform = `translateY(${dy}px) scale(1.015)`;
		};

		/** Where one group's list starts right now: a drag has to follow the page as it scrolls. */
		const listTopOf = (container) => {
			if (container === undefined || container === null || typeof container.getBoundingClientRect !== "function") return 0;
			return container.getBoundingClientRect().top;
		};

		/** The nearest ancestor that can actually scroll: the area a drag must follow. */
		const scrollParentOf = (element) => {
			let node = element === undefined || element === null ? null : element.parentElement;
			while (node !== null && node !== undefined) {
				if (node.scrollHeight > node.clientHeight + 4) return node;
				node = node.parentElement;
			}
			if (typeof document !== "undefined" && document.scrollingElement !== undefined && document.scrollingElement !== null) return document.scrollingElement;
			return null;
		};

		/**
		 * A row's layout position, ignoring any transform. `offsetTop` is layout-only,
		 * so neither the follow offset nor a FLIP glide can pollute it.
		 */
		const layoutHeightOf = (element) => {
			if (typeof element.offsetHeight === "number" && element.offsetHeight > 0) return element.offsetHeight;
			return element.getBoundingClientRect().height;
		};

		/**
		 * Where the picked-up row should sit, decided from the rows it is NOT dragging.
		 *
		 * Asking the browser what is under the pointer cannot work here: the picked-up
		 * row follows the pointer, so the pointer is always inside it, and it is the
		 * topmost element as well. The answer was therefore constantly "itself", the
		 * target never moved, and in places the row simply could not be dropped
		 * anywhere else. The other rows are static, so their midpoints give a stable
		 * insertion position.
		 *
		 * The positions come from viewport rects, which follow the page as it scrolls.
		 * `offsetTop` cannot be used here: it is measured from the offsetParent, and
		 * when the scrolling area is not that offsetParent the sum never moves — a
		 * wheel-scrolled drag then kept judging the row's original position while the
		 * row itself had already followed the list. The one transform to discount is
		 * the FLIP offset, which is known exactly because this code applied it.
		 */
		const idOfElement = (elements, node) => {
			for (const [id, element] of elements) {
				if (element === node) return id;
			}
			return undefined;
		};

		const slotFor = (clientY, draggedId, container) => {
			if (container === undefined || container === null || typeof container.querySelectorAll !== "function") return -1;
			const dragged = rowRefs.current.get(draggedId);
			const cards = [];
			const all = container.querySelectorAll("li.plp-card");
			for (let index = 0; index < all.length; index += 1) {
				if (all[index] !== dragged) cards.push(all[index]);
			}
			for (let index = 0; index < cards.length; index += 1) {
				const glide = glideRef.current.get(idOfElement(rowRefs.current, cards[index]));
				const top = cards[index].getBoundingClientRect().top - (glide === undefined ? 0 : glide);
				if (clientY < top + layoutHeightOf(cards[index]) / 2) return index;
			}
			return cards.length;
		};

		/** The drop: hold the offset for one frame, then ease the row into its slot. */
		const settleRow = (id, from) => {
			const element = rowElement(id);
			if (element === undefined || from === 0) return;
			if (settleTimer.current !== undefined) clearTimeout(settleTimer.current);
			element.style.transition = "transform .24s ease-out, box-shadow .24s ease-out";
			element.style.transform = `translateY(${from}px) scale(1.015)`;
			const land = () => { element.style.transform = "translateY(0px) scale(1)"; };
			if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(land);
			else land();
			settleTimer.current = setTimeout(() => {
				element.style.transition = "";
				element.style.transform = "";
			}, 340);
		};

		/**
		 * Press and hold the grip for 300ms to arm the drag. Both the move and the
		 * release listener sit on the window on purpose: a pointer that leaves the
		 * grip before the hold fires never comes back to it, and a drag has to end
		 * even when the button is released outside the row.
		 */
		const gripDown = (event, id) => {
			if (typeof event.button === "number" && event.button !== 0) return;
			clearHold();
			clearPreview();
			event.preventDefault();
			const startElement = rowElement(id);
			const container = listRefs.current[groupKeyOf(id)];
			const startRect = startElement === undefined ? undefined : startElement.getBoundingClientRect();
			const hold = {
				id,
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				lastY: event.clientY,
				// Where inside the row the pointer grabbed it, so the row does not jump.
				grabY: startRect === undefined ? 0 : event.clientY - startRect.top,
				// The row's layout top and list index at grab time, plus the row-to-row
				// distance: with those three numbers the follow offset is pure
				// arithmetic, so nothing ever measures a rect mid-animation (doing that
				// made the offset chase its own transition and sent rows flying).
				layoutTop0: startRect === undefined ? 0 : startRect.top,
				index0: Math.max(0, keysOfGroup(groupKeyOf(id)).indexOf(id)),
				// How far the list has moved the row under the pointer since the grab.
				// Accumulated from real measurements, never assumed from a row height:
				// a row with a reason line is taller than its neighbours.
				shift: 0,
				// The page has to follow a drag: the list moves under the pointer while
				// the pointer itself may not move at all.
				scroller: scrollParentOf(container),
				listTop0: listTopOf(container),
				container,
				frame: undefined,
				active: false,
				timer: undefined,
				target: event.currentTarget,
			};
			hold.move = (moveEvent) => {
				if (moveEvent.pointerId !== hold.pointerId) return;
				gripMove(moveEvent);
			};
			hold.release = (releaseEvent) => {
				if (releaseEvent.pointerId !== hold.pointerId) return;
				gripEnd(releaseEvent, releaseEvent.type === "pointerup");
			};
			// A wheel scroll (or the auto-scroll below) moves the list under a pointer
			// that is not moving, so the follow offset and the drop target both have to
			// be recomputed from the scroll event as well. Without this the row stayed
			// where it was while the list slid, which looked like it snapped back.
			hold.onScroll = () => {
				if (hold.active) refreshDrag(hold);
			};
			/** Enter the dragging state: visible, captured, and tracked by the window. */
			const arm = () => {
				hold.active = true;
				dyRef.current = 0;
				setDragId(id);
				const start = keysOfGroup(groupKeyOf(id)).indexOf(id);
				dropIndexRef.current = start < 0 ? 0 : start;
				setDropIndex(dropIndexRef.current);
				if (typeof document !== "undefined") {
					// The armed state must be unmistakable: without a visible change
					// "nothing happened" is indistinguishable from "not armed yet".
					hold.previousSelect = document.body.style.userSelect;
					hold.previousCursor = document.body.style.cursor;
					document.body.style.userSelect = "none";
					document.body.style.cursor = "grabbing";
				}
				// "缓慢浮起来": grow into the picked-up scale over one frame so the lift
				// itself eases instead of snapping.
				const element = rowElement(id);
				if (element !== undefined) {
					element.style.transition = "none";
					element.style.transform = "translateY(0px) scale(1)";
					const grow = () => { element.style.transition = "transform .18s ease, box-shadow .2s ease"; element.style.transform = "translateY(0px) scale(1.015)"; };
					if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(grow);
					else grow();
				}
				try {
					hold.target.setPointerCapture(hold.pointerId);
				} catch {
					// A synthetic pointer has nothing to capture; the window
					// listeners still carry and end the drag.
				}
				// Long lists: drag to the edge and the page has to follow. The pointer
				// may not move at all while this runs, so the loop refreshes the drop
				// target too, not just the scroll position.
				if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
					const tick = () => {
						const held = holdRef.current;
						if (held === null || held !== hold || !held.active) { hold.frame = undefined; return; }
						autoScroll(held);
						hold.frame = window.requestAnimationFrame(tick);
					};
					hold.frame = window.requestAnimationFrame(tick);
				}
				if (typeof window !== "undefined") window.addEventListener("scroll", hold.onScroll, true);
			};
			// A mouse drag starts the moment the grip is pressed. The grip IS an
			// explicit drag affordance, and demanding a 300ms hold on a 22px target
			// made a normal press-and-drag read as "nothing happens" (any move past
			// 10px before the timer cancelled it silently). Touch keeps the hold:
			// there it is what separates a drag from a scroll.
			if (event.pointerType === "touch") hold.timer = setTimeout(arm, HOLD_MS);
			else arm();
			hold.cancel = () => {
				clearHold();
				clearPreview();
				dyRef.current = 0;
			};
			holdRef.current = hold;
			if (typeof window !== "undefined") {
				window.addEventListener("pointermove", hold.move);
				window.addEventListener("pointerup", hold.release);
				window.addEventListener("pointercancel", hold.release);
				window.addEventListener("blur", hold.cancel);
			}
		};

		/**
		 * The row whose place the picked-up one is taking, plus the live preview. The
		 * insertion position is computed among the rows that are NOT dragged, so the
		 * answer never depends on the picked-up row's own position.
		 */
		const updateSlot = (hold) => {
			const current = previewRef.current === null
				? keysOfGroup(groupKeyOf(hold.id)).slice()
				: previewRef.current.slice();
			const others = current.filter((key) => key !== hold.id);
			// 组容器在按住那一刻取了一次；万一那一下还没挂上（刚折叠过、或首帧），
			// 这里补取一次，否则 slotFor 一直返回 -1，松手就只落位不保存。
			if (hold.container === undefined || hold.container === null) {
				hold.container = listRefs.current[groupKeyOf(hold.id)];
			}
			const slot = slotFor(hold.lastY, hold.id, hold.container);
			if (slot === -1) return;
			const at = Math.max(0, Math.min(slot, others.length));
			const next = others.slice();
			next.splice(at, 0, hold.id);
			if (next.some((key, index) => key !== current[index])) {
				// Capture where every row sits *before* the reorder, so the FLIP pass
				// can animate the rows that have to make way.
				flipRef.current = snapshotTops(rowRefs.current, hold.id);
				previewRef.current = next;
				setPreview(next);
			}
			// The row whose place the picked-up one is taking, for the outline marker.
			const displaced = at < others.length ? others[at] : (others.length === 0 ? null : others[others.length - 1]);
			const marker = displaced === null ? -1 : current.indexOf(displaced);
			if (marker !== dropIndexRef.current) {
				dropIndexRef.current = marker;
				setDropIndex(marker);
			}
		};

		/**
		 * Keep the picked-up row under the pointer.
		 *
		 * The offset is arithmetic — grab-time layout top, plus however far the list
		 * has moved the row under it since (measured, not assumed), plus the scroll —
		 * so nothing ever measures a rect mid-animation (doing that made the offset
		 * chase its own transition and sent rows flying). It is written straight onto
		 * the element, so a pointer move costs no React render at all.
		 *
		 * `instant` is for the one moment the offset must jump: right after React
		 * moved the row to a new slot, the correction has to land in the same frame or
		 * the row visibly jumps and snaps back.
		 */
		const updateFollow = (hold, instant) => {
			const element = rowElement(hold.id);
			if (element === undefined) return;
			const layoutTop = hold.layoutTop0 + hold.shift + (listTopOf(hold.container) - hold.listTop0);
			const dy = hold.lastY - hold.grabY - layoutTop;
			dyRef.current = dy;
			if (instant === true) {
				element.style.transition = "none";
				element.style.transform = `translateY(${dy}px) scale(1.015)`;
				void element.offsetHeight;
				element.style.transition = FOLLOW_TRANSITION;
				return;
			}
			applyLift(element, dy, true);
		};

		/** The drop target and the follow offset, for the pointer's current position. */
		const refreshDrag = (hold) => {
			updateSlot(hold);
			updateFollow(hold);
		};

		/** Scroll the list while the pointer waits near the edge of its scrolling area. */
		const autoScroll = (hold) => {
			const scroller = hold.scroller;
			if (scroller === null || scroller === undefined || typeof scroller.getBoundingClientRect !== "function") return;
			const rect = scroller.getBoundingClientRect();
			let delta = 0;
			if (hold.lastY < rect.top + EDGE_ZONE) delta = -Math.ceil(((rect.top + EDGE_ZONE - hold.lastY) / EDGE_ZONE) * EDGE_SPEED);
			else if (hold.lastY > rect.bottom - EDGE_ZONE) delta = Math.ceil(((hold.lastY - (rect.bottom - EDGE_ZONE)) / EDGE_ZONE) * EDGE_SPEED);
			if (delta === 0) return;
			const before = scroller.scrollTop;
			scroller.scrollTop = before + delta;
			if (scroller.scrollTop !== before) refreshDrag(hold);
		};

		const gripMove = (event) => {
			const hold = holdRef.current;
			if (hold === null || hold.pointerId !== event.pointerId) return;
			if (!hold.active) {
				// Moving before the hold fires means "not a drag": give up quietly.
				if (Math.abs(event.clientX - hold.startX) > 10 || Math.abs(event.clientY - hold.startY) > 10) clearHold();
				return;
			}
			event.preventDefault();
			hold.lastY = event.clientY;
			refreshDrag(hold);
		};

		const gripEnd = (event, commit) => {
			const hold = holdRef.current;
			if (hold === null || hold.pointerId !== event.pointerId) return;
			const wasActive = hold.active;
			const id = hold.id;
			const live = previewRef.current;
			const releasedDy = dyRef.current;
			clearHold();
			dyRef.current = 0;
			if (!wasActive || !commit || live === null) {
				settleRow(id, releasedDy);
				return;
			}
			// The dragged row takes the place of the row it was dropped on; the live
			// preview already holds exactly that order.
			const baseKeys = keysOfGroup(groupKeyOf(id));
			const changed = live.length !== baseKeys.length || live.some((key, index) => key !== baseKeys[index]);
			setPreview(null);
			previewRef.current = null;
			// Hold the current offset for one frame, then let the row ease down into
			// its new slot: "松开手，缓缓落位".
			settleRow(id, releasedDy);
			if (!changed) return;
			// Merge the dragged order back into the whole list, so rows the search box
			// is hiding keep the places they had: only the dragged row's own group is
			// renumbered, and only that group's list is saved.
			const groupId = groupKeyOf(id);
			const shownSet = new Set(baseKeys);
			let cursor = 0;
			const merged = persisted.map((server) => (
				groupKey(server) === groupId && shownSet.has(server.id) ? live[cursor++] : server.id
			));
			const groupOrder = merged.filter((item) => groupKeyOf(item) === groupId);
			savePrefs({ ...prefs, order: { ...prefs.order, [groupId]: groupOrder } });
		};

		//#endregion

		/**
		 * The FLIP pass: after a live reorder every row that moved is first drawn at
		 * its old position and then eased to the new one, so rows visibly make way
		 * instead of jumping. The picked-up row is not part of this pass — its offset
		 * is computed arithmetically in gripMove, which keeps it exactly under the
		 * pointer without ever measuring an animating rect.
		 */
		useLayout(() => {
			const snapshot = flipRef.current;
			flipRef.current = null;
			if (snapshot !== null && snapshot !== undefined) {
				for (const [id, before] of snapshot.tops) {
					const element = rowRefs.current.get(id);
					if (element === undefined || element === null || typeof element.getBoundingClientRect !== "function") continue;
					const delta = before - element.getBoundingClientRect().top;
					if (delta === 0) continue;
					glideRef.current.set(id, delta);
					element.style.transition = "none";
					element.style.transform = `translateY(${delta}px)`;
					void element.offsetHeight;
					const glide = () => {
						glideRef.current.delete(id);
						element.style.transition = "transform .18s ease";
						element.style.transform = "";
						setTimeout(() => { element.style.transition = ""; }, 220);
					};
					if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(glide);
					else glide();
				}
			}
			// The picked-up row has just been moved by React. Layout effects run after
			// the DOM change but before the browser paints, so landing the correction
			// here is invisible — which is exactly what the earlier "one frame too
			// early" version got wrong.
			const hold = holdRef.current;
			if (hold === null || !hold.active) return;
			// Compensate by how far the row ACTUALLY moved, measured at this instant
			// instead of assumed from a uniform row height: a row showing an error or a
			// locked reason is taller than its neighbours, and a per-row step made the
			// picked-up row fly off by the wrong amount and snap back.
			const draggedTop = snapshot === null || snapshot === undefined ? undefined : snapshot.draggedTop;
			if (draggedTop !== undefined) {
				const element = rowElement(hold.id);
				if (element !== undefined) hold.shift += element.getBoundingClientRect().top - draggedTop;
			}
			updateFollow(hold, true);
		}, [preview]);

		/** The row whose place the dragged row would take: only inside its own group. */
		const dropOf = (server) => {
			if (dragId === null || dropIndex === null || dropIndex === dragFrom) return undefined;
			if (groupKey(server) !== dragGroup) return undefined;
			return keysOf.indexOf(server.id) === dropIndex ? "into" : undefined;
		};

		// ── 两个分组：内置（DSH 自带）与自制（link / file: 装的）──
		const groupTitleOf = (groupId) => {
			const custom = prefs.groupTitles[groupId];
			if (typeof custom === "string" && custom !== "") return custom;
			return t(groupId === "self" ? "groupSelf" : "groupBuiltin");
		};
		// 一键旋钮：只对「本组里能切换、且当前可见」的行动手；方向先锁存下来，
		// 中间有失败的行也不回弹。
		const bulkSetFor = async (groupId, enabled) => {
			const rows = visibleOf(groupId).filter((server) => server.entryId !== undefined && server.readOnly === undefined);
			if (rows.length === 0) return;
			savePrefs({ ...prefs, bulk: { ...prefs.bulk, [groupId]: enabled } });
			let ok = 0;
			let skip = 0;
			setBulkBusy(true);
			try {
				for (const server of rows) {
					if (server.enabled === enabled) { skip += 1; continue; }
					try {
						const applied = await setEnabled(server, enabled, true);
						if (applied === false) skip += 1;
						else ok += 1;
					} catch {
						skip += 1;
					}
				}
			} finally {
				setBulkBusy(false);
			}
			const refreshed = await refresh();
			if (!alive.current || !refreshed) return;
			setNotice({ kind: "ok", text: skip === 0 ? t("bulkDone", { ok }) : t("bulkDoneSkip", { ok, skip }) });
		};

		return h("div", { className: "plp-page" },
			h("div", { className: "plp-head" },
				h("h2", { className: "plp-title" }, t("title")),
				h("div", { className: "plp-subhead" },
					h("p", { className: "plp-intro" }, t("intro")),
					h("div", { className: "plp-toolbar" },
						h("button", {
							type: "button",
							className: "plp-resetBtn",
							// 直达官方页靠 layout.selectPanel；老版本 DSH 可能没有这个服务，
							// 取不到就在 title 上直说，点击时警告一次，不再静默无反应。
							title: (() => {
								const layout = typeof ctx.get === "function" ? ctx.get("layout") : undefined;
								return layout !== undefined && layout !== null && typeof layout.selectPanel === "function" ? undefined : t("jumpUnsupported");
							})(),
							onClick: () => {
								const layout = typeof ctx.get === "function" ? ctx.get("layout") : undefined;
								if (layout === undefined || layout === null || typeof layout.selectPanel !== "function") {
									if (!warnedNoJump) {
										warnedNoJump = true;
										console.warn(`[dsh-plugins-panel] ${t("jumpUnsupported")}：layout.selectPanel 不可用，「官方管理页」按钮无法直达官方页。`);
									}
									return;
								}
								try {
									layout.selectPanel("plugins");
								} catch (error) {
									console.warn(`[dsh-plugins-panel] 打开官方管理页失败：${String(error?.message ?? error)}`);
								}
							},
						}, t("patchFile")),
						h("button", { type: "button", className: "plp-resetBtn", onClick: resetPage }, t("reset")),
						h(IconButton, { label: t("refresh"), glyph: h(RefreshIcon, null), busy: loading, disabled: loading, onClick: () => { void refresh({ clearNotices: true }); } }),
						h(InputControl, {
							className: "plp-search",
							value: query,
							placeholder: t("search"),
							"aria-label": t("search"),
							spellCheck: false,
							onChange: (event) => setQuery(event.target.value),
						}),
					),
				),
			),
			notice === undefined ? null : h("p", { className: notice.kind === "ok" ? "plp-ok" : "plp-reason" }, notice.text),
			...GROUP_VISIBLE.map((groupId) => {
				const items = itemsOf(groupId);
				const groupItems = persisted.filter((server) => groupKey(server) === groupId);
				// 只有自制组能整组开关；内置组一律只读（原因见 PluginRow）。
				const groupTargets = groupId === "self"
					? items.filter((server) => server.entryId !== undefined && server.readOnly === undefined)
					: [];
				const groupReality = groupTargets.length > 0 && groupTargets.every((server) => server.enabled === true);
				const groupOn = typeof (prefs.bulk ?? {})[groupId] === "boolean" ? (prefs.bulk ?? {})[groupId] : groupReality;
				const isCollapsed = (prefs.collapsed ?? {})[groupId] === true;
				return h("section", { className: "plp-group", key: groupId },
					h("div", { className: "plp-groupHead plp-groupHeadSplit" },
						h("div", { className: "plp-groupHead" },
						h(GroupGrip, { t }),
							h("h3", { className: "plp-groupTitle" }, groupTitleOf(groupId)),
							h(GroupStatus, { items: groupItems, loading, synced, t }),
							
						),
						h("div", { className: "plp-groupActions" },
							h(SwitchControl, {
									checked: groupOn,
									disabled: bulkBusy || groupTargets.length === 0,
									label: groupId === "self" ? (groupOn ? t("knobOff") : t("knobOn")) : t("builtinLocked"),
									title: groupId === "self" ? (groupOn ? t("knobOff") : t("knobOn")) : t("builtinLocked"),
								onChange: (next) => { void bulkSetFor(groupId, next); },
							}),
							h("button", {
								type: "button",
								className: "plp-collapseBtn",
								"aria-expanded": !isCollapsed,
								onClick: () => toggleCollapse(groupId),
							}, h(ChevronGlyph, { open: !isCollapsed }), isCollapsed ? t("expand") : t("collapse")),
						),
					),
					isCollapsed
						? null
						: items.length === 0
					? h("p", { className: "plp-empty" }, needle === "" ? t("empty") : t("noMatch", { total: persisted.length }))
							: h("ul", {
								className: "plp-cards",
								ref: (element) => {
									// 拖动时用本组的 <ul> 量落点：落点只在同组内计算。
									if (element === null || element === undefined) delete listRefs.current[groupId];
									else listRefs.current[groupId] = element;
								},
							}, items.map((server) => h(PluginRow, {
								key: server.id,
								server,
								state: rowState[server.id],
								custom: prefs.titles[server.id],
								desc: prefs.desc[server.id],
								dragging: dragId === server.id,
								busy: bulkBusy,
								rowRef: (element) => {
									if (element === null || element === undefined) rowRefs.current.delete(server.id);
									else rowRefs.current.set(server.id, element);
								},
								drop: dropOf(server),
								onGripDown: gripDown,
								onGripMove: gripMove,
								onToggle,
								t,
							}))),
				);
			}),
		);
	}

	/**
	 * 侧栏入口的图标：官方插件页用的就是 primitives 的 IconPluginPinwheelOutlineRegular
	 * （读官方 PluginsPanelIcon 确认），这里照用；取不到才用自绘插头。
	 * data-plp-panel 标记必须留在最外层 —— 隐藏官方那个同名入口时靠它认出「哪个是我」。
	 */
	function PluginsIcon({ size, active }) {
		const Official = primitives.IconPluginPinwheelOutlineRegular;
		return h("span", {
			"data-plp-panel": "1",
			"aria-hidden": true,
			style: { display: "inline-flex", opacity: active ? 1 : 0.82 },
		}, Official === undefined ? h(PluginsGlyph, { size }) : h(Official, { size }));
	}

	function apply(ctx) {
		ctx.effect(() => {
			ensureCss();
			return () => {
				if (typeof document === "undefined") return;
				const tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(`${NS}/client.css`)}]`);
				if (tag !== null) tag.remove();
			};
		}, "plugins-panel: stylesheet");
		ctx.effect(() => ctx.locale.register(NS, DICTS), "plugins-panel: dictionaries");

		// 隐藏官方那个「插件」侧栏入口：官方页面本体一动不动，只是把它的按钮藏起来。
		// 认法一（主）：和我同层、同名（aria-label 相同）且不是我的按钮。
		// 认法二（兜底）：紧挨在我前面的那个按钮（官方 order 0、我 0.1，正常就相邻）。
		// 两套都认不到就什么都不做 —— 宁可多一个入口，也绝不乱藏别人的东西。
		ctx.effect(() => {
			if (typeof document === "undefined") return undefined;
			const hidden = [];
			let queued = false;
			const applyHide = () => {
				queued = false;
				const mine = document.querySelector('[data-plp-panel="1"]');
				const button = mine === null ? null : mine.closest("button");
				if (button === null) return;
				const label = button.getAttribute("aria-label");
				const hide = (element) => {
					if (element === null || element === undefined || element === button) return;
					if (element.style.display === "none") return;
					element.style.display = "none";
					hidden.push(element);
				};
				const parent = button.parentElement;
				if (parent !== null && label !== null) {
					for (const other of parent.querySelectorAll("button")) {
						if (other.getAttribute("aria-label") === label) hide(other);
					}
				}
				const previous = button.previousElementSibling;
				if (previous !== null && previous.tagName === "BUTTON" && previous.getAttribute("aria-label") === label) hide(previous);
			};
			const schedule = () => {
				if (queued) return;
				queued = true;
				if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(applyHide);
				else applyHide();
			};
			schedule();
			const observer = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(schedule);
			if (observer !== undefined) observer.observe(document.body, { childList: true, subtree: true });
			return () => {
				if (observer !== undefined) observer.disconnect();
				// 我下线时把官方入口还回去。
				for (const element of hidden) element.style.display = "";
			};
		}, "plugins-panel: hide the shipped plugins entry");
		const t = ctx.locale.bind(NS);
		ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
			name: "sidebar.panellist",
			id: PANEL_ID,
			order: PANEL_ORDER,
			locale: NS,
			label: () => t("panel"),
		}, PluginsIcon));
		ctx.slots.inject("main", () => ctx.slots.register({
			name: "main",
			key: PANEL_ID,
			locale: NS,
		}, (props) => h(PluginsPage, { ...props, ctx, t: props.t === undefined ? t : props.t })));
	}

	exports.name = NS;
	exports.inject = inject;
	exports.apply = apply;
	return module.exports;
}
});
