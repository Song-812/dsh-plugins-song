// dsh-ui-hide client bundle: turns the user's hide list into one stylesheet,
// and adds the one row action that replaces a hidden menu row.
//
// Hand-written __ModuleLoader__ factory (no build step). It needs no UI for the
// hiding half: it asks /api/ui-hide for the list once, then keeps one <style>
// element in step. Hiding is display-only, so every target keeps working for
// keyboard, tools and the agent — only the pixels disappear.
//
// The second half moves "rename" out of a Session's "..." menu onto the row
// itself. It adds a button; the rename interaction stays the host's own: the
// button opens that row's menu and presses the shipped rename row inside the
// same microtask, so the menu never paints and the inline editor appears exactly
// as if the menu row had been clicked.
window.__ModuleLoader__.load({ id: "dsh-ui-hide", factory: (require) => {

	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

	const react = require("react");
	const h = react.createElement;

	const NS = "ui-hide";
	const API_PATH = "/api/ui-hide";
	const STYLE_ID = "dsh-ui-hide-style";
	const ACTIONS_STYLE_ID = "dsh-ui-hide-actions-style";
	/** Same gate as the host half: a selector must not smuggle declarations or markup. */
	const FORBIDDEN_IN_SELECTOR = /[{};<>]/;

	// The shipped Session-row rename row, addressed by its stable shortcut rather
	// than by menu order, so reordering the menu cannot make this press the wrong row.
	const RENAME_MENU_ITEM = '[role="menu"] button[aria-keyshortcuts="Control+Alt+G"]';
	const ROW_ACTION_SLOT = "sidebar.workspaces.session.row.action";
	const ROW_ACTION_ID = "ui-hide-rename";
	const ROW_ACTION_ORDER = 50;
	/** How long the borrowed menu may take to appear before the click gives up. */
	const MENU_WAIT_MS = 1500;

	/** A selector worth compiling, or "" when the entry cannot be trusted. */
	function trustedSelector(value) {
		const selector = typeof value === "string" ? value.trim() : "";
		if (selector === "" || FORBIDDEN_IN_SELECTOR.test(selector)) return "";
		return selector;
	}

	/** Every selector the answer hides, in config order. */
	function selectorsOf(config) {
		if (config === null || typeof config !== "object") return [];
		if (config.enabled === false) return [];
		if (!Array.isArray(config.targets)) return [];
		const selectors = [];
		for (const entry of config.targets) {
			if (entry === null || typeof entry !== "object") continue;
			const selector = trustedSelector(entry.selector);
			if (selector !== "") selectors.push(selector);
		}
		return selectors;
	}

	/** One rule per selector; the whole stylesheet is derived, never appended to. */
	function compileCss(config) {
		return selectorsOf(config)
			.map((selector) => `${selector}{display:none !important}`)
			.join("\n");
	}

	/** The single style element this bundle owns, created on first use. */
	function styleTag() {
		if (typeof document === "undefined") return null;
		let tag = document.getElementById(STYLE_ID);
		if (tag !== null) return tag;
		tag = document.createElement("style");
		tag.id = STYLE_ID;
		if (typeof tag.setAttribute === "function") tag.setAttribute("data-plugin-css", `${NS}/compiled.css`);
		const parent = document.head ?? document.documentElement;
		if (parent !== null && parent !== undefined) parent.appendChild(tag);
		return tag;
	}

	function applyConfig(config) {
		const tag = styleTag();
		if (tag !== null) tag.textContent = compileCss(config);
	}

	/**
	 * Fetch the list and paint it. Any failure leaves the page untouched: a
	 * missing endpoint must never break the app, and hiding nothing is the safe
	 * default.
	 */
	/** 最近一次拿到的配置；行上的重命名按钮要不要出现也看它。 */
	let currentConfig = null;
	/** 停用之后，迟到的配置响应不许再把样式装回去。 */
	let disposed = false;

	async function load() {
		try {
			const response = await fetch(API_PATH, {
				headers: { accept: "application/json" },
				cache: "no-store",
			});
			if (!response.ok) return;
			const config = await response.json();
			if (disposed) return;
			currentConfig = config;
			applyConfig(config);
		} catch {
			/* 配置取不到时保持页面原样。 */
		}
	}

	// ---------------------------------------------------------------- row rename

	/** Same pencil-in-a-frame glyph the shipped menu row uses. */
	function renameIcon() {
		return h("svg", {
			width: 16,
			height: 16,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": true,
			stroke: "currentColor",
			"stroke-width": 1,
		},
			h("path", {
				d: "M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z",
				fill: "currentColor",
			}),
			h("path", {
				d: "M7.7849 8.23878L13.888 2.13574",
				stroke: "currentColor",
			}));
	}

	/**
	 * Open the row's own "..." menu and press its rename row before the menu can
	 * paint, so the visible result is the host's inline editor and nothing else.
	 *
	 * Resolves true when the rename row was pressed, false when the menu never
	 * appeared (the row keeps working; the user still has Ctrl+Alt+G).
	 */
	/**
	 * Pick the index of the row's "..." menu trigger inside a list of button
	 * descriptors ({ className, attrs }). Returns -1 when there is none.
	 *
	 * The trigger is a button with aria-haspopup, or one whose aria-label mentions
	 * "操作". This plugin's own rename button (.ui-hide-rowAction) is always
	 * excluded — if it rendered before the trigger, clicking it would recurse into
	 * itself and blow the stack with a RangeError.
	 */
	function pickTriggerIndex(buttons) {
		if (!Array.isArray(buttons)) return -1;
		for (let i = 0; i < buttons.length; i += 1) {
			const button = buttons[i];
			if (!button || typeof button !== "object") continue;
			if (typeof button.className === "string" && button.className.split(/\s+/).includes("ui-hide-rowAction")) continue;
			const attrs = button.attrs || {};
			if (typeof attrs["aria-haspopup"] === "string" && attrs["aria-haspopup"] !== "") return i;
			const label = attrs["aria-label"];
			if (typeof label === "string" && label.includes("操作")) return i;
		}
		return -1;
	}

	function openRename(row) {
		let trigger = null;
		if (row !== null && row !== undefined && typeof row.querySelectorAll === "function") {
			const descriptors = Array.prototype.map.call(row.querySelectorAll("button"), (button) => ({
				className: typeof button.className === "string" ? button.className : "",
				attrs: {
					"aria-haspopup": button.getAttribute("aria-haspopup"),
					"aria-label": button.getAttribute("aria-label"),
				},
			}));
			const index = pickTriggerIndex(descriptors);
			if (index >= 0) trigger = row.querySelectorAll("button")[index];
		}
		if (trigger === null) {
			// 找不到合法触发器就放弃：宁可这次点不动，也不要自己点自己而崩掉整列表。
			console.warn("[dsh-ui-hide] openRename: 未找到「…」菜单触发器（aria-haspopup 或含「操作」的 aria-label），已跳过。");
			return Promise.resolve(false);
		}
		return new Promise((resolve) => {
			let settled = false;
			let observer = null;
			let timer = null;
			const finish = (pressed) => {
				if (settled) return;
				settled = true;
				if (observer !== null) observer.disconnect();
				if (timer !== null) clearTimeout(timer);
				resolve(pressed);
			};
			observer = new MutationObserver(() => {
				const item = document.querySelector(RENAME_MENU_ITEM);
				if (item === null) return;
				item.click();
				finish(true);
			});
			observer.observe(document.body, { childList: true, subtree: true });
			timer = setTimeout(() => finish(false), MENU_WAIT_MS);
			trigger.click();
		});
	}

	/** The hover button at the end of one Session row. */
	function RenameAction() {
		// 总开关关掉时，行上的重命名按钮也一起消失（与 README 的说法一致）。
		if (currentConfig !== null && currentConfig.enabled === false) return null;
		const press = (event) => {
			event.preventDefault();
			event.stopPropagation();
			void openRename(event.currentTarget.closest("[data-row-key]"));
		};
		return h("button", {
			type: "button",
			className: "ui-hide-rowAction",
			"aria-label": "重命名会话",
			title: "重命名",
			onClick: press,
		}, renameIcon());
	}

	/** Row-action geometry copied from the shipped row buttons so the row keeps one rhythm. */
	const ACTIONS_CSS = [
		".ui-hide-rowAction{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:16px;height:16px;padding:0;border:none;border-radius:var(--dsw-radius-xs);background:transparent;color:var(--dsw-alias-label-tertiary);line-height:1;cursor:pointer;}",
		".ui-hide-rowAction:hover{color:var(--dsw-alias-label-primary);}",
		".ui-hide-rowAction:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px;}",
		".ui-hide-rowAction svg{width:16px;height:16px;}",
	].join("\n");

	function actionsStyleTag() {
		if (typeof document === "undefined") return null;
		let tag = document.getElementById(ACTIONS_STYLE_ID);
		if (tag !== null) return tag;
		tag = document.createElement("style");
		tag.id = ACTIONS_STYLE_ID;
		if (typeof tag.setAttribute === "function") tag.setAttribute("data-plugin-css", `${NS}/actions.css`);
		tag.textContent = ACTIONS_CSS;
		const parent = document.head ?? document.documentElement;
		if (parent !== null && parent !== undefined) parent.appendChild(tag);
		return tag;
	}

	function apply(ctx) {
		disposed = false;
		ctx.effect(() => {
			void load();
			return () => {
				disposed = true;
				if (typeof document === "undefined") return;
				const tag = document.getElementById(STYLE_ID);
				if (tag !== null) tag.remove();
			};
		}, "ui-hide: stylesheet");
		ctx.effect(() => {
			const tag = actionsStyleTag();
			return () => {
				if (tag !== null) tag.remove();
			};
		}, "ui-hide: row action stylesheet");
		ctx.inject(["slots"], (scope) => {
			const slots = scope.get("slots");
			if (slots === undefined || slots === null) return;
			scope.effect(() => slots.inject(ROW_ACTION_SLOT, () => slots.register(
				{ name: ROW_ACTION_SLOT, id: ROW_ACTION_ID, order: ROW_ACTION_ORDER },
				RenameAction,
			)));
		});
	}

	exports.name = NS;
	exports.apply = apply;
	/** Exported for the offline smoke test only; not part of the runtime surface. */
	exports.__test__ = { openRename, compileCss, trustedSelector, pickTriggerIndex };
	return module.exports;
}});
