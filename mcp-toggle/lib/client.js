// dsh-mcp-toggle client bundle: registers the sidebar "MCP" page.
// Hand-written __ModuleLoader__ factory (no build step). React, the UI
// primitives and the icons come from the loader's module table.
//
// The page mirrors other plugins’ sidebar pages: the same
// frame (centered 960px column, 20px/500 title, 13px secondary intro, top-right
// icon button) and the same card list (40px icon seat, name, one-line subtitle,
// controls at the end), with layout in a single injected <style> tag.
//
// Enable/disable actions are NOT file edits: they call the shipped
// `remote.pluginManager.setPluginEnabled(entryId, enabled)` Remote, which
// persists the row's `disabled` override and hot-reloads the row.
window.__ModuleLoader__.load({ id: "dsh-mcp-toggle", factory: (require) => {

	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	const react = require("react");
	const h = react.createElement;
	/** Counts the complete group; search only changes the rows below it. */
	function GroupStatus({ items, loading, synced, t }) {
		const off = items.filter((item) => item.enabled === false).length;
		return h("span", { className: "mct-groupStatus" },
			h("span", { className: "mct-count" }, t("summary", { total: items.length, off })),
			h("span", { className: !loading && synced === true ? "mct-statusOk" : "mct-statusWarn", role: "status" },
				h("span", { className: "mct-dot" }),
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

	const NS = "mcp-toggle";
	/** Nav id and the keyed `main` key must be identical; one addresses the other. */
	const PANEL_ID = "dsh-mcp-toggle";
	const API_PATH = "/api/mcp-toggle";
	/** `remote.pluginManager` answers the row inventory and the enable/disable call. */
	const inject = ["slots", "locale", "remote", "remote.pluginManager"];
	const MCP_MODULE = "@deepseek-ai/dsh-mcp-client";
	/** The nav sits between related sidebar pages (order 0 and 1). */
	const PANEL_ORDER = 0.5;

	//#region styles

	const CSS = [
		// Page gap stays 32px; only adjacent groups gain 16px (48px total).
		".mct-page > .mct-group + .mct-group{margin-top:16px}",
		".mct-group[data-lifted]{opacity:.98;position:relative;z-index:5;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover));box-shadow:0 12px 28px rgba(0,0,0,.24),inset 0 0 0 1px var(--dsw-alias-brand-primary,#2f81f7);will-change:transform}",
		".mct-groupGrip{align-self:center}",
		".mct-groupHeadSplit + .mct-cards,.mct-groupHeadSplit + .mct-empty{margin-top:24px}",
		".mct-resetBtn:hover:not(:disabled),.mct-collapseBtn:hover:not(:disabled),.mct-iconButton:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 96%,transparent);color:var(--dsw-alias-label-primary)}",
		".mct-subhead{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0;width:100%}",
		".mct-resetBtn,.mct-collapseBtn,.mct-iconButton{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;font-family:inherit;font-size:13px;line-height:20px;font-weight:400;height:32px;white-space:nowrap;border-radius:8px;border:0;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent),0 1px 2px rgba(19,45,83,.06);color:var(--dsw-alias-label-primary);transition:background .15s}",
		".mct-resetBtn:disabled,.mct-collapseBtn:disabled,.mct-iconButton:disabled{opacity:.45;cursor:default}",
		".mct-search input{height:32px!important}",
		".mct-groupTitle{overflow-wrap:anywhere}",
		".mct-groupStatus{display:inline-flex;align-items:center;gap:8px 12px;flex-wrap:wrap;font-size:12px;line-height:20px}",
		".mct-groupStatus .mct-count{font-size:12px;white-space:nowrap}",
		".mct-page{box-sizing:border-box;height:100%;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;align-items:center;gap:32px;padding:0 clamp(24px,4vw,48px) 48px;overflow:auto}",
		".mct-page>*{width:100%;max-width:960px}",
		".mct-head{box-sizing:border-box;display:flex;flex-direction:column;gap:4px;padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}",
		".mct-title{margin:0;font-size:20px;font-weight:500;line-height:28px}",
		".mct-intro{margin:0;min-width:0;flex:1;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
		".mct-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex:none}",
		".mct-search{width:200px;height:32px;flex:none;box-sizing:border-box}",
		".mct-search input{font:inherit;font-size:13px;font-weight:400;color:var(--dsw-alias-label-primary)}",
		".mct-search input::placeholder{color:var(--dsw-alias-label-tertiary);opacity:1}",
		".mct-iconButton{width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;flex:none;cursor:pointer}",
		".mct-iconWrap{display:inline-flex}",
		".mct-status{margin:0;display:flex;align-items:center;flex-wrap:wrap;gap:6px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:13px;line-height:20px}",
		".mct-dot{width:7px;height:7px;border-radius:50%;flex:none;background:currentColor}",
		".mct-statusOk{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));display:inline-flex;align-items:center;gap:6px}",
		".mct-statusWarn{color:var(--dsw-alias-state-warn-primary,#e0a458);display:inline-flex;align-items:center;gap:6px}",
		".mct-group{display:flex;flex-direction:column;gap:8px}",
		".mct-groupHead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}",
		".mct-groupTitle{margin:0;font-size:16px;font-weight:500;line-height:24px}",
		".mct-count{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums;font-size:14px}",
		".mct-cards{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px}",
		".mct-card{margin:0 -8px;border-radius:var(--dsw-radius-xl,12px)}",
		".mct-card:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}",
		".mct-cardHead{box-sizing:border-box;display:flex;align-items:center;gap:14px;padding:8px;min-height:80px}",
		".mct-cardIcon{width:40px;height:40px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1));border-radius:var(--dsw-radius-md,8px);color:var(--dsw-alias-label-secondary)}",
		".mct-cardMain{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}",
		".mct-titleRow{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}",
		".mct-name{margin:0;font-size:14px;font-weight:500;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		".mct-card[data-state=off] .mct-name{color:var(--dsw-alias-label-secondary)}",
		".mct-sub{margin:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		".mct-note{margin:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px;overflow-wrap:anywhere}",
		".mct-reason{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;overflow-wrap:anywhere}",
		".mct-ok{margin:0;color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px}",
		".mct-cardEnd{display:inline-flex;align-items:center;gap:10px;flex:none}",
		".mct-dotSlot{width:10px;height:10px;flex:none;display:inline-flex;align-items:center;justify-content:center}",
		".mct-stateUp{color:var(--dsw-alias-state-success-primary,#3fa46a)}",
		".mct-stateDown{color:var(--dsw-alias-state-warn-primary,#e0a458)}",
		".mct-stateOff{color:var(--dsw-alias-state-idle-primary,var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary)))}",
		".mct-stateFailed{color:var(--dsw-alias-state-error-primary)}",
		".mct-empty{margin:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:13px;line-height:20px}",
		".mct-footer{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-size:11.5px;line-height:16px;overflow-wrap:anywhere}",
		".mct-groupHeadSplit{align-items:center;flex-wrap:wrap}",
		".mct-groupActions{margin-left:auto;display:flex;align-items:center;gap:10px;flex:none}",
		".mct-lead{display:inline-flex;align-items:center;gap:1px;flex:none}",
		".mct-grip,.mct-edit{width:22px;height:24px;flex:none;padding:0;display:inline-flex;align-items:center;justify-content:center;border:0;background:0 0;border-radius:var(--dsw-radius-sm,4px);color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));opacity:.45;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}",
		".mct-grip{touch-action:none;cursor:grab}",
		".mct-grip:active{cursor:grabbing}",
		".mct-card:hover .mct-grip,.mct-card:hover .mct-edit,.mct-groupHead:hover .mct-grip,.mct-groupHead:hover .mct-edit,.mct-grip:focus-visible,.mct-edit:focus-visible{opacity:1;color:var(--dsw-alias-label-secondary)}",
		".mct-editInput{box-sizing:border-box;width:min(320px,100%);font:inherit;font-size:14px;font-weight:500;line-height:20px;padding:2px 8px;border:1px solid var(--dsw-alias-brand-primary,#2f81f7);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-input,var(--dsw-alias-bg-layer-2,transparent));color:var(--dsw-alias-label-primary);outline:none}",
		".mct-collapseBtn{display:inline-flex;align-items:center;gap:4px;padding:0 12px;cursor:pointer}",
		".mct-resetBtn{padding:0 12px;cursor:pointer}",
		".mct-card[data-dragging]{opacity:.85;position:relative;z-index:1;background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));box-shadow:0 6px 18px rgba(0,0,0,.18),inset 0 0 0 1px var(--dsw-alias-brand-primary,#2f81f7)}",
		// The picked-up look: the row floats above the list while it is dragged and
		// eases back down on release.
		".mct-card[data-lifted]{opacity:.98;position:relative;z-index:5;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover));box-shadow:0 12px 28px rgba(0,0,0,.24),inset 0 0 0 1px var(--dsw-alias-brand-primary,#2f81f7);will-change:transform}",
		".mct-dragChip{display:inline-flex;align-items:center;height:18px;flex:none;padding:0 7px;border-radius:9px;background:var(--dsw-alias-brand-primary,#2f81f7);color:var(--dsw-alias-label-primary-foreground);font-size:11px;line-height:1;white-space:nowrap}",
		".mct-card[data-drop=into]{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary,#2f81f7)}",
		".mct-chevron{display:inline-flex;transition:transform .15s ease}",
			".mct-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
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
			const element = event.currentTarget.closest("section.mct-group");
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
			type: "button", className: "mct-grip mct-groupGrip",
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
			panel: "MCP",
			title: "MCP 服务器",
			intro: "启用和停用 MCP 服务器",
			refresh: "刷新",
			group: "MCP 服务器",
			summary: "共 {total} 个 · 已关闭 {off} 个",
			loading: "读取中…",
			synced: "已同步",
			unsynced: "未同步",
			empty: "还没有配置 MCP 服务器。服务器写在 profile 的 cordis.patch.yml 里。",
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
			resetConfirm: "恢复默认会清掉这一页的自定义名称、排序和折叠状态，继续吗？",
			search: "搜索 MCP 服务器",
			noMatch: "没有匹配的 MCP 服务器（本页共 {total} 个）",
			saveFailed: "保存失败：{message}",
			saveNeedsRestart: "保存没生效（HTTP {status}）：宿主半边还是旧版本，重启一次 DSH 就好",
			patchFile: "配置文件",
		},
		en: {
			panel: "MCP",
			title: "MCP servers",
			intro: "Enable and disable MCP servers",
			refresh: "Refresh",
			group: "MCP servers",
			summary: "{total} total · {off} off",
			loading: "Loading…",
			synced: "Synced",
			unsynced: "Not synced",
			empty: "No MCP server is configured. Servers live in the profile's cordis.patch.yml.",
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
			reorder: "Hold the handle to drag",
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
			resetConfirm: "Reset clears this page's custom titles, order and collapsed state. Continue?",
			search: "Search MCP servers",
			noMatch: "No MCP server matches (of {total})",
			saveFailed: "Save failed: {message}",
			saveNeedsRestart: "Not saved (HTTP {status}): the host half is still the old build — restart DSH once",
			patchFile: "Config file",
		},
	};

	/** A 401/403 means "refresh the page", not a status code to show raw. */
	function failureCode(response) {
		return response.status === 401 || response.status === 403 ? "authFailed" : `HTTP ${response.status}`;
	}

	/** Read the descriptive half of the page from the plugin's own host route. */
	async function readDescriptors() {
		const response = await fetch(API_PATH, { cache: "no-store" });
		if (!response.ok) throw new Error(failureCode(response));
		const data = await response.json();
		if (data === null || typeof data !== "object" || data.ok !== true) throw new Error(String(data === null || typeof data === "object" ? data.error : "bad response"));
		return data;
	}

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

	function defaultPrefs() {
		return { titles: {}, order: [], collapsed: false, groupTitle: "", bulkOn: undefined };
	}

	/**
	 * The panel's own preferences, normalised. The host half owns the stored
	 * copy; an older host that does not report `prefs` yet simply yields the
	 * defaults, so the page keeps working before DSH is restarted.
	 */
	function normalizePrefs(raw) {
		const prefs = defaultPrefs();
		if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return prefs;
		const titles = raw.titles;
		if (titles !== null && typeof titles === "object" && !Array.isArray(titles)) {
			let kept = 0;
			for (const [key, value] of Object.entries(titles)) {
				if (kept >= 500) break;
				if (typeof key !== "string" || key.length > 300 || typeof value !== "string") continue;
				const name = value.trim().slice(0, 200);
				if (name === "") continue;
				prefs.titles[key] = name;
				kept += 1;
			}
		}
		if (Array.isArray(raw.order)) {
			prefs.order = raw.order
				.filter((item) => typeof item === "string" && item.length > 0 && item.length <= 300)
				.slice(0, 1000);
		}
		prefs.collapsed = raw.collapsed === true;
		if (typeof raw.groupTitle === "string") prefs.groupTitle = raw.groupTitle.trim().slice(0, 200);
		// The knob's remembered direction. Absent means "never clicked", in which case
		// the knob simply shows the real state.
		if (raw.bulkOn === true || raw.bulkOn === false) prefs.bulkOn = raw.bulkOn;
		return prefs;
	}

	/**
	 * Apply the saved order: known rows keep the saved sequence, rows the panel
	 * has never seen (a freshly configured server) stay at the group's end in
	 * their default order.
	 */
	function applyOrder(list, prefs) {
		if (prefs.order.length === 0) return list;
		const rank = new Map(prefs.order.map((id, index) => [id, index]));
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

	/** The 20px glyph inside a card's icon seat: a plug. */
	function McpGlyph() {
		return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true },
			h("path", { d: "M9 3.5v4M15 3.5v4", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }),
			h("path", { d: "M6.5 7.5h11v4.2a5.5 5.5 0 0 1-11 0z", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" }),
			h("path", { d: "M12 17.2v3.3", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }),
		);
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
				className: "mct-iconButton",
				"aria-label": label,
				"aria-busy": busy === true ? true : undefined,
				disabled: disabled === true,
				onClick,
			}, h("span", { className: "mct-iconWrap", "aria-hidden": true },
				busy === true && primitives.StateDot !== undefined ? h(primitives.StateDot, { state: "ongoing", size: 16 }) : glyph,
			)),
		);
	}

	/** The status dot: enabled-with-tools, enabled-without-tools, disabled or failed. */
	function StatusDot({ state }) {
		const className = state === "up" ? "mct-stateUp" : state === "down" ? "mct-stateDown" : state === "failed" ? "mct-stateFailed" : "mct-stateOff";
		return h("span", { className: "mct-dotSlot", "aria-hidden": true },
			h("span", { className, style: { display: "inline-flex" } },
				primitives.StateDot === undefined
					? h("span", { className: "mct-dot" })
					: h(primitives.StateDot, { state: state === "up" ? "done" : state === "failed" ? "error" : state === "down" ? "warning" : "idle", size: 10 }),
			),
		);
	}

	function McpRow(props) {
		const server = props.server;
		const state = props.state;
		const t = props.t;
		const enabled = server.enabled === true;
		const busy = state !== undefined && state.kind === "busy";
		const locked = state !== undefined && state.kind === "locked";
		const dotState = !enabled ? "off" : server.fiberPhase === "failed" ? "failed" : (server.toolCount ?? 0) > 0 ? "up" : "down";
		const lockText = locked ? (typeof state.text === "string" && state.text !== "" ? state.text : t("overridden")) : undefined;
		// The name the owner wrote (or the row id): always the subtitle now, so a
		// custom title never hides which server a row really is.
		const original = server.label === undefined || server.label === "" ? server.id : server.label;
		const custom = props.custom;

		const lead = h("span", { className: "mct-lead" },
			h("button", {
				type: "button",
				className: "mct-grip",
				"aria-label": t("reorder"),
				title: t("reorder"),
				onPointerDown: (event) => props.onGripDown(event, server.id),
			}, h(HandleGlyph, null)),
			
			// An unmistakable "you are holding it" marker: without it, an armed drag
			// and an ignored press look exactly the same.
			props.dragging === true ? h("span", { className: "mct-dragChip" }, t("dragging")) : null,
		);

		const titleBlock = custom === undefined || custom === ""
				? null
				: h("div", { className: "mct-titleRow" }, h("span", { className: "mct-name" }, custom));

		// The picked-up state is a CSS hook only: the drag itself writes the follow
		// offset straight onto this element (see applyLift), because routing a
		// transform through React state re-rendered the whole page on every pointer
		// move and dropped frames.
		const lifted = props.dragging === true;

		return h("li", {
			className: "mct-card",
			ref: props.rowRef,
			"data-state": enabled ? undefined : "off",
			"data-dragging": lifted ? "" : undefined,
			"data-lifted": lifted ? "" : undefined,
			"data-drop": props.drop,
		},
			h("div", { className: "mct-cardHead" },
				lead,
				h("span", { className: "mct-cardIcon" }, h(McpGlyph, null)),
				h("div", { className: "mct-cardMain" },
					titleBlock,
					// The original name keeps the name style until a custom title
					// exists; then it steps down to the subtitle slot rather than
					// disappearing. Unrenamed rows therefore look exactly as before.
					h("p", { className: custom === undefined || custom === "" ? "mct-name" : "mct-sub" }, original),
					h("p", { className: "mct-sub" },
						`${server.id}${server.endpoint === undefined || server.endpoint === "" ? "" : ` · ${server.endpoint}`}`),
					state !== undefined && state.kind === "error" ? h("p", { className: "mct-reason" }, state.text) : null,
					state !== undefined && state.kind === "ok" ? h("p", { className: "mct-ok" }, state.text) : null,
					locked ? h("p", { className: "mct-reason" }, lockText) : null,
				),
				h("div", { className: "mct-cardEnd" },
					h(StatusDot, { state: dotState }),
					h(SwitchControl, {
						checked: enabled,
						disabled: busy || locked,
						label: `${original} · ${t("panel")}`,
						title: locked ? lockText : (enabled ? t("disabled") : t("enabled")),
						onChange: (next) => props.onToggle(server, next),
					}),
				),
			),
		);
	}

	/** The sidebar page. */
	function McpPage(props) {
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
		const ulRef = useRef(null);
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
		/** 一键切换整组进行中：行级成功不再各自刷新，由 bulkSet 收尾统一刷一次。 */
		const bulkRef = useRef(false);

		const setRow = useCallback((id, value) => {
			setRowState((current) => {
				const next = { ...current };
				if (value === undefined) delete next[id];
				else next[id] = value;
				return next;
			});
		}, []);

		/** Persist the display preferences locally, then to the host state file. */
		/** 偏好的写请求排队：连续改名/拖动时，旧快照不能后到把新快照盖掉。 */
		const saveChain = useRef(Promise.resolve());

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
			let refreshOk = true;
			setLoading(true);
			setNotice(undefined);
			try {
				const descriptors = await readDescriptors();
				const byId = new Map();
				for (const item of descriptors.servers ?? []) byId.set(item.id, item);
				const counts = descriptors.toolCounts ?? {};

				let rows;
				try {
					rows = (await listRows(ctx, t)).filter((row) => row.moduleName === MCP_MODULE);
					// 旧请求的结果不许落到界面上：否则一次迟到的失败会把新清单标成「无法同步」。
					if (alive.current && ticket === refreshSeq.current) setSynced(true);
				} catch (error) {
					refreshOk = false;
					rows = [];
					if (alive.current && ticket === refreshSeq.current) {
						setSynced(false);
						setNotice({ kind: "error", text: t("loadFailed", { message: String(error.message ?? error) }) });
					}
				}

				const merged = rows.map((row) => {
					const id = row.patchId ?? row.entryId;
					const descriptor = byId.get(id) ?? byId.get(row.entryId) ?? {};
					return {
						id,
						entryId: row.entryId,
						rowId: row.patchId,
						label: descriptor.label,
						endpoint: descriptor.endpoint,
						serverName: descriptor.serverName,
						transport: descriptor.transport,
						toolCount: descriptor.serverName === undefined ? undefined : counts[descriptor.serverName],
						enabled: row.enabled === true,
						fiberPhase: row.fiberPhase,
						readOnly: row.readOnlyReason,
					};
				});
				// A configured server whose row is missing from the inventory still
				// deserves a line, so the owner can see it exists.
				for (const item of descriptors.servers ?? []) {
					if (merged.some((row) => row.id === item.id)) continue;
					merged.push({
						id: item.id, entryId: undefined, rowId: item.id, label: item.label, endpoint: item.endpoint,
						serverName: item.serverName, transport: item.transport, toolCount: counts[item.serverName],
						enabled: false, fiberPhase: null, readOnly: undefined, absent: true,
					});
				}
				merged.sort((left, right) => String(left.id).localeCompare(String(right.id)));
				if (!alive.current || ticket !== refreshSeq.current) return false;
				setServers(merged);
				setSummary({ total: merged.length, off: merged.filter((row) => !row.enabled).length });
				// The host's copy is read once: every later change goes out through
				// savePrefs, so a background refresh cannot undo an edit.
				if (!prefsLoaded.current) {
					prefsLoaded.current = true;
					setPrefs(normalizePrefs(descriptors.prefs));
				}
				if (options !== undefined && options.clearNotices === true) setRowState({});
				return refreshOk;
			} catch (error) {
				// 旧请求的失败同样不许落到界面上：否则一次迟到的失败会把新一次的成果清空。
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
		const setEnabled = useCallback(async (server, enabled) => {
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
				// 一键切整组时每行都刷一次是刷新风暴：bulk 期间跳过，由 bulkSet 收尾统一刷一次。
				if (!bulkRef.current) void refresh();
				return true;
			} catch (error) {
				setRow(server.id, { kind: "error", text: t("writeFailed", { message: String(error.message ?? error) }) });
				return false;
			}
		}, [ctx, t, setRow, verifyRow, refresh]);

		const onToggle = useCallback((server, enabled) => {
			void setEnabled(server, enabled);
		}, [setEnabled]);


		const persisted = applyOrder(servers ?? [], prefs);
		// While a row is being dragged the live preview is what the list draws, so
		// the dragged row follows the pointer.
		const drawn = preview === null ? persisted : reorderBy(preview, persisted);
		// The search box filters what the page draws, and the count, the knob and the
		// drag all work on what is drawn — the same rule the skills page uses. The
		// saved order still holds every server's place, so hidden rows never move.
		const needle = query.trim().toLowerCase();
		const list = needle === ""
			? drawn
			: drawn.filter((server) => {
				const custom = prefs.titles[server.id] === undefined ? "" : prefs.titles[server.id];
				const endpoint = server.endpoint === undefined ? "" : server.endpoint;
				return `${server.label} ${custom} ${server.id} ${endpoint}`.toLowerCase().includes(needle);
			});
		const rowKeys = list.map((server) => server.id);
		const dragFrom = dragId === null ? -1 : rowKeys.indexOf(dragId);
		const targets = list.filter((server) => server.entryId !== undefined);
		// What the rows really say.
		const realityOn = targets.length > 0 && targets.every((server) => server.enabled === true);
		// What the knob shows: the direction it was last asked to move in, remembered
		// across reloads. A row that cannot be turned on (the switch fails, the plugin
		// will not start) used to snap the knob straight back to "off", which left no
		// way to reach "turn everything off" in one click — the knob is a latch now, so
		// only clicking it (or 恢复默认) changes its direction.
		const allOn = typeof prefs.bulkOn === "boolean" ? prefs.bulkOn : realityOn;
		const collapsed = prefs.collapsed === true;

		/** The group's own switch: skip unaddressable rows and report the count. */
		const bulkSet = async (enabled) => {
			// The knob moves the instant it is clicked, and it stays there whatever the
			// rows do afterwards: a failed row must not pull it back.
			if (prefs.bulkOn !== enabled) savePrefs({ ...prefs, bulkOn: enabled });
			let skip = list.length - targets.length;
			let ok = 0;
			// bulk 期间跳过行级刷新，避免 N 行 N 刷的刷新风暴。
			bulkRef.current = true;
			setBulkBusy(true);
			try {
				for (const server of targets) {
					if (server.enabled === enabled) continue;
					if (await setEnabled(server, enabled)) ok += 1;
					else skip += 1;
				}
			} finally {
				bulkRef.current = false;
				setBulkBusy(false);
			}
			// 刷新会先同步清掉提示（refresh 开头 setNotice(undefined)），
			// 所以必须「先刷新、后提示」，否则「已切换 N 个」几乎立刻就被抹掉。
			const refreshed = await refresh();
			if (!alive.current || !refreshed) return;
			setNotice({ kind: "ok", text: skip > 0 ? t("bulkDoneSkip", { ok, skip }) : t("bulkDone", { ok }) });
		};

		const toggleCollapse = () => { savePrefs({ ...prefs, collapsed: prefs.collapsed !== true }); };

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

		/** Where the list starts right now: a drag has to follow the page as it scrolls. */
		const listTop = () => {
			const ul = ulRef.current;
			if (ul === null || typeof ul.getBoundingClientRect !== "function") return 0;
			return ul.getBoundingClientRect().top;
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

		const slotFor = (clientY, draggedId) => {
			const ul = ulRef.current;
			if (ul === null) return -1;
			const dragged = rowRefs.current.get(draggedId);
			const cards = [];
			const all = ul.querySelectorAll("li.mct-card");
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
				index0: Math.max(0, rowKeys.indexOf(id)),
				// How far the list has moved the row under the pointer since the grab.
				// Accumulated from real measurements, never assumed from a row height:
				// a row with a reason line is taller than its neighbours.
				shift: 0,
				// The page has to follow a drag: the list moves under the pointer while
				// the pointer itself may not move at all.
				scroller: scrollParentOf(ulRef.current),
				listTop0: listTop(),
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
				const start = rowKeys.indexOf(id);
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
			const current = previewRef.current === null ? rowKeys.slice() : previewRef.current.slice();
			const others = current.filter((key) => key !== hold.id);
			const slot = slotFor(hold.lastY, hold.id);
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
			const layoutTop = hold.layoutTop0 + hold.shift + (listTop() - hold.listTop0);
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
			const changed = live.length !== rowKeys.length || live.some((key, index) => key !== rowKeys[index]);
			setPreview(null);
			previewRef.current = null;
			// Hold the current offset for one frame, then let the row ease down into
			// its new slot: "松开手，缓缓落位".
			settleRow(id, releasedDy);
			if (!changed) return;
			// Merge the dragged order back into the FULL list, so rows the search box is
			// hiding keep the places they had.
			const shownSet = new Set(rowKeys);
			let cursor = 0;
			const merged = persisted.map((server) => (shownSet.has(server.id) ? live[cursor++] : server.id));
			savePrefs({ ...prefs, order: merged });
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

		/** The row whose place the dragged row would take. */
		const dropOf = (index) => {
			if (dragId === null || dropIndex === null || dropIndex === dragFrom) return undefined;
			return index === dropIndex ? "into" : undefined;
		};

		return h("div", { className: "mct-page" },
			h("div", { className: "mct-head" },
				h("h2", { className: "mct-title" }, t("title")),
				h("div", { className: "mct-subhead" },
					h("p", { className: "mct-intro" }, t("intro")),
					h("div", { className: "mct-toolbar" },
						h("button", { type: "button", className: "mct-resetBtn", onClick: resetPage }, t("reset")),
						h(IconButton, { label: t("refresh"), glyph: h(RefreshIcon, null), busy: loading, disabled: loading, onClick: () => { void refresh({ clearNotices: true }); } }),
						h(InputControl, {
						className: "mct-search",
						value: query,
						placeholder: t("search"),
						"aria-label": t("search"),
						spellCheck: false,
						onChange: (event) => setQuery(event.target.value),
					}),
					),
				),
			),
			notice === undefined ? null : h("p", { className: notice.kind === "ok" ? "mct-ok" : "mct-reason" }, notice.text),
			h("section", { className: "mct-group" },
				h("div", { className: "mct-groupHead mct-groupHeadSplit" },
					h("div", { className: "mct-groupHead" },
						h(GroupGrip, { t }),
						h("h3", { className: "mct-groupTitle" }, prefs.groupTitle === "" ? t("group") : prefs.groupTitle),
						h(GroupStatus, { items: persisted, loading, synced, t }),
						
					),
					h("div", { className: "mct-groupActions" },
						h(SwitchControl, {
							checked: allOn,
							disabled: bulkBusy || targets.length === 0,
							label: allOn ? t("knobOff") : t("knobOn"),
							title: allOn ? t("knobOff") : t("knobOn"),
							onChange: (next) => { void bulkSet(next); },
						}),
						h("button", {
							type: "button",
							className: "mct-collapseBtn",
							"aria-expanded": !collapsed,
							onClick: toggleCollapse,
						}, h(ChevronGlyph, { open: !collapsed }), collapsed ? t("expand") : t("collapse")),
					),
				),
				collapsed
					? null
					: list.length === 0
						? h("p", { className: "mct-empty" }, needle === "" ? t("empty") : t("noMatch", { total: drawn.length }))
						: h("ul", { className: "mct-cards", ref: ulRef }, list.map((server, index) => h(McpRow, {
							key: server.id,
							server,
							state: rowState[server.id],
							custom: prefs.titles[server.id],
							dragging: dragId === server.id,
							// The drag measures and animates the real element, so it needs
							// a handle on every row.
							rowRef: (element) => {
								if (element === null || element === undefined) rowRefs.current.delete(server.id);
								else rowRefs.current.set(server.id, element);
							},
							drop: dropOf(index),
							onGripDown: gripDown,
							onGripMove: gripMove,
							onToggle,
							t,
						}))),
			),
		);
	}

	/** The sidebar nav glyph: a plug. */
	function McpIcon({ size, active }) {
		return h("svg", {
			width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true,
			style: { opacity: active ? 1 : 0.82 },
		},
			h("path", { d: "M9.5 3.5v4M14.5 3.5v4", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" }),
			h("path", { d: "M7 7.5h10v3.7a5 5 0 0 1-10 0z", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" }),
			h("path", { d: "M12 16.2v4.3", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" }),
		);
	}

	function apply(ctx) {
		ctx.effect(() => {
			ensureCss();
			return () => {
				if (typeof document === "undefined") return;
				const tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(`${NS}/client.css`)}]`);
				if (tag !== null) tag.remove();
			};
		}, "mcp-toggle: stylesheet");
		ctx.effect(() => ctx.locale.register(NS, DICTS), "mcp-toggle: dictionaries");
		const t = ctx.locale.bind(NS);
		ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
			name: "sidebar.panellist",
			id: PANEL_ID,
			order: PANEL_ORDER,
			locale: NS,
			label: () => t("panel"),
		}, McpIcon));
		ctx.slots.inject("main", () => ctx.slots.register({
			name: "main",
			key: PANEL_ID,
			locale: NS,
		}, (props) => h(McpPage, { ...props, ctx, t: props.t === undefined ? t : props.t })));
	}

	exports.name = NS;
	exports.inject = inject;
	exports.apply = apply;
	return module.exports;
}
});
