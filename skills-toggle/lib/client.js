// dsh-skills-toggle client bundle: registers the sidebar "技能" page.
// Hand-written __ModuleLoader__ factory (no build step). React, the UI
// primitives and the icon sets come from the loader's module table.
//
// The page deliberately mirrors the shipped Plugins page: the same page frame
// (centered 960px column, 20px/500 title, 13px secondary intro, right-aligned
// toolbar), the same card list (40px icon seat, 14px/500 name, one-line 13px
// description, controls at the end), and the same theme tokens. Layout lives in
// one injected <style> tag because a hand-written bundle cannot import another
// package's CSS module.
//
// The page can also be arranged by its owner, exactly like other plugins: a custom title per row (the original name always stays in the subtitle
// slot), a six-dot grip in front of every row and every group head that reorders
// on a 300ms hold, a renameable / foldable group head carrying one bulk knob,
// and a "restore defaults" button. Those are DISPLAY preferences only; they are
// stored in the host half's state file and never touch a skill file.
window.__ModuleLoader__.load({ id: "dsh-skills-toggle", factory: (require) => {

	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	const react = require("react");
	const h = react.createElement;
	/** Counts the complete group; search only changes the rows below it. */
	function GroupStatus({ items, loading, synced, t }) {
		const off = items.filter((item) => item.model.off === true && item.manual.off === true).length;
		return h("span", { className: "dst-groupStatus" },
			h("span", { className: "dst-count" }, t("summary", { total: items.length, off })),
			h("span", { className: !loading && synced === true ? "dst-statusOk" : "dst-statusWarn", role: "status" },
				h("span", { className: "dst-dot" }),
				loading ? t("loading") : synced === true ? t("verified") : t("unverified")),
		);
	}

	const { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } = react;
	/** Older React builds have no layout effect; falling back keeps the page alive. */
	const useLayout = typeof useLayoutEffect === "function" ? useLayoutEffect : useEffect;

	/** UI primitives the page prefers; each has a plain fallback below. */
	let primitives = {};
	try {
		primitives = require("@deepseek-ai/dsh-client-ui-primitives");
	} catch {
		primitives = {};
	}

	const NS = "skills-toggle";
	/** Nav id and the keyed `main` key must be identical; one addresses the other. */
	const PANEL_ID = "dsh-skills-toggle";
	const API_PATH = "/api/skills-toggle";
	const inject = ["slots", "locale", "remote", "remote.skills", "sessions"];

	/**
	 * A managed root is `<project>/.dsh/skills`, or the bundled official skills
	 * directory `<install>/resources/runtime/office-skills` (2026-10-17: added so
	 * the panel can switch bundled skills off). `.agents/skills` is deliberately
	 * gone — that is ChatCut Desktop's own folder and the host half rejects it.
	 */
	const MANAGED_ROOT_PATTERN = /(?:[\\/]\.dsh[\\/]skills|[\\/]resources[\\/]runtime[\\/]office-skills)[\\/]?$/i;

	/** The three sections the page arranges. The ids never change. */
	const GROUP_IDS = ["user", "project", "chatcut"];
	/** Default group title per section, looked up in the dictionaries. */
	const GROUP_TITLE_KEY = { user: "userGroup", project: "projectGroup", chatcut: "chatcutGroup" };
	/**
	 * The group order rides inside `prefs.order` under a reserved key, because
	 * `prefs` has exactly four fields and one of them is the order map. The key
	 * cannot collide with a section id and it is length-bounded like any other.
	 */
	const GROUP_ORDER_KEY = "__groups__";
	/** Hold this long on a grip to arm a drag; anything shorter is a click. */
	const HOLD_MS = 300;
	/**
	 * The follow easing. Short on purpose: a longer ease made the element feel like
	 * it was lagging behind the pointer, which reads as "not smooth" even though it
	 * is technically animated.
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

	//#region styles

	/**
	 * Own class names carrying the Plugins page's visual values. Theme tokens are
	 * referenced with fallbacks so a token a deployment does not define degrades
	 * to a sensible colour instead of an unstyled page.
	 */
	const CSS = [
		".dst-groupHeadSplit + .dst-cards,.dst-groupHeadSplit + .dst-empty{margin-top:24px}",
		".dst-resetBtn:hover:not(:disabled),.dst-collapseBtn:hover:not(:disabled),.dst-iconButton:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 96%,transparent);color:var(--dsw-alias-label-primary)}",
		".dst-subhead{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0;width:100%}",
		".dst-resetBtn,.dst-collapseBtn,.dst-iconButton{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;font-family:inherit;font-size:13px;line-height:20px;font-weight:400;height:32px;white-space:nowrap;border-radius:8px;border:0;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 80%,transparent);box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent),0 1px 2px rgba(19,45,83,.06);color:var(--dsw-alias-label-primary);transition:background .15s}",
		".dst-resetBtn:disabled,.dst-collapseBtn:disabled,.dst-iconButton:disabled{opacity:.45;cursor:default}",
		".dst-search input{height:32px!important}",
		".dst-groupTitle{overflow-wrap:anywhere}",
		".dst-groupStatus{display:inline-flex;align-items:center;gap:8px 12px;flex-wrap:wrap;font-size:12px;line-height:20px}",
		".dst-groupStatus .dst-count{font-size:12px;white-space:nowrap}",
		".dst-page{box-sizing:border-box;height:100%;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;align-items:center;gap:32px;padding:0 clamp(24px,4vw,48px) 48px;overflow:auto}",
		".dst-page>*{width:100%;max-width:960px}",
		".dst-head{box-sizing:border-box;display:flex;flex-direction:column;gap:4px;padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}",
		".dst-title{margin:0;font-size:20px;font-weight:500;line-height:28px}",
		".dst-intro{margin:0;min-width:0;flex:1;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
		".dst-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex:none}",
		".dst-search{width:200px;height:32px;flex:none;box-sizing:border-box}",
		".dst-search input{font:inherit;font-size:13px;font-weight:400;color:var(--dsw-alias-label-primary)}",
		".dst-search input::placeholder{color:var(--dsw-alias-label-tertiary);opacity:1}",
		// The refresh control is the Plugins page's icon button: a 32px square that
		// only shows its glyph, with the hover label supplied by a Tooltip.
		".dst-iconButton{width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;flex:none;cursor:pointer}",
		".dst-iconWrap{display:inline-flex}",
		".dst-resetBtn{padding:0 12px;cursor:pointer}",
		".dst-status{margin:0;display:flex;align-items:center;flex-wrap:wrap;gap:6px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:13px;line-height:20px}",
		".dst-dot{width:7px;height:7px;border-radius:50%;flex:none;background:currentColor}",
		".dst-statusOk{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));display:inline-flex;align-items:center;gap:6px}",
		".dst-statusWarn{color:var(--dsw-alias-state-warn-primary,#e0a458);display:inline-flex;align-items:center;gap:6px}",
		".dst-groups{display:flex;flex-direction:column;gap:48px}",
		".dst-group{display:flex;flex-direction:column;gap:8px}",
		".dst-groupHead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}",
		// The group head carries a grip, a title, a count, a bulk knob and
		// the fold button, so it needs the full row and centre alignment rather than
		// the baseline-aligned title/count pair.
		".dst-groupHeadSplit{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}",
		".dst-groupTitleRow{align-items:center}",
		".dst-groupActions{margin-left:auto;display:inline-flex;align-items:center;gap:10px;flex:none}",
		".dst-chevron{display:inline-flex;align-items:center;transition:transform 120ms ease}",
		".dst-chevron[data-open=true]{transform:rotate(180deg)}",
		".dst-groupTitle{margin:0;font-size:16px;font-weight:500;line-height:24px}",
		".dst-count{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums;font-size:14px}",
		".dst-cards{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px}",
		".dst-card{margin:0 -8px;border-radius:var(--dsw-radius-xl,12px)}",
		".dst-card:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}",
		".dst-cardHead{box-sizing:border-box;display:flex;align-items:center;gap:14px;padding:8px;min-height:80px}",
		".dst-cardIcon{width:40px;height:40px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1));border-radius:var(--dsw-radius-md,8px);color:var(--dsw-alias-label-secondary)}",
		".dst-cardMain{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}",
		".dst-titleRow{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}",
		".dst-name{font-size:14px;font-weight:500;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		// The original name keeps its place even when a custom title is drawn above
		// it, so a row can never hide which skill it really is.
		".dst-sub{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		".dst-card[data-state=off] .dst-name{color:var(--dsw-alias-label-secondary)}",
		".dst-desc{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}",
	// 简介那一行：文字 + 行末铅笔（与插件页 plp-descRow 同构）。
	".dst-descRow{display:flex;align-items:center;gap:6px;min-width:0}",
	".dst-descRow .dst-desc{flex:1 1 auto;min-width:0}",
	".dst-descEmpty{opacity:.55}",
		".dst-note{margin:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px;overflow-wrap:anywhere}",
		".dst-reason{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;overflow-wrap:anywhere;white-space:pre-wrap}",
		".dst-ok{margin:0;color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px}",
		".dst-cardEnd{display:inline-flex;align-items:center;gap:10px;flex:none}",
		".dst-switch{display:inline-flex;align-items:center;gap:6px}",
		".dst-switchLabel{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px}",
		".dst-link{margin-left:8px;padding:0;border:0;background:none;color:inherit;font-size:12px;line-height:18px;text-decoration:underline;cursor:pointer}",
		".dst-empty{margin:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:13px;line-height:20px}",
		".dst-roots{display:flex;flex-direction:column;gap:2px}",
		".dst-footer{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-size:11.5px;line-height:16px;overflow-wrap:anywhere}",
		// The row prefix: the six-dot grip, faint until the
		// row (or the group head) is hovered.
		".dst-lead{display:inline-flex;align-items:center;gap:1px;flex:none}",
		".dst-dragChip{display:inline-flex;align-items:center;height:18px;flex:none;padding:0 7px;border-radius:9px;background:var(--dsw-alias-brand-primary,#2f81f7);color:var(--dsw-alias-label-primary-foreground);font-size:11px;line-height:1;white-space:nowrap}",
		".dst-grip{width:22px;height:24px;flex:none;padding:0;display:inline-flex;align-items:center;justify-content:center;border:0;background:0 0;border-radius:var(--dsw-radius-sm,4px);color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));opacity:.45;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}",
		".dst-grip{touch-action:none;cursor:grab}",
		".dst-grip:active{cursor:grabbing}",
		".dst-card:hover .dst-grip,.dst-groupHead:hover .dst-grip,.dst-grip:focus-visible{opacity:1;color:var(--dsw-alias-label-secondary)}",
		".dst-collapseBtn{display:inline-flex;align-items:center;gap:4px;padding:0 12px;cursor:pointer}",
		".dst-card[data-dragging],.dst-group[data-dragging]{opacity:.85;position:relative;z-index:1;background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));box-shadow:0 6px 18px rgba(0,0,0,.18),inset 0 0 0 1px var(--dsw-alias-brand-primary,#2f81f7)}",
		// The picked-up look: the row (or the whole section) floats above the list
		// while it is dragged, and eases back down on release.
		".dst-card[data-lifted],.dst-group[data-lifted]{opacity:.98;position:relative;z-index:5;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover));box-shadow:0 12px 28px rgba(0,0,0,.24),inset 0 0 0 1px var(--dsw-alias-brand-primary,#2f81f7);will-change:transform}",
		".dst-card[data-drop=into],.dst-group[data-drop=into]{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary,#2f81f7)}",
			".dst-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
].join("");

	/**
	 * Install the stylesheet once, following the module system's convention so it
	 * can clean the tag up on reload. Safe to call repeatedly: a tag stripped by a
	 * hot reload (or never installed) is simply put back.
	 */
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
			panel: "技能",
			title: "技能",
			intro: "启用、停用和配置技能",
			search: "搜索技能",
			noMatch: "没有匹配的技能（本组共 {total} 个）",
			refresh: "刷新",
			userGroup: "我的技能",
			projectGroup: "本项目",
			chatcutGroup: "ChatCut",
			emptyChatcut: "没有找到 ChatCut 技能。它们由 ChatCut 桌面应用装在 ~/.agents/skills 里。",
			chatcutManifest: "清单：{path}{error}",
			emptyUser: "这个目录里还没有技能。",
			emptyProject: "本会话没有项目级技能。项目技能放在 <项目>/.dsh/skills，会跟着项目一起走。",
			model: "模型",
			manual: "手动",
			summary: "共 {total} 个 · 已关闭 {off} 个",
			unverified: "未同步",
			verified: "已同步",
			loading: "读取中…",
			edited: "已改",
			duplicateTag: "同名",
			retry: "重试",
			lockedBroken: "文件本身有问题，DSH 会丢弃这个技能；先修好文件再动开关",
			lockedUnverified: "没能与 DSH 核验成功，已锁住开关以免误操作",
			mismatchStillOff: "开关没生效：DSH 里这个技能仍是关闭状态",
			mismatchStillOn: "开关没生效：DSH 里这个技能已是开启状态",
			mismatchMissing: "开关没生效：这个技能仍然出现在 DSH 里",
			mismatchPresent: "开关没生效：这个技能没有出现在 DSH 里",
			mismatchDuplicate: "有同名技能，无法逐项核验",
			applied: "已生效",
			reverted: "已自动回滚：{message}",
			writeFailed: "失败：{message}",
			authFailed: "会话未通过鉴权，请刷新页面后重试",
			loadFailed: "读取失败：{message}",
			stateFile: "状态文件",
			rootMissing: "目录不存在",
			rootReadFailed: "技能目录读取异常",
			rootError: "读取异常：{message}",
			openModel: "允许模型调用",
			closeModel: "禁止模型调用",
			openManual: "允许手动调用",
			closeManual: "禁止手动调用",
			reorder: "按住拖动排序",
			dragging: "拖动中…",
			edit: "改名",
			editHint: "自定义名称（留空恢复原名）",
			editDesc: "改简介",
			editDescHint: "自定义简介（留空恢复官方那句）",
			descEmpty: "（没有简介）",
			descSaved: "简介已写入 SKILL.md（/ 面板同步）",
			collapse: "折叠",
			expand: "展开",
			knobOn: "一键启用本组全部",
			knobOff: "一键停用本组全部",
			bulkDone: "已切换 {ok} 个",
			bulkDoneSkip: "已切换 {ok} 个 · 跳过 {skip} 个",
			bulkProgress: "正在{action} {done}/{total}…",
			bulkEnableAction: "开启",
			bulkDisableAction: "关闭",
			reset: "恢复默认",
			resetConfirm: "恢复默认会清掉这一页的自定义名称、分组名称、排序和折叠状态，继续吗？",
			saveFailed: "保存失败：{message}",
			saveNeedsRestart: "保存没生效（HTTP {status}）：宿主半边还是旧版本，重启一次 DSH 就好",
		},
		en: {
			panel: "Skills",
			title: "Skills",
			intro: "Enable, disable, and configure skills",
			search: "Search skills",
			noMatch: "No skill matches (of {total} in this section)",
			refresh: "Refresh",
			userGroup: "My skills",
			projectGroup: "This project",
			chatcutGroup: "ChatCut",
			emptyChatcut: "No ChatCut skills found. The ChatCut desktop app installs them under ~/.agents/skills.",
			chatcutManifest: "Manifest: {path}{error}",
			emptyUser: "No skills in this directory yet.",
			emptyProject: "No project-level skills in this session. They live in <project>/.dsh/skills and travel with the project.",
			model: "Model",
			manual: "Manual",
			summary: "{total} total · {off} off",
			unverified: "Not synced",
			verified: "Synced",
			loading: "Loading…",
			edited: "edited",
			duplicateTag: "duplicate",
			retry: "Retry",
			lockedBroken: "The file itself is broken, so DSH drops this skill; fix it before using the switches",
			lockedUnverified: "Verification against DSH failed, so the switches are locked",
			mismatchStillOff: "The switch did not take effect: DSH still reports it off",
			mismatchStillOn: "The switch did not take effect: DSH already reports it on",
			mismatchMissing: "The switch did not take effect: it still appears in DSH",
			mismatchPresent: "The switch did not take effect: it does not appear in DSH",
			mismatchDuplicate: "A duplicate skill name makes verification impossible",
			applied: "Applied",
			reverted: "Rolled back automatically: {message}",
			writeFailed: "Failed: {message}",
			authFailed: "Session authentication failed, please refresh the page and try again",
			loadFailed: "Failed to read: {message}",
			stateFile: "State file",
			rootMissing: "directory does not exist",
			rootReadFailed: "Could not read a skill directory",
			rootError: "read error: {message}",
			openModel: "Allow model invocation",
			closeModel: "Block model invocation",
			openManual: "Allow manual invocation",
			closeManual: "Block manual invocation",
			reorder: "Hold the handle to drag",
			dragging: "Dragging…",
			edit: "Rename",
			editHint: "Custom title (empty restores the original)",
			editDesc: "Edit description",
			editDescHint: "Custom description (empty restores the original)",
			descEmpty: "(no description)",
			descSaved: "Description saved into SKILL.md (/ panel follows)",
			collapse: "Collapse",
			expand: "Expand",
			knobOn: "Enable everything in this group",
			knobOff: "Disable everything in this group",
			bulkDone: "Switched {ok}",
			bulkDoneSkip: "Switched {ok} · skipped {skip}",
			bulkProgress: "{action} {done}/{total}…",
			bulkEnableAction: "enabling",
			bulkDisableAction: "disabling",
			reset: "Reset",
			resetConfirm: "Reset clears this page's custom titles, group names, order and collapsed state. Continue?",
			saveFailed: "Save failed: {message}",
			saveNeedsRestart: "Not saved (HTTP {status}): the host half is still the old build — restart DSH once",
		},
	};

	/** A 401/403 means "refresh the page", not a status code to show raw. */
	function failureCode(response) {
		return response.status === 401 || response.status === 403 ? "authFailed" : `HTTP ${response.status}`;
	}

	/** One fetch wrapper for the fenced host route. */
	async function callApi(body) {
		const response = body === undefined
			? await fetch(API_PATH, { cache: "no-store" })
			: await fetch(API_PATH, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
		if (!response.ok) throw new Error(failureCode(response));
		const data = await response.json();
		if (data !== null && typeof data === "object" && data.ok === false) throw new Error(String(data.error ?? "HTTP error"));
		return data;
	}

	//#region display preferences

	/** The page's own preferences, all four maps empty by default. */
	function defaultPrefs() {
		return { titles: {}, descs: {}, groupTitles: {}, order: {}, collapsed: {}, bulk: {} };
	}

	/** The inline editor key of one group head: never a skill file path. */
	/**
	 * Element tops by key (plus the picked-up element's own top), captured just
	 * before a live reorder so the FLIP pass can animate what moved.
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

	/**
	 * The panel's own preferences, normalised. The host half owns the stored
	 * copy; an older host that does not report `prefs` yet simply yields the
	 * defaults, so the page keeps working before DSH is restarted.
	 */
	function normalizePrefs(raw) {
		const prefs = defaultPrefs();
		if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return prefs;
		const names = (source) => {
			const out = {};
			if (source === null || typeof source !== "object" || Array.isArray(source)) return out;
			for (const [key, value] of Object.entries(source)) {
				if (typeof value !== "string") continue;
				const name = value.trim();
				if (name !== "") out[key] = name;
			}
			return out;
		};
		prefs.titles = names(raw.titles);
		prefs.descs = names(raw.descs);
		prefs.groupTitles = names(raw.groupTitles);
		if (raw.order !== null && typeof raw.order === "object" && !Array.isArray(raw.order)) {
			for (const [key, value] of Object.entries(raw.order)) {
				if (!Array.isArray(value)) continue;
				prefs.order[key] = value.filter((item) => typeof item === "string" && item !== "");
			}
		}
		if (raw.collapsed !== null && typeof raw.collapsed === "object" && !Array.isArray(raw.collapsed)) {
			for (const [key, value] of Object.entries(raw.collapsed)) if (value === true) prefs.collapsed[key] = true;
		}
		// The knob's remembered direction, per section. A key that is absent means that
		// section's knob was never clicked, so it shows the real state.
		if (raw.bulk !== null && typeof raw.bulk === "object" && !Array.isArray(raw.bulk)) {
			for (const [key, value] of Object.entries(raw.bulk)) {
				if (value === true || value === false) prefs.bulk[key] = value;
			}
		}
		return prefs;
	}

	/**
	 * Apply the saved order: rows the page has seen keep the saved sequence, rows
	 * it has never seen (a skill installed since) stay at the group's end in
	 * their default order.
	 */
	function applyOrder(list, saved) {
		const order = Array.isArray(saved) ? saved : [];
		if (order.length === 0) return list;
		const rank = new Map(order.map((id, index) => [id, index]));
		const known = list.filter((item) => rank.has(item.file)).sort((left, right) => rank.get(left.file) - rank.get(right.file));
		const rest = list.filter((item) => !rank.has(item.file));
		return [...known, ...rest];
	}

	/** The same rule for the three sections themselves. */
	function applyGroupOrder(ids, saved) {
		const order = Array.isArray(saved) ? saved : [];
		if (order.length === 0) return ids;
		const rank = new Map(order.map((id, index) => [id, index]));
		const known = ids.filter((id) => rank.has(id)).sort((left, right) => rank.get(left) - rank.get(right));
		const rest = ids.filter((id) => !rank.has(id));
		return [...known, ...rest];
	}

	/**
	 * 一键开关整组时要提交的 changes：每行按需翻「模型 / 手动」两个开关。
	 * 抽成纯函数是为了让「整组一次提交」这件事在 client 侧可以离线断言 ——
	 * 宿主的 apply 路由本就收一个 changes 数组（≤200 项，Host 一次全量重扫），
	 * 逐行各发一次 POST 会让整组操作退化成 O(N²) 的重扫。
	 */
	function bulkChangesFor(targets, enabled) {
		const changes = [];
		for (const skill of targets) {
			if (skill.model.off === enabled) changes.push({ file: skill.file, key: "model", enabled });
			if (skill.manual.off === enabled) changes.push({ file: skill.file, key: "manual", enabled });
		}
		return changes;
	}

	//#endregion

	/** The retained, open session this page can verify against, if any. */
	function pickSessionId(ctx) {
		try {
			const list = ctx.sessions === undefined ? undefined : ctx.sessions.list;
			const snapshot = list !== undefined && typeof list.getSnapshot === "function" ? list.getSnapshot() : undefined;
			const ids = snapshot === undefined ? undefined : snapshot.ids;
			if (!Array.isArray(ids)) return undefined;
			for (let index = ids.length - 1; index >= 0; index -= 1) {
				const id = ids[index];
				const entry = snapshot.byId === undefined ? undefined : snapshot.byId[id];
				const retained = entry === undefined || entry.retainedBy === undefined ? undefined : entry.retainedBy.mainView;
				if (typeof retained === "number" && retained > 0) return id;
			}
		} catch {
			// A missing or reshaped sessions service simply means "cannot verify".
		}
		return undefined;
	}

	/**
	 * Read the live skill catalog for one session. This is the only source that
	 * reflects what DSH actually applied, which is what lets the panel say "the
	 * switch did not take effect" instead of trusting its own write.
	 */
	async function fetchCatalog(ctx, sessionId) {
		const sessions = ctx.sessions;
		if (sessions === undefined || typeof sessions.binding !== "function") throw new Error("no-session");
		if (sessions.binding(sessionId) === undefined) throw new Error("no-session");
		const abort = new AbortController();
		try {
			return await sessions.using(sessionId, { source: "skills-toggle", signal: abort.signal }, async () => {
				const result = await ctx.remote.skills.list({ sessionId }, abort.signal);
				if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
				return result.value.skills;
			});
		} finally {
			abort.abort();
		}
	}

	/** Which project-side roots the catalog reveals, derived from skill paths. */
	function projectRootsFromCatalog(catalog, userRoot) {
		const roots = [];
		for (const entry of catalog) {
			if (typeof entry.path !== "string") continue;
			const directory = entry.path.replace(/[\\/][^\\/]*$/, "");
			const root = /[\\/]SKILL\.md$/i.test(entry.path) ? directory.replace(/[\\/][^\\/]*$/, "") : directory;
			if (root === userRoot) continue;
			if (!MANAGED_ROOT_PATTERN.test(root)) continue;
			if (!roots.includes(root)) roots.push(root);
		}
		return roots;
	}

	/** Names that appear more than once cannot be verified one by one. */
	function duplicateNames(skills) {
		const seen = new Map();
		for (const skill of skills) seen.set(skill.name, (seen.get(skill.name) ?? 0) + 1);
		const duplicates = new Set();
		for (const [name, count] of seen) if (count > 1) duplicates.add(name);
		return duplicates;
	}

	/**
	 * What the catalog must say for a skill's file state to count as applied.
	 * A skipped expectation (`undefined`) means the skill cannot be verified.
	 */
	function expectationFor(skill) {
		if (skill.problems.length > 0) return undefined;
		// DSH's catalog is pre-filtered to user-invocable skills, so a manual-off
		// skill must be entirely absent from it.
		if (skill.manual.off) return { present: false };
		return { present: true, modelInvocable: !skill.model.off };
	}

	/** Compare one catalog lookup against an expectation. */
	function mismatchOf(entry, expected) {
		if (expected === undefined) return undefined;
		if (!expected.present) return entry === undefined ? undefined : "mismatchMissing";
		if (entry === undefined) return "mismatchPresent";
		if (entry.modelInvocable === expected.modelInvocable) return undefined;
		return expected.modelInvocable ? "mismatchStillOn" : "mismatchStillOff";
	}

	/** Wait for the filesystem watcher before believing a negative result. */
	const VERIFY_DELAYS = [140, 320, 760];
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	//#region primitive fallbacks

	/** Fallbacks keep the page usable if a deployment ships no primitives. */
	function LocalSwitch({ checked, onChange, label, disabled, title }) {
		return h("button", {
			type: "button",
			role: "switch",
			"aria-checked": checked,
			"aria-label": label,
			title,
			disabled,
			onClick: () => { if (!disabled) onChange(!checked); },
			style: {
				position: "relative",
				width: "36px",
				height: "20px",
				flex: "0 0 auto",
				padding: 0,
				border: "none",
				borderRadius: "10px",
				cursor: disabled ? "default" : "pointer",
				opacity: disabled ? 0.5 : 1,
				background: checked ? "var(--dsw-alias-brand-primary, #2f81f7)" : "rgba(128,128,128,0.35)",
				transition: "background 120ms ease",
			},
		}, h("span", {
			style: {
				position: "absolute",
				top: "2px",
				left: checked ? "18px" : "2px",
				width: "16px",
				height: "16px",
				borderRadius: "50%",
				background: "#fff",
				transition: "left 120ms ease",
			},
		}));
	}

	function LocalButton({ variant, size, icon, children, className, ...rest }) {
		return h("button", {
			type: "button",
			className,
			style: {
				height: "28px",
				padding: "0 12px",
				fontSize: "13px",
				color: "var(--dsw-alias-label-primary)",
				background: "transparent",
				border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
				borderRadius: "8px",
				cursor: rest.disabled ? "default" : "pointer",
				opacity: rest.disabled ? 0.5 : 1,
			},
			...rest,
		}, children);
	}

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

	function LocalTag({ tone, className, children }) {
		return h("span", {
			className,
			"data-tone": tone,
			style: {
				display: "inline-flex",
				alignItems: "center",
				height: "18px",
				padding: "0 6px",
				fontSize: "11px",
				border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
				borderRadius: "6px",
			},
		}, children);
	}

	const SwitchControl = primitives.Switch === undefined ? LocalSwitch : primitives.Switch;
	const ButtonControl = primitives.Button === undefined ? LocalButton : primitives.Button;
	const InputControl = primitives.Input === undefined ? LocalInput : primitives.Input;
	const TagControl = primitives.Tag === undefined ? LocalTag : primitives.Tag;

	//#endregion

	/** The refresh glyph, used only when the shipped icon set is unavailable. */
	function RefreshGlyph() {
		return h("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true },
			h("path", { d: "M19.5 12a7.5 7.5 0 1 1-2.4-5.45", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" }),
			h("path", { d: "M19.5 3.6v4.3h-4.3", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" }),
		);
	}

	const RefreshIcon = primitives.IconRefreshOutlineRegular === undefined ? RefreshGlyph : primitives.IconRefreshOutlineRegular;

	/**
	 * The Plugins page's refresh control: a bare icon button wrapped in a hover
	 * Tooltip, showing an ongoing dot while the reload is in flight. Falls back to
	 * a native title when a deployment ships no Tooltip.
	 */
	function RefreshButton({ t, busy, onClick }) {
		const button = h("button", {
			type: "button",
			className: "dst-iconButton",
			"aria-label": t("refresh"),
			"aria-busy": busy === true ? true : undefined,
			disabled: busy,
			onClick,
			...(primitives.Tooltip === undefined ? { title: t("refresh") } : {}),
		}, h("span", { className: "dst-iconWrap", "aria-hidden": true },
			busy && primitives.StateDot !== undefined
				? h(primitives.StateDot, { state: "ongoing", size: 18 })
				: h(RefreshIcon, null),
		));
		if (primitives.Tooltip === undefined) return button;
		return h(primitives.Tooltip, {
			label: t("refresh"),
			side: "bottom",
			delayMs: 500,
			focusDelayMs: 500,
			portal: true,
			disabled: busy === true,
		}, button);
	}

	/** The chevron that shows a section is collapsible, and which way it is. */
	function ChevronGlyph({ open }) {
		return h("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true },
			h("path", {
				d: open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6",
				stroke: "currentColor",
				strokeWidth: 1.7,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			}),
		);
	}

	/** The 20px glyph inside a card's icon seat. */
	function SkillGlyph() {
		return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true },
			h("path", { d: "M7 3.5h7l4 4v13H7z", stroke: "currentColor", strokeWidth: 1.4, strokeLinejoin: "round" }),
			h("path", { d: "M14 3.5v4h4", stroke: "currentColor", strokeWidth: 1.4, strokeLinejoin: "round" }),
			h("path", { d: "M9.5 12h5M9.5 15.5h3.5", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" }),
		);
	}

	/** The six-dot grip at the front of a row or a group head: hold to drag. */
	function HandleGlyph() {
		const dots = [];
		for (const cx of [4, 10]) for (const cy of [3, 9, 15]) dots.push(h("circle", { key: `${cx}-${cy}`, cx, cy, r: 1.7 }));
		return h("svg", { width: 14, height: 18, viewBox: "0 0 14 18", fill: "currentColor", "aria-hidden": true }, dots);
	}

	/**
	 * One skill card: grip, icon seat, the custom title (only when the
	 * row was renamed), the original name plus its tags, the description, the
	 * diagnostics and the two switches.
	 */
	function SkillRow(props) {
		const skill = props.skill;
		const state = props.state;
		const t = props.t;
		const problems = skill.problems;
		const broken = problems.length > 0;
		const locked = state !== undefined && state.kind === "locked";
		const busy = state !== undefined && state.kind === "busy";
		const off = skill.model.off || skill.manual.off;
		const custom = props.custom;
		const customDesc = props.customDesc === undefined ? skill.description : props.customDesc;
		const renamed = custom !== undefined && custom !== "";
		// The specific reason beats the generic one: "the switch did not take
		// effect" is actionable, "verification failed" is not.
		const lockText = broken
			? t("lockedBroken")
			: locked
				? (typeof state.text === "string" && state.text !== "" ? state.text : t("lockedUnverified"))
				: undefined;
		const switchTitle = (which, on) => {
			if (broken || locked) return lockText;
			if (state !== undefined && state.kind === "error") return state.text;
			return which === "model" ? t(on ? "closeModel" : "openModel") : t(on ? "closeManual" : "openManual");
		};

		const lead = h("span", { className: "dst-lead" },
			h("button", {
				type: "button",
				className: "dst-grip",
				"aria-label": t("reorder"),
				title: t("reorder"),
				onPointerDown: (event) => props.onGripDown(event, skill.file),
			}, h(HandleGlyph, null)),
			// An unmistakable "you are holding it" marker: without it, an armed drag
			// and an ignored press look exactly the same.
			props.dragging === true ? h("span", { className: "dst-dragChip" }, t("dragging")) : null,
		);

		// The custom title, when there is one. An unrenamed row draws no title at
		// all: the original name below is then the only line, so the row does not
		// grow taller for nothing.
		const titleBlock = renamed
				? h("div", { className: "dst-titleRow" }, h("span", { className: "dst-name" }, custom))
				: null;

		// The original name keeps its permanent place here, together with the tags
		// that were always drawn next to it.
		const nameRow = h("div", { className: "dst-titleRow" },
			h("span", { className: renamed ? "dst-sub" : "dst-name" }, skill.name),
			// 「已改」标签按要求不再显示（2026-10-11）；state 记录仍保留，关回来仍可逐字节还原。原代码：skill.edited ? h(TagControl, { key: "edited" }, t("edited")) : null,
			props.duplicate === true ? h(TagControl, { key: "duplicate" }, t("duplicateTag")) : null,
		);

		// The picked-up state is a CSS hook only: the drag writes the follow offset
		// straight onto this element (see applyLift), because routing a transform
		// through React state re-rendered the whole page on every pointer move and
		// dropped frames.
		const lifted = props.dragging === true;

		return h("li", {
			className: "dst-card",
			ref: props.rowRef,
			"data-state": off ? "off" : undefined,
			"data-dragging": lifted ? "" : undefined,
			"data-lifted": lifted ? "" : undefined,
			"data-drop": props.drop,
		},
			h("div", { className: "dst-cardHead" },
				lead,
				h("span", { className: "dst-cardIcon" }, h(SkillGlyph, null)),
				h("div", { className: "dst-cardMain" },
					titleBlock,
					nameRow,
					h("div", { className: "dst-descRow" },
							h("span", { className: customDesc === "" ? "dst-desc dst-descEmpty" : "dst-desc" },
								customDesc === "" ? t("descEmpty") : customDesc),
							
						),
					broken ? problems.map((text, index) => h("p", { key: index, className: "dst-reason" }, text)) : null,
					state !== undefined && state.kind === "error" ? h("p", { className: "dst-reason" }, state.text) : null,
					state !== undefined && state.kind === "ok" ? h("p", { className: "dst-ok" }, state.text) : null,
					broken || locked ? h("p", { className: "dst-reason" },
						h("span", null, lockText),
						h("button", { type: "button", className: "dst-link", onClick: () => props.onRetry(skill) }, t("retry")),
					) : null,
				),
				h("div", { className: "dst-cardEnd" },
					h("span", { className: "dst-switch" },
						h("span", { className: "dst-switchLabel" }, t("model")),
						h(SwitchControl, {
							checked: !skill.model.off,
							disabled: busy || locked || broken,
							label: `${skill.name} · ${t("model")}`,
							title: switchTitle("model", skill.model.off),
							onChange: (next) => props.onToggle(skill, "model", next),
						}),
					),
					h("span", { className: "dst-switch" },
						h("span", { className: "dst-switchLabel" }, t("manual")),
						h(SwitchControl, {
							checked: !skill.manual.off,
							disabled: busy || locked || broken,
							label: `${skill.name} · ${t("manual")}`,
							title: switchTitle("manual", skill.manual.off),
							onChange: (next) => props.onToggle(skill, "manual", next),
						}),
					),
				),
			),
		);
	}

	/** The sidebar page: header, toolbar, search, the three arranged groups. */
	function SkillsPage(props) {
		const t = props.t;
		const ctx = props.ctx;
		const [inventory, setInventory] = useState(undefined);
		const [loading, setLoading] = useState(true);
		const [notice, setNotice] = useState(undefined);
		const [query, setQuery] = useState("");
		const [rowState, setRowState] = useState({});
		const [verified, setVerified] = useState(undefined);
		// The page's own display preferences: custom titles, group names, row and
		// group order, and which groups are folded. The host half stores them.
		const [prefs, setPrefs] = useState(() => defaultPrefs());
		const [bulkBusy, setBulkBusy] = useState(undefined);
		// Long-press drag: a 300ms hold arms it, then moves only redraw the marker.
		const [drag, setDrag] = useState(null);
		const [dropIndex, setDropIndex] = useState(null);
		// The dragged order, drawn live while the pointer moves: the row (or the whole
		// section) follows the pointer instead of the list only changing on release.
		const [preview, setPreview] = useState(null);
		const alive = useRef(true);
		const rootsRef = useRef([]);
		const prefsLoaded = useRef(false);
		const dropIndexRef = useRef(null);
		const holdRef = useRef(null);
		/** One <ul> per group, so the insertion index is measured in that group. */
		const listRefs = useRef({});
		/** The page's group box, for the group-drag insertion index. */
		const groupsRef = useRef(null);
		const bulkRef = useRef(false);
		const previewRef = useRef(null);
		/** Every draggable element by key: rows by file, sections by group id. */
		const rowRefs = useRef(new Map());
		const groupRefs = useRef(new Map());
		/** The offset currently applied to the picked-up element. */
		const dyRef = useRef(0);
		/** Element tops captured just before a live reorder, for the FLIP pass. */
		const flipRef = useRef(null);
		/** The FLIP offset currently applied to each element, so it can be discounted. */
		const glideRef = useRef(new Map());
		const settleTimer = useRef(undefined);
		/** 刷新的请求代次：只让最新那次把结果写进状态，旧响应不许覆盖。 */
		const refreshSeq = useRef(0);

		const setRow = useCallback((file, value) => {
			setRowState((current) => {
				const next = { ...current };
				if (value === undefined) delete next[file];
				else next[file] = value;
				return next;
			});
		}, []);

		/**
		 * Persist the display preferences locally, then to the host state file.
		 * A host half older than this page answers 404/405 for the POST route,
		 * which is worth saying out loud instead of showing a bare status code.
		 */
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
		 * Reload everything and re-verify every row against the live catalog.
		 * @param options.silent - keep the current rows on screen while reloading.
		 */
		const refresh = useCallback(async (options) => {
			const ticket = ++refreshSeq.current;
			if (options === undefined || options.silent !== true) setLoading(true);
			setNotice(undefined);
			try {
				const sessionId = pickSessionId(ctx);
				let catalog;
				if (sessionId !== undefined) {
					try {
						catalog = await fetchCatalog(ctx, sessionId);
					} catch {
						catalog = undefined;
					}
				}
				const initial = await callApi();
				const roots = projectRootsFromCatalog(catalog ?? [], initial.userRoot);
				for (const root of rootsRef.current) if (!roots.includes(root)) roots.push(root);
				rootsRef.current = roots;
				const next = roots.length === 0 ? initial : await callApi({ action: "list", roots });
				if (!alive.current || ticket !== refreshSeq.current) return;

				// Verify every row: the panel's promise is that a switch it shows as
				// applied really is applied, and that a mismatch is visible.
				const byName = new Map();
				for (const entry of catalog ?? []) byName.set(entry.name, entry);
				const duplicates = duplicateNames(next.skills);
				const failures = {};
				for (const skill of next.skills) {
					if (catalog === undefined) {
						failures[skill.file] = { kind: "unverified" };
						continue;
					}
					if (duplicates.has(skill.name)) {
						failures[skill.file] = { kind: "locked", text: t("mismatchDuplicate") };
						continue;
					}
					const mismatch = mismatchOf(byName.get(skill.name), expectationFor(skill));
					if (mismatch !== undefined) failures[skill.file] = { kind: "locked", text: t(mismatch) };
				}
				setInventory(next);
				syncMenuHider(next.skills);
				setVerified(catalog !== undefined);
				setRowState(failures);
				// The host owns the display preferences, but they are read exactly
				// once: every later change goes out through savePrefs, so a
				// background refresh can never undo an edit the user just made.
				if (!prefsLoaded.current) {
					prefsLoaded.current = true;
					setPrefs(normalizePrefs(next.prefs));
				}
				// Tell the host what the panel actually rendered. Best effort: a failed
				// diagnostic must never change what the user sees.
				const chatcutRows = next.skills.filter((skill) => skill.chatcut === true);
				void callApi({
					action: "report",
					roots,
					ui: {
						total: next.skills.length,
						user: next.skills.filter((skill) => skill.source === "user").length,
						project: next.skills.filter((skill) => skill.source === "project").length,
						chatcut: chatcutRows.length,
						off: next.skills.filter((skill) => skill.model.off || skill.manual.off).length,
						chatcutOff: chatcutRows.filter((skill) => skill.model.off || skill.manual.off).length,
						collapsed: next.prefs !== undefined && next.prefs.collapsed !== undefined && next.prefs.collapsed.chatcut === true,
						verified: catalog !== undefined,
						locked: Object.keys(failures).map((file) => {
							const skill = next.skills.find((candidate) => candidate.file === file);
							return skill === undefined ? file : skill.name;
						}),
						names: next.skills.map((skill) => skill.name),
					},
				}).catch(() => undefined);
			} catch (error) {
				if (alive.current && ticket === refreshSeq.current) setNotice({ kind: "error", text: t("loadFailed", { message: String(error.message ?? error) }) });
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

		/**
		 * Write one batch of switches and then prove it landed in DSH. A rejected
		 * or mismatching row is locked with the reason instead of silently showing
		 * a switch position that means nothing.
		 * @param verify - false skips the expensive re-verification, for a caller
		 *   that is stepping through many batches and re-verifies once at the end.
		 * @returns file -> whether that file's write really landed, or undefined
		 *   when the write itself could not be attempted. The group knob needs this
		 *   per-row verdict to count what it switched and what it had to skip.
		 */
		const applyChanges = useCallback(async (changes, verify) => {
			if (changes.length === 0) return new Map();
			for (const change of changes) setRow(change.file, { kind: "busy" });
			const landed = new Map();
			try {
				const result = await callApi({ action: "apply", roots: rootsRef.current, changes });
				if (!alive.current) return landed;
				const byFile = new Map();
				for (const item of result.results) byFile.set(item.file, item);
				const duplicates = duplicateNames(result.skills);
				const sessionId = verify === false ? undefined : pickSessionId(ctx);
				let catalog;
				if (sessionId !== undefined) {
					try {
						catalog = await fetchCatalog(ctx, sessionId);
					} catch {
						catalog = undefined;
					}
				}

				// The watcher is asynchronous, so retry the negative verdicts before
				// declaring a switch ineffective.
				const pending = new Map();
				for (const change of changes) {
					const item = byFile.get(change.file);
					const skill = result.skills.find((candidate) => candidate.file === change.file);
					if (item === undefined || skill === undefined) {
						landed.set(change.file, item !== undefined && item.status !== "error" && item.status !== "reverted");
						continue;
					}
					if (item.status === "error") {
						setRow(change.file, { kind: "error", text: t("writeFailed", { message: item.message ?? "" }) });
						landed.set(change.file, false);
						continue;
					}
					if (item.status === "reverted") {
						setRow(change.file, { kind: "error", text: t("reverted", { message: item.message ?? "" }) });
						landed.set(change.file, false);
						continue;
					}
					if (catalog === undefined) {
						// The host half read the file back and re-parsed it, so the write
						// itself is proven even when DSH cannot be asked about it.
						setRow(change.file, undefined);
						landed.set(change.file, true);
						continue;
					}
					if (duplicates.has(skill.name)) {
						setRow(change.file, { kind: "locked", text: t("mismatchDuplicate") });
						landed.set(change.file, false);
						continue;
					}
					pending.set(change.file, { skill, expected: expectationFor(skill) });
					landed.set(change.file, false);
					setRow(change.file, { kind: "busy" });
				}

				if (pending.size > 0) {
					const settle = async (entries) => {
						const byName = new Map();
						for (const entry of entries) byName.set(entry.name, entry);
						const unresolved = new Map();
						for (const [file, item] of pending) {
							const mismatch = mismatchOf(byName.get(item.skill.name), item.expected);
							if (mismatch === undefined) {
								landed.set(file, true);
								setRow(file, { kind: "ok", text: t("applied") });
							} else {
								unresolved.set(file, item);
							}
						}
						return unresolved;
					};
					let unresolved = await settle(catalog);
					for (const delay of VERIFY_DELAYS) {
						if (unresolved.size === 0) break;
						await wait(delay);
						if (!alive.current) return landed;
						const currentSession = pickSessionId(ctx);
						if (currentSession === undefined) break;
						let retryCatalog;
						try {
							retryCatalog = await fetchCatalog(ctx, currentSession);
						} catch {
							retryCatalog = undefined;
						}
						if (retryCatalog === undefined) break;
						catalog = retryCatalog;
						unresolved = await settle(retryCatalog);
					}
					for (const [file, item] of unresolved) {
						const last = item.expected.present === false ? t("mismatchMissing") : t("mismatchStillOff");
						landed.set(file, false);
						setRow(file, { kind: "locked", text: last });
					}
				}

				setInventory({ ...result, skills: result.skills });
				syncMenuHider(result.skills);
				setVerified(catalog !== undefined);
				void callApi({
					action: "report",
					roots: rootsRef.current,
					ui: {
						applied: changes.length,
						total: result.skills.length,
						off: result.skills.filter((skill) => skill.model.off || skill.manual.off).length,
						verified: catalog !== undefined,
						failed: result.results.filter((item) => item.status !== "applied" && item.status !== "unchanged").map((item) => item.status),
					},
				}).catch(() => undefined);
				return landed;
			} catch (error) {
				if (!alive.current) return landed;
				const text = t("writeFailed", { message: String(error.message ?? error) });
				for (const change of changes) {
					landed.set(change.file, false);
					setRow(change.file, { kind: "error", text });
				}
				return landed;
			}
		}, [ctx, t, setRow]);

		const onToggle = useCallback((skill, key, enabled) => {
			applyChanges([{ file: skill.file, key, enabled }]);
		}, [applyChanges]);

		/** Every row of one group, in the order the page shows them. */
		const groups = useMemo(() => {
			const skills = inventory === undefined ? [] : inventory.skills;
			const chatcut = skills.filter((skill) => skill.chatcut === true);
			return {
				user: applyOrder(skills.filter((skill) => skill.source === "user" && skill.chatcut !== true), prefs.order.user),
				project: applyOrder(skills.filter((skill) => skill.source === "project" && skill.chatcut !== true), prefs.order.project),
				chatcut: applyOrder([...chatcut].sort((left, right) => left.name.localeCompare(right.name)), prefs.order.chatcut),
			};
		}, [inventory, prefs]);

		const duplicates = useMemo(() => duplicateNames(inventory === undefined ? [] : inventory.skills), [inventory]);
		const needle = query.trim().toLowerCase();
		/** The rows the search box currently lets through, group by group. */
		const shown = useMemo(() => {
			const visible = (list) => needle === "" ? list : list.filter((skill) => {
				// Both the original name and the custom title take part in the match:
				// searching for either one has to find the row.
				const custom = prefs.titles[skill.file];
				const customDesc = (prefs.descs ?? {})[skill.file];
				return `${skill.name} ${custom === undefined ? "" : custom} ${customDesc === undefined ? "" : customDesc} ${skill.description}`.toLowerCase().includes(needle);
			});
			return { user: visible(groups.user), project: visible(groups.project), chatcut: visible(groups.chatcut) };
		}, [groups, needle, prefs]);

		/**
		 * What the page draws: the search-filtered rows, reordered live while a
		 * drag is in flight so the dragged row follows the pointer.
		 */
		const drawn = useMemo(() => {
			if (preview === null) return shown;
			if (preview.kind === "group") return shown;
			const list = shown[preview.group] ?? [];
			const byFile = new Map(list.map((skill) => [skill.file, skill]));
			const ordered = preview.ids.map((file) => byFile.get(file)).filter((skill) => skill !== undefined);
			const seen = new Set(ordered.map((skill) => skill.file));
			return { ...shown, [preview.group]: [...ordered, ...list.filter((skill) => !seen.has(skill.file))] };
		}, [shown, preview]);

		/**
		 * The groups the page draws, in order. An empty ChatCut group is left
		 * out: that section exists only for the skills a third-party desktop app
		 * installed into the shared agents root, so with none present it would
		 * draw a heading, a count of 0 and a single line of grey text.
		 */
		const groupIds = groups.chatcut.length === 0
			? GROUP_IDS.filter((groupId) => groupId !== "chatcut")
			: GROUP_IDS;
		const groupOrder = preview !== null && preview.kind === "group"
			? preview.ids
			: applyGroupOrder(groupIds, prefs.order[GROUP_ORDER_KEY]);
		const rowKeysOf = (groupId) => drawn[groupId].map((skill) => skill.file);
		const fullKeysOf = (groupId) => groups[groupId].map((skill) => skill.file);
		/** A row the group knob may touch: not broken, not a duplicate, not locked. */
		const operable = (skill) => skill.problems.length === 0
			&& !duplicates.has(skill.name)
			&& !(rowState[skill.file] !== undefined && rowState[skill.file].kind === "locked");
		const targetsOf = (groupId) => shown[groupId].filter(operable);
		const allOnOf = (groupId) => {
			const targets = targetsOf(groupId);
			return targets.length > 0 && targets.every((skill) => !skill.model.off && !skill.manual.off);
		};
		/**
		 * What the section's knob shows: the direction it was last asked to move in,
		 * remembered across reloads (and per section). A row that cannot be turned on —
		 * a failed write, a skill DSH does not list, a duplicate — used to snap the
		 * knob straight back to "off", which left no one-click way to turn the whole
		 * section off again. The knob is a latch now: only clicking it (or 恢复默认)
		 * changes its direction.
		 */
		const knobOnOf = (groupId) => {
			// A prefs object from an older host (or a trimmed state file) may have no
			// `bulk` map at all; that simply means "never clicked".
			const bulk = prefs.bulk !== null && typeof prefs.bulk === "object" ? prefs.bulk : {};
			const latched = bulk[groupId];
			return typeof latched === "boolean" ? latched : allOnOf(groupId);
		};


		/**
		 * The group's own knob: flip BOTH switches of every row in the section to
		 * the same state in ONE request, skipping (and counting) the rows that are
		 * broken, duplicated or locked. One batched request is what keeps a large
		 * section cheap: the host applies the whole changes array in a single
		 * pass instead of re-scanning the roots per row (O(N²)).
		 */
		const groupBulk = useCallback(async (groupId, enabled) => {
			if (bulkRef.current) return;
			// The knob moves the instant it is clicked, and it stays there whatever the
			// rows do afterwards: a row that cannot follow must not pull it back.
			if (prefs.bulk === undefined || prefs.bulk === null || prefs.bulk[groupId] !== enabled) {
				const bulk = prefs.bulk !== null && typeof prefs.bulk === "object" ? prefs.bulk : {};
				savePrefs({ ...prefs, bulk: { ...bulk, [groupId]: enabled } });
			}
			const skills = shown[groupId];
			const targets = skills.filter(operable);
			let skip = skills.length - targets.length;
			let ok = 0;
			bulkRef.current = true;
			setBulkBusy({ group: groupId, done: 0, total: targets.length, enabled });
			try {
				// 整组一次提交：宿主 apply 本来就收一个 changes 数组，逐行 POST 只会让
				// Host 每次全量重扫。applyChanges 仍是唯一写路径：它显示每行忙碌态、
				// 对照 DSH 复核，并锁住没落地的行。
				const changes = bulkChangesFor(targets, enabled);
				if (changes.length > 0 && alive.current) {
					const landed = await applyChanges(changes, true);
					// 本来就已在目标状态的行不算切换也不算跳过 —— 只有提交过、
					// 却没落地的行才进「跳过」计数（与逐行时代的报数一致）。
					const submitted = new Set(changes.map((change) => change.file));
					for (const skill of targets) {
						if (!submitted.has(skill.file)) continue;
						if (landed !== undefined && landed.get(skill.file) === true) ok += 1;
						else skip += 1;
					}
				}
				setBulkBusy({ group: groupId, done: targets.length, total: targets.length, enabled });
			} finally {
				bulkRef.current = false;
				setBulkBusy(undefined);
			}
			// Re-verify every row once at the end, so the section's counts and the
			// per-row verdicts describe the same state.
			await refresh({ silent: true });
			if (!alive.current) return;
			setNotice({ kind: "ok", text: skip > 0 ? t("bulkDoneSkip", { ok, skip }) : t("bulkDone", { ok }) });
		}, [applyChanges, operable, refresh, shown, t]);

		/** Remember one section's folded state; the host owns the preference. */
		const toggleCollapse = (groupId) => {
			const collapsed = { ...prefs.collapsed };
			if (collapsed[groupId] === true) delete collapsed[groupId];
			else collapsed[groupId] = true;
			savePrefs({ ...prefs, collapsed });
		};

		const resetPage = () => {
			if (!globalThis.confirm(t("resetConfirm"))) return;
			savePrefs(defaultPrefs());
		};

		//#region long-press drag

		/** The key list an active drag is measured against. */
		const keysOf = (target) => target.kind === "group" ? groupOrder : rowKeysOf(target.group);

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
			}
			if (typeof document !== "undefined") {
				document.body.style.removeProperty("user-select");
				document.body.style.removeProperty("cursor");
			}
			holdRef.current = null;
			dropIndexRef.current = null;
			setDrag(null);
			setDropIndex(null);
		};

		/** Drop the live preview (a cancelled drag saves nothing). */
		const clearPreview = () => {
			if (previewRef.current === null) return;
			previewRef.current = null;
			setPreview(null);
		};

		/** The map a drag target's elements live in, and its element. */
		const refMapOf = (target) => (target.kind === "group" ? groupRefs.current : rowRefs.current);
		const containerOf = (target) => (target.kind === "group" ? groupsRef.current : listRefs.current[target.group]);
		const selectorOf = (target) => (target.kind === "group" ? "section.dst-group[data-group]" : "li.dst-card");
		const elementOf = (target) => {
			const element = refMapOf(target).get(target.id);
			return element === undefined || element === null || typeof element.getBoundingClientRect !== "function" ? undefined : element;
		};

		/**
		 * Write the follow offset straight onto the element.
		 *
		 * Routing this through React state re-rendered every row on every pointer
		 * move, which dropped frames on a long list. `animate` is false at the one
		 * moment the offset has to jump: when the element's own slot moves, the
		 * correction must land in the same frame as the layout shift, or the element
		 * drifts a whole slot while the list slides underneath it.
		 */
		const applyLift = (element, dy, scale, animate) => {
			if (element === undefined) return;
			element.style.transition = animate ? FOLLOW_TRANSITION : "none";
			element.style.transform = `translateY(${dy}px) scale(${scale})`;
		};

		/** Where the dragged container starts right now: a drag follows the page as it scrolls. */
		const containerTop = (target) => {
			const container = containerOf(target);
			if (container === null || container === undefined || typeof container.getBoundingClientRect !== "function") return 0;
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

		const layoutHeightOf = (element) => {
			if (typeof element.offsetHeight === "number" && element.offsetHeight > 0) return element.offsetHeight;
			return element.getBoundingClientRect().height;
		};

		/**
		 * Where the picked-up element should sit, decided from the ones it is NOT
		 * dragging.
		 *
		 * Asking the browser what is under the pointer cannot work here: the picked-up
		 * element follows the pointer, so the pointer is always inside it — and it is
		 * the topmost element as well. The answer was constantly "itself", the target
		 * never moved, and in places the row simply could not be dropped anywhere
		 * else. The untouched rows are static, so their midpoints give a stable
		 * insertion position.
		 *
		 * The positions come from viewport rects, which follow the page as it scrolls.
		 * `offsetTop` cannot be used here: it is measured from the offsetParent, and
		 * when the scrolling area is not that offsetParent the sum never moves — a
		 * wheel-scrolled drag then kept judging the element's original position while
		 * the element itself had already followed the list. The one transform to
		 * discount is the FLIP offset, which is known exactly because this code
		 * applied it.
		 */
		const idOfElement = (nodes, node) => {
			for (const [id, element] of nodes) {
				if (element === node) return id;
			}
			return undefined;
		};

		const slotFor = (clientY, target) => {
			const container = containerOf(target);
			if (container === null || container === undefined) return -1;
			const selector = selectorOf(target);
			const dragged = elementOf(target);
			const maps = [rowRefs.current, groupRefs.current];
			const nodes = [];
			const all = container.querySelectorAll(selector);
			for (let index = 0; index < all.length; index += 1) {
				if (all[index] !== dragged) nodes.push(all[index]);
			}
			for (let index = 0; index < nodes.length; index += 1) {
				const id = idOfElement(maps[0], nodes[index]) === undefined ? idOfElement(maps[1], nodes[index]) : idOfElement(maps[0], nodes[index]);
				const glide = glideRef.current.get(id);
				const top = nodes[index].getBoundingClientRect().top - (glide === undefined ? 0 : glide);
				if (clientY < top + layoutHeightOf(nodes[index]) / 2) return index;
			}
			return nodes.length;
		};

		/** The drop: hold the offset for one frame, then ease the element into place. */
		const settleElement = (target, from) => {
			const element = elementOf(target);
			if (element === undefined || from === 0) return;
			if (settleTimer.current !== undefined) clearTimeout(settleTimer.current);
			const scale = target.kind === "group" ? 1.01 : 1.015;
			element.style.transition = "transform .24s ease-out, box-shadow .24s ease-out";
			element.style.transform = `translateY(${from}px) scale(${scale})`;
			const land = () => { element.style.transform = "translateY(0px) scale(1)"; };
			if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(land);
			else land();
			settleTimer.current = setTimeout(() => {
				element.style.transition = "";
				element.style.transform = "";
			}, 340);
		};

		/**
		 * Press and hold a grip for 300ms to arm the drag. Both the move and the
		 * release listener sit on the window on purpose: a pointer that leaves the
		 * grip before the hold fires never comes back to it, and a drag has to end
		 * even when the button is released outside the row.
		 */
		const gripDown = (event, target) => {
			if (typeof event.button === "number" && event.button !== 0) return;
			clearHold();
			clearPreview();
			event.preventDefault();
			const startElement = elementOf(target);
			const startRect = startElement === undefined ? undefined : startElement.getBoundingClientRect();
			const hold = {
				target,
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				lastY: event.clientY,
				// Where inside the element the pointer grabbed it, so it does not jump.
				grabY: startRect === undefined ? 0 : event.clientY - startRect.top,
				// The element's layout top and list index at grab time, plus the
				// slot-to-slot distance: with those three numbers the follow offset is
				// pure arithmetic, so nothing ever measures a rect mid-animation (doing
				// that made the offset chase its own transition and elements flew).
				layoutTop0: startRect === undefined ? 0 : startRect.top,
				index0: Math.max(0, keysOf(target).indexOf(target.id)),
				// How far the list has moved the element under the pointer since the
				// grab. Accumulated from real measurements, never assumed from a slot
				// height: groups differ wildly in height.
				shift: 0,
				// The page has to follow a drag: the list moves under the pointer while
				// the pointer itself may not move at all.
				scroller: scrollParentOf(containerOf(target)),
				listTop0: containerTop(target),
				frame: undefined,
				active: false,
				timer: undefined,
				element: event.currentTarget,
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
				setDrag(target);
				const start = keysOf(target).indexOf(target.id);
				dropIndexRef.current = start < 0 ? 0 : start;
				setDropIndex(dropIndexRef.current);
				if (typeof document !== "undefined") {
					// The armed state must be unmistakable: without a visible change
					// "nothing happened" is indistinguishable from "not armed yet".
					document.body.style.userSelect = "none";
					document.body.style.cursor = "grabbing";
				}
				// "缓慢浮起来": grow into the picked-up scale over one frame so the lift
				// itself eases instead of snapping.
				const element = elementOf(target);
				if (element !== undefined) {
					const scale = target.kind === "group" ? 1.01 : 1.015;
					element.style.transition = "none";
					element.style.transform = "translateY(0px) scale(1)";
					const grow = () => {
						element.style.transition = "transform .18s ease, box-shadow .2s ease";
						element.style.transform = `translateY(0px) scale(${scale})`;
					};
					if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(grow);
					else grow();
				}
				try {
					hold.element.setPointerCapture(hold.pointerId);
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
			holdRef.current = hold;
			if (typeof window !== "undefined") {
				window.addEventListener("pointermove", hold.move);
				window.addEventListener("pointerup", hold.release);
				window.addEventListener("pointercancel", hold.release);
			}
		};

		/**
		 * The element whose place the picked-up one is taking, plus the live preview.
		 * The insertion position is computed among the ones that are NOT dragged, so
		 * the answer never depends on the picked-up element's own position.
		 */
		const updateSlot = (hold) => {
			const target = hold.target;
			const current = previewRef.current === null
				? (target.kind === "group" ? groupOrder.slice() : rowKeysOf(target.group).slice())
				: previewRef.current.ids.slice();
			const others = current.filter((id) => id !== target.id);
			const slot = slotFor(hold.lastY, target);
			if (slot === -1) return;
			const at = Math.max(0, Math.min(slot, others.length));
			const nextIds = others.slice();
			nextIds.splice(at, 0, target.id);
			if (nextIds.some((id, index) => id !== current[index])) {
				// Capture where everything sits *before* the reorder, so the FLIP pass
				// can animate the rows/sections that have to make way.
				flipRef.current = snapshotTops(refMapOf(target), target.id);
				const next = target.kind === "group" ? { kind: "group", ids: nextIds } : { kind: "row", group: target.group, ids: nextIds };
				previewRef.current = next;
				setPreview(next);
			}
			// The element whose place the picked-up one is taking, for the outline marker.
			const displaced = at < others.length ? others[at] : (others.length === 0 ? null : others[others.length - 1]);
			const marker = displaced === null ? -1 : current.indexOf(displaced);
			if (marker !== dropIndexRef.current) {
				dropIndexRef.current = marker;
				setDropIndex(marker);
			}
		};

		/**
		 * Keep the picked-up element under the pointer.
		 *
		 * The offset is arithmetic — grab-time layout top, plus however far the list
		 * has moved under it since (measured, not assumed), plus the scroll — so
		 * nothing ever measures a rect mid-animation (doing that made the offset chase
		 * its own transition and sent elements flying). It is written straight onto
		 * the element, so a pointer move costs no React render at all.
		 *
		 * `instant` is for the one moment the offset must jump: right after React
		 * moved the element to a new slot, the correction has to land in the same
		 * frame or the element visibly jumps and snaps back.
		 */
		const updateFollow = (hold, instant) => {
			const element = elementOf(hold.target);
			if (element === undefined) return;
			const layoutTop = hold.layoutTop0 + hold.shift + (containerTop(hold.target) - hold.listTop0);
			const dy = hold.lastY - hold.grabY - layoutTop;
			dyRef.current = dy;
			const scale = hold.target.kind === "group" ? 1.01 : 1.015;
			if (instant === true) {
				element.style.transition = "none";
				element.style.transform = `translateY(${dy}px) scale(${scale})`;
				void element.offsetHeight;
				element.style.transition = FOLLOW_TRANSITION;
				return;
			}
			applyLift(element, dy, scale, true);
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
			const target = hold.target;
			const live = previewRef.current;
			const releasedDy = dyRef.current;
			clearHold();
			dyRef.current = 0;
			// Hold the current offset for one frame, then let the element ease down
			// into its new place: "松开手，缓缓落位".
			settleElement(target, releasedDy);
			if (!wasActive || !commit || live === null) {
				clearPreview();
				return;
			}

			if (target.kind === "group") {
				// A whole section moves: its rows travel inside it, so the payload is
				// only the section order. The live preview already holds that order.
				const changed = live.ids.length !== groupOrder.length || live.ids.some((id, index) => id !== groupOrder[index]);
				if (!changed) {
					clearPreview();
					return;
				}
				clearPreview();
				savePrefs({ ...prefs, order: { ...prefs.order, [GROUP_ORDER_KEY]: live.ids } });
				return;
			}

			const keys = rowKeysOf(target.group);
			const changed = live.ids.length !== keys.length || live.ids.some((key, index) => key !== keys[index]);
			if (!changed) {
				clearPreview();
				return;
			}
			// Merge the dragged order back into the group's FULL list, so rows the
			// search box is hiding keep the places they had.
			const shownSet = new Set(keys);
			let cursor = 0;
			const merged = fullKeysOf(target.group).map((key) => (shownSet.has(key) ? live.ids[cursor++] : key));
			clearPreview();
			savePrefs({ ...prefs, order: { ...prefs.order, [target.group]: merged } });
		};

		//#endregion

		/**
		 * The FLIP pass: after a live reorder every element that moved is first drawn
		 * at its old position and then eased to the new one, so rows and sections
		 * visibly make way instead of jumping. The picked-up element is not part of
		 * this pass — its offset is computed arithmetically in gripMove, which keeps
		 * it exactly under the pointer without ever measuring an animating rect.
		 */
		useLayout(() => {
			const snapshot = flipRef.current;
			flipRef.current = null;
			if (snapshot !== null && snapshot !== undefined) {
				for (const [id, before] of snapshot.tops) {
					const element = rowRefs.current.get(id) === undefined ? groupRefs.current.get(id) : rowRefs.current.get(id);
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
			// The picked-up element has just been moved by React. Layout effects run
			// after the DOM change but before the browser paints, so landing the
			// correction here is invisible — which is exactly what the earlier "one
			// frame too early" version got wrong.
			const hold = holdRef.current;
			if (hold === null || !hold.active) return;
			// Compensate by how far the element ACTUALLY moved, measured at this
			// instant instead of assumed from a uniform slot height. Groups are all
			// different heights (and a row with an extra reason line is taller too), so
			// a per-slot step made the picked-up element fly off by the wrong amount
			// and snap back as soon as the pointer crossed a boundary again.
			const draggedTop = snapshot === null || snapshot === undefined ? undefined : snapshot.draggedTop;
			if (draggedTop !== undefined) {
				const element = elementOf(hold.target);
				if (element !== undefined) hold.shift += element.getBoundingClientRect().top - draggedTop;
			}
			updateFollow(hold, true);
		}, [preview]);

		const activeKeys = drag === null ? [] : drag.kind === "group" ? groupOrder : rowKeysOf(drag.group);
		const dragFrom = drag === null ? -1 : activeKeys.indexOf(drag.id);

		/** The row (or section) whose place the dragged one would take. */
		const dropOf = (kind, groupId, index) => {
			if (drag === null || drag.kind !== kind || dropIndex === null || dropIndex === dragFrom) return undefined;
			if (kind === "row" && drag.group !== groupId) return undefined;
			return index === dropIndex ? "into" : undefined;
		};

		const manifest = inventory === undefined ? undefined : inventory.chatcut;

		/** One section: its head (grip, title, count, knob, fold) and rows. */
		const renderGroup = (groupId, skills, emptyText, note) => {
			const collapsed = prefs.collapsed[groupId] === true;
			const customTitle = prefs.groupTitles[groupId];
			const title = customTitle === undefined || customTitle === "" ? t(GROUP_TITLE_KEY[groupId]) : customTitle;
			const targets = targetsOf(groupId);
			const allOn = knobOnOf(groupId);
			const index = groupOrder.indexOf(groupId);
			const groupLifted = drag !== null && drag.kind === "group" && drag.id === groupId;
			return h("section", {
				key: groupId,
				className: "dst-group",
				ref: (element) => {
					if (element === null || element === undefined) groupRefs.current.delete(groupId);
					else groupRefs.current.set(groupId, element);
				},
				"data-group": groupId,
				"data-state": collapsed ? "collapsed" : undefined,
				"data-dragging": groupLifted ? "" : undefined,
				"data-lifted": groupLifted ? "" : undefined,
				"data-drop": dropOf("group", groupId, index, groupOrder.length),
			},
				h("div", { className: "dst-groupHead dst-groupHeadSplit" },
					h("div", { className: "dst-groupHead dst-groupTitleRow" },
						h("button", {
							type: "button",
							className: "dst-grip",
							"aria-label": t("reorder"),
							title: t("reorder"),
							onPointerDown: (event) => gripDown(event, { kind: "group", id: groupId }),
						}, h(HandleGlyph, null)),
						h("h3", { className: "dst-groupTitle" }, title),
						h(GroupStatus, { items: groups[groupId], loading, synced: verified, t }),
						
					),
					h("div", { className: "dst-groupActions" },
						h(SwitchControl, {
							checked: allOn,
							disabled: bulkBusy !== undefined || targets.length === 0,
							label: allOn ? t("knobOff") : t("knobOn"),
							title: allOn ? t("knobOff") : t("knobOn"),
							onChange: (next) => { void groupBulk(groupId, next); },
						}),
						h("button", {
							type: "button",
							className: "dst-collapseBtn",
							"aria-expanded": !collapsed,
							onClick: () => toggleCollapse(groupId),
						}, h("span", { className: "dst-chevron", "data-open": collapsed ? "false" : "true" }, h(ChevronGlyph, { open: !collapsed })),
							collapsed ? t("expand") : t("collapse")),
					),
				),
				collapsed
					? null
					: skills.length === 0
						? h("p", { className: "dst-empty" },
							query.trim() === "" ? emptyText : t("noMatch", { total: fullKeysOf(groupId).length }))
						: h("ul", {
							className: "dst-cards",
							ref: (element) => { listRefs.current[groupId] = element; },
						}, skills.map((skill, rowIndex) => h(SkillRow, {
							key: skill.file,
							skill,
							state: rowState[skill.file],
							duplicate: duplicates.has(skill.name),
							custom: prefs.titles[skill.file],
							dragging: drag !== null && drag.kind === "row" && drag.id === skill.file,
							// The drag measures and animates the real element, so it needs a
							// handle on every row.
							rowRef: (element) => {
								if (element === null || element === undefined) rowRefs.current.delete(skill.file);
								else rowRefs.current.set(skill.file, element);
							},
							drop: dropOf("row", groupId, rowIndex, skills.length),
							onGripDown: (event, file) => gripDown(event, { kind: "row", group: groupId, id: file }),
							onToggle,
							// Retrying only re-reads the registry; it never writes again.
							onRetry: () => refresh({ silent: true }),
							t,
						}))),
				collapsed ? null : note,
			);
		};

		const rootWarnings = inventory === undefined ? [] : inventory.roots.filter((root) => root.source === "project" && (root.missing || root.error !== undefined));

		return h("div", { className: "dst-page" },
			h("div", { className: "dst-head" },
				h("h2", { className: "dst-title" }, t("title")),
				h("div", { className: "dst-subhead" },
					h("p", { className: "dst-intro" }, t("intro")),
					h("div", { className: "dst-toolbar" },
						h("button", { type: "button", className: "dst-resetBtn", onClick: resetPage }, t("reset")),
						h(RefreshButton, { t, busy: loading, onClick: () => refresh() }),
						h(InputControl, {
						className: "dst-search",
						value: query,
						placeholder: t("search"),
						spellCheck: false,
						onChange: (event) => setQuery(event.target.value),
					}),
					),
				),
			),
			bulkBusy === undefined ? null : h("p", { className: "dst-status" },
				t("bulkProgress", {
					action: t(bulkBusy.enabled ? "bulkEnableAction" : "bulkDisableAction"),
					done: bulkBusy.done,
					total: bulkBusy.total,
				}),
			),
			notice === undefined ? null : h("p", { className: notice.kind === "ok" ? "dst-ok" : "dst-reason" }, notice.text),
			h("div", { className: "dst-groups", ref: groupsRef },
				groupOrder.map((groupId) => renderGroup(
					groupId,
					drawn[groupId],
					groupId === "chatcut" ? t("emptyChatcut") : groupId === "user" ? t("emptyUser") : t("emptyProject"),
					groupId !== "chatcut" || manifest === undefined ? null : h("p", { className: "dst-note" },
						t("chatcutManifest", {
							path: manifest.manifest,
							error: manifest.error === undefined || manifest.error === "" ? "" : ` — ${manifest.error}`,
						})),
				)),
			),
			rootWarnings.length === 0 ? null : h("div", { className: "dst-roots" },
				rootWarnings.map((root, index) => h("p", { key: index, className: "dst-reason" },
					root.missing ? t("rootMissing") : t("rootReadFailed"),
				)),
			),
		);
	}

	/** The sidebar nav glyph: two sliders, drawn inline so no icon dep is needed. */
	function SkillsIcon({ size, active }) {
		return h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			"aria-hidden": true,
			style: { opacity: active ? 1 : 0.82 },
		},
			h("path", { d: "M4 8h9M19 8h1M4 16h3M13 16h7", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" }),
			h("circle", { cx: 15.5, cy: 8, r: 2.2, stroke: "currentColor", strokeWidth: 1.7 }),
			h("circle", { cx: 9.5, cy: 16, r: 2.2, stroke: "currentColor", strokeWidth: 1.7 }),
		);
	}

	/**
	 * `/` menu rows this panel works around, in two groups.
	 *
	 * ALWAYS: skills the app package registers from inside app.asar (a plugin's
	 * own `ctx.skills.register`, not a filesystem root). They cannot be switched
	 * off and a same-name file in the user root does not shadow them (measured
	 * 2026-10-17), so the only way to keep them out of the `/` menu is to hide
	 * their rows after the menu renders. Owner decision: always hidden.
	 *
	 * OFFICE: the official `dsh-skill-office` plugin registers these seven names
	 * in memory with the default invocation policy, so its copy stays
	 * user-invocable whatever the file says. The menu therefore follows the
	 * panel instead: a row is hidden while the skill's 手动 switch is off and
	 * shown while it is on, so the switch behaves exactly as the owner expects.
	 *
	 * Both groups are display-only; no skill file is touched.
	 */
	const MENU_ALWAYS_HIDDEN_SKILLS = new Set([
		"cordis-plugin-development",
		"cordis-composition-reference",
		"editing-cordis-compositions",
		"agent-experience",
		"diagnose-windows-sandbox-acl",
	]);
	const MENU_OFFICE_SKILLS = new Set([
		"office",
		"office-docx",
		"office-pptx",
		"office-xlsx",
		"office-render",
		"office-recalculate",
		"office-export-pdf",
	]);
	const MENU_HIDDEN_ATTR = "data-dsh-hidden-skill";
	/** Office skills whose 手动 switch is currently on (their row stays visible). */
	const menuOfficeManualOn = new Set();

	/** Union of skill names this hider knows about. */
	const MENU_KNOWN_SKILLS = new Set([...MENU_ALWAYS_HIDDEN_SKILLS, ...MENU_OFFICE_SKILLS]);

	/**
	 * Resolve a menu row to a known skill name without bare first-word matching on
	 * the whole row text (that mis-hides unrelated items whose label merely starts
	 * with e.g. "office"). Prefer data/aria exact names; only then a dedicated
	 * name node whose full text (or "name: desc" form) equals a known skill.
	 */
	function menuRowSkillName(row) {
		const candidates = [];
		for (const attr of ["data-skill-name", "data-name", "data-id"]) {
			const value = row.getAttribute(attr);
			if (typeof value === "string" && value.trim() !== "") candidates.push(value.trim());
		}
		const aria = row.getAttribute("aria-label");
		if (typeof aria === "string" && aria.trim() !== "") candidates.push(aria.trim());
		// Dedicated name/label node only — never fall back to the whole row textContent.
		const label = row.querySelector("[data-skill-name], [class*='name'], [class*='Name'], [class*='label'], [class*='Label']");
		if (label !== null) {
			const text = (label.getAttribute("data-skill-name") || label.textContent || "").trim();
			if (text !== "") candidates.push(text);
		}
		for (const candidate of candidates) {
			if (MENU_KNOWN_SKILLS.has(candidate)) return candidate;
			const match = candidate.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\s*[:：—–-]\s+/);
			if (match !== null && MENU_KNOWN_SKILLS.has(match[1])) return match[1];
		}
		return "";
	}

	/** Whether a menu row with this name must be hidden right now. */
	function menuSkillHidden(name) {
		if (MENU_ALWAYS_HIDDEN_SKILLS.has(name)) return true;
		if (!MENU_OFFICE_SKILLS.has(name)) return false;
		return !menuOfficeManualOn.has(name);
	}

	/** Remember which office skills are manually enabled, then re-apply. */
	function syncMenuHider(skills) {
		menuOfficeManualOn.clear();
		for (const skill of Array.isArray(skills) ? skills : []) {
			if (!MENU_OFFICE_SKILLS.has(skill.name)) continue;
			const manualOff = skill.manual !== undefined && skill.manual.off === true;
			if (!manualOff) menuOfficeManualOn.add(skill.name);
		}
		hideMenuSkillRows();
	}

	/** Clear hide marks we applied (also strips legacy inline display:none). */
	function unhideMenuSkillRows() {
		if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
		for (const row of document.querySelectorAll("[" + MENU_HIDDEN_ATTR + "]")) {
			row.removeAttribute(MENU_HIDDEN_ATTR);
			if (row.style !== undefined && typeof row.style.removeProperty === "function") {
				row.style.removeProperty("display");
			}
		}
	}

	/** Hide (or restore) menu rows, only inside a popup menu — never the panel list. */
	function hideMenuSkillRows() {
		if (typeof document === "undefined" || document.body === null || typeof document.querySelectorAll !== "function") return;
		for (const row of document.querySelectorAll("[role='option'], [role='menuitem'], [role='listbox'] li, [data-dsh-hidden-skill]")) {
			if (row.closest("[role='listbox'], [role='menu']") === null && !row.hasAttribute(MENU_HIDDEN_ATTR)) continue;
			const name = menuRowSkillName(row);
			if (name.length === 0) {
				if (row.hasAttribute(MENU_HIDDEN_ATTR)) {
					row.removeAttribute(MENU_HIDDEN_ATTR);
					if (row.style !== undefined && typeof row.style.removeProperty === "function") row.style.removeProperty("display");
				}
				continue;
			}
			if (menuSkillHidden(name)) {
				// CSS attribute rule hides the row; do not write inline display
				// (inline would survive plugin unload after the stylesheet is gone).
				row.setAttribute(MENU_HIDDEN_ATTR, "");
				if (row.style !== undefined && typeof row.style.removeProperty === "function") row.style.removeProperty("display");
			} else if (row.hasAttribute(MENU_HIDDEN_ATTR)) {
				row.removeAttribute(MENU_HIDDEN_ATTR);
				if (row.style !== undefined && typeof row.style.removeProperty === "function") row.style.removeProperty("display");
			}
		}
	}

	/**
	 * 把一串触发合并成「每帧最多跑一次」。frame 可注入：测试用假调度器就能证明
	 * 同帧多次触发只跑一次；生产传 browserFrame()。cancel 用于卸载时撤销待跑的帧。
	 */
	function createFrameThrottle(run, frame) {
		let handle = null;
		const request = () => {
			if (handle !== null) return;
			handle = frame.request(() => {
				handle = null;
				run();
			});
		};
		request.cancel = () => {
			if (handle === null) return;
			frame.cancel(handle);
			handle = null;
		};
		return request;
	}

	/** rAF 调度器；没有 requestAnimationFrame 的环境退到 16ms 定时器（约一帧）。 */
	function browserFrame() {
		const request = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
			? (callback) => window.requestAnimationFrame(callback)
			: (callback) => setTimeout(callback, 16);
		const cancel = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
			? (handle) => window.cancelAnimationFrame(handle)
			: (handle) => clearTimeout(handle);
		return { request, cancel };
	}

	/** Install the style + observer once; returns a disposer for the observer. */
	function installSkillMenuHider() {
		const noop = () => {};
		if (typeof document === "undefined" || document.body === null || document.documentElement === null || document.documentElement === undefined) return noop;
		if (document.documentElement.hasAttribute("data-dsh-skill-menu-hider")) return noop;
		if (typeof MutationObserver === "undefined") return noop;
		document.documentElement.setAttribute("data-dsh-skill-menu-hider", "");
		const style = document.createElement("style");
		style.setAttribute("data-plugin-css", `${NS}/menu-hider.css`);
		style.textContent = `[${MENU_HIDDEN_ATTR}]{display:none!important}`;
		document.head.appendChild(style);
		hideMenuSkillRows();
		// 每次 DOM 变更不再同步跑全文档查询：观察器回调一帧内合并成一次运行
		//（MutationObserver 一次突变批次可能连发几十个回调，逐个跑
		// querySelectorAll 整个文档太贵）。
		const scheduleHide = createFrameThrottle(hideMenuSkillRows, browserFrame());
		const observer = new MutationObserver(() => {
			scheduleHide();
		});
		observer.observe(document.body, { childList: true, subtree: true });
		return () => {
			scheduleHide.cancel();
			observer.disconnect();
			unhideMenuSkillRows();
			style.remove();
			document.documentElement.removeAttribute("data-dsh-skill-menu-hider");
		};
	}

	function apply(ctx) {
		ctx.effect(() => {
			ensureCss();
			return () => {
				if (typeof document === "undefined") return;
				const tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(`${NS}/client.css`)}]`);
				if (tag !== null) tag.remove();
			};
		}, "skills-toggle: stylesheet");
		ctx.effect(() => ctx.locale.register(NS, DICTS), "skills-toggle: dictionaries");
		ctx.effect(() => installSkillMenuHider(), "skills-toggle: / menu hider");
		const t = ctx.locale.bind(NS);
		ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
			name: "sidebar.panellist",
			id: PANEL_ID,
			order: 1,
			locale: NS,
			label: () => t("panel"),
		}, SkillsIcon));
		ctx.slots.inject("main", () => ctx.slots.register({
			name: "main",
			key: PANEL_ID,
			locale: NS,
		}, (props) => h(SkillsPage, { ...props, ctx, t: props.t === undefined ? t : props.t })));
	}

	exports.name = NS;
	exports.inject = inject;
	exports.apply = apply;
	/** 仅为离线测试导出的纯函数；不是运行时接口。 */
	exports.__test__ = { bulkChangesFor, createFrameThrottle };
	return module.exports;
}
});
