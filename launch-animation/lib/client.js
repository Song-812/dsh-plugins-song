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

// dsh-launch-animation 浏览器半边：在「设置」里挂一个独立的「启动动画」页。
//
// 无构建写法：window.__ModuleLoader__.load({ id, factory })，
// id 必须与本包 package.json 的 name 逐字一致（dsh-launch-animation），否则客户端半边不会被送出。
// 这里只做视图与读写；真正的注入逻辑在宿主半边（lib/index.js）+ 注入脚本里。
//
// 2026-10-11 设置页改版（简化）：
//   · 两张分组卡：动画（档位）+ 背景（头像、素描上传）
//   · 说明文字、顶部介绍、底部提示、「当前素材」「配置文件」「跳过提示」三行、保存提示条 → 全删
//   · 换图改成点/拖上传，成功显缩略图，失败在该行下面出一行红字并写明原因
//   · 右上角「恢复默认」= 整页回出厂（点了先确认一次）
window.__ModuleLoader__.load({
	id: "dsh-launch-animation",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const h = react.createElement;
		const { useCallback, useEffect, useState, useRef } = react;

		const NS = "dsh-launch-animation";
		const API_PATH = "/api/launch-animation";
		const inject = ["slots", "locale"];

		const TEXT = "var(--dsw-alias-label-primary, inherit)";
		const MUTED = "var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))";

		const DICTS = {
			zh: {
				tab: "启动动画",
				title: "启动动画",
				reset: "恢复默认",
				confirmReset: "恢复默认并删除自定义启动图片？",
				confirm: "确认",
				cancel: "取消",
				cardAnim: "动画",
				cardBg: "背景",
				modeLabel: "动画档位",
				modeDesc: "简版是完整开场的加速版，内容不删减，只是更快播完。",
				modeFull: "完整 14.5s",
				modeFast: "简版 4s",
				identityLabel: "头像",
				identityDesc: "启动动画里展示的头像。",
				artworkLabel: "素描",
				artworkDesc: "素描参考图和转场用的图片。",
				replace: "更换",
				loading: "正在读取设置…",
				readFailedTitle: "设置读取失败",
				busyIdentity: "正在写入插件数据目录…",
				busyArtwork: "正在重算线稿，可能要十几秒…",
				updated: "图片已更新",
				resetDone: "已恢复默认设置",
				reasonOk: "正常",
				reasonMissing: "找不到文件",
				reasonEmpty: "没有填路径",
				reasonNotFile: "这个路径不是文件",
				reasonTooLarge: "超过 8MB",
				reasonNotCustom: "当前没有用自定义图",
				reasonOutside: "不在 uploads 目录内",
				reasonNotImage: "文件内容不是图片",
			},
			en: {
				tab: "Launch animation",
				title: "Launch animation",
				reset: "Restore defaults",
				confirmReset: "Restore defaults and delete custom launch images?",
				confirm: "Confirm",
				cancel: "Cancel",
				cardAnim: "Animation",
				cardBg: "Background",
				modeLabel: "Animation length",
				modeDesc: "Fast is a sped-up full intro — same content, shorter runtime.",
				modeFull: "Full 14.5s",
				modeFast: "Fast 4s",
				identityLabel: "Avatar",
				identityDesc: "Avatar shown in the launch animation.",
				artworkLabel: "Sketch",
				artworkDesc: "Sketch reference and transition image.",
				replace: "Replace",
				loading: "Loading settings…",
				readFailedTitle: "Failed to load settings",
				busyIdentity: "Saving to plugin data folder…",
				busyArtwork: "Recomputing contours; may take ~10s…",
				updated: "Image updated",
				resetDone: "Defaults restored",
				reasonOk: "OK",
				reasonMissing: "File not found",
				reasonEmpty: "No path set",
				reasonNotFile: "Path is not a file",
				reasonTooLarge: "Over 8MB",
				reasonNotCustom: "Not using a custom image",
				reasonOutside: "Outside the uploads folder",
				reasonNotImage: "File is not an image",
			},
		};

		/** 上传图片的体积上限（MB）：头像沿用老规矩 8MB，开机素材走素材管线给到 20MB。 */
		const LIMIT_MB = { identity: 8, artwork: 20 };

		/** 后端 settings.js 里 identityImageState 的 reason → 词典键。 */
		const REASON_KEYS = {
			ok: "reasonOk",
			missing: "reasonMissing",
			empty: "reasonEmpty",
			"not-a-file": "reasonNotFile",
			"too-large": "reasonTooLarge",
			"not-custom": "reasonNotCustom",
			"outside-uploads": "reasonOutside",
			"not-image": "reasonNotImage",
		};

		//#region 样式（手写包 import 不了别人的 CSS module，所以挂一个自己的 <style>）

		const CSS = `
.dsla-page { display: flex; flex-direction: column; gap: 8px; width: 100%; min-width: 0; box-sizing: border-box;
  color: var(--dsw-alias-label-primary); padding: 12px 0 14px; max-width: 600px; font-family: inherit; }
.dsla-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; margin: 0 0 4px; padding: 0; }
.dsla-title { font-size: 17px; font-weight: 700; line-height: 24px; margin: 0; letter-spacing: .06em; color: var(--dsw-alias-label-primary); }
.dsla-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsla-err, .dsla-errTop { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.dsla-err { margin-top: 4px; }
.dsla-errTop { padding: 0; }
.dsla-card {
  border-radius: 12px; padding: 2px 18px 4px; margin: 0; min-width: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 34%, transparent);
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.dsla-card-title {
  font-family: inherit; font-size: 15px; font-weight: 650; line-height: 22px;
  margin: 0 0 18px; padding-top: 10px; letter-spacing: .05em;
  color: var(--dsw-alias-label-primary); }
.dsla-row { display: flex; align-items: center; justify-content: space-between; gap: 12px 24px;
  padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.dsla-card .dsla-row:last-child { border-bottom: 0; }
.dsla-rowTall { align-items: flex-start; }
.dsla-main { min-width: 0; }
.dsla-label {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 13.5px; font-weight: 500; line-height: 20px; letter-spacing: 0;
  color: var(--dsw-alias-label-primary); }
.dsla-desc {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 12px; font-weight: 400; line-height: 18px; margin-top: 3px; max-width: 300px; letter-spacing: 0;
  color: color-mix(in srgb, var(--dsw-alias-label-secondary) 68%, transparent); }
.dsla-busy { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); margin-top: 4px; }
.dsla-ctrl { display: flex; gap: 8px; align-items: center; flex: 0 0 auto; max-width: 100%; }
.dsla-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; flex: none;
  font-family: inherit; font-size: 13px; line-height: 20px; height: 32px; padding: 0 12px; white-space: nowrap;
  border-radius:var(--dsw-radius-md,8px); cursor: pointer; border: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent);
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent), 0 1px 2px rgba(19,45,83,.06);
  color: var(--dsw-alias-label-primary); transition: background .15s; }
.dsla-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsla-btn:disabled { opacity: .45; cursor: default; }
.dsla-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: var(--dsw-radius-md, 8px); max-width: 100%; box-sizing: border-box; border: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent);
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent), 0 1px 2px rgba(19,45,83,.06); }
.dsla-seg button { font-family: inherit; font-size: 13px; line-height: 20px; min-height: 26px; padding: 3px 12px; border: 0;
  border-radius: var(--dsw-radius-md, 8px); background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsla-seg button:hover:not([aria-pressed="true"]):not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsla-seg button[aria-pressed="true"] { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.dsla-seg button:disabled { opacity: .45; cursor: default; }
.dsla-pick { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; max-width: 100%; }
.dsla-thumb { width: 84px; height: 48px; border-radius: 8px; overflow: hidden; flex: 0 0 auto;
  background: #dbe4ef; border: 0;
  box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  display: flex; align-items: center; justify-content: center; transition: box-shadow .15s; }
.dsla-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dsla-thumbEmpty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 11px; line-height: 18px; color: color-mix(in srgb, var(--dsw-alias-label-secondary) 60%, transparent); }
.dsla-pick[data-over="1"] .dsla-thumb { box-shadow: inset 0 0 0 .5px var(--dsw-alias-brand-primary); }
.dsla-pickAvatar .dsla-thumb { width: 48px; height: 48px; background: #c5d0de; }
.dsla-pickAvatar .dsla-thumb img { object-fit: contain; }
body[data-ds-dark-theme] .dsla-thumb { background: #243141; }
body[data-ds-dark-theme] .dsla-pickAvatar .dsla-thumb { background: #1a2533; }
.dsla-btn:focus-visible, .dsla-seg button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
@media (max-width: 600px) { .dsla-row { flex-wrap: wrap; } .dsla-ctrl { flex-wrap: wrap; } .dsla-actions { max-width: 100%; } }
@media (prefers-reduced-motion: reduce) { .dsla-btn, .dsla-thumb { transition: none; } }
`;

		function ensureCss() {
			if (typeof document === "undefined") return;
			const key = `${NS}/client.css`;
			let tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(key)}]`);
			if (tag !== null) { tag.textContent = CSS; return; }
			tag = document.createElement("style");
			tag.setAttribute("data-plugin-css", key);
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		//#endregion

		//#region 小组件

		function Row(props) {
			const { label, desc, error, busy, tall, children } = props;
			return h("div", { className: tall ? "dsla-row dsla-rowTall" : "dsla-row" }, [
				h("div", { key: "m", className: "dsla-main" }, [
					h("div", { key: "l", className: "dsla-label" }, label),
					desc ? h("div", { key: "d", className: "dsla-desc" }, desc) : null,
					error ? h("div", { key: "e", className: "dsla-err" }, error) : null,
					busy ? h("div", { key: "b", className: "dsla-busy" }, busy) : null,
				]),
				h("div", { key: "c", className: "dsla-ctrl" }, children),
			]);
		}

		function Segmented(props) {
			const { options, value, disabled, onChange } = props;
			return h("div", { className: "dsla-seg", role: "group" },
				(options || []).map((option) =>
					h("button", {
						key: option.value,
						type: "button",
						"aria-pressed": option.value === value,
						disabled: disabled === true,
						onClick: () => onChange && onChange(option.value),
					}, option.label)));
		}

		/** 素材行：缩略图 + 「更换」，整块支持拖拽。文件选择框复用一个隐藏 input，避免反复建节点。 */
		let fileInput = null;
		let pendingPick = null;
		let fileInputUsers = 0;

		function pickFile(onFile) {
			if (typeof document === "undefined") return;
			if (fileInput === null) {
				fileInput = document.createElement("input");
				fileInput.type = "file";
				fileInput.accept = "image/png,image/jpeg,image/webp,image/bmp,image/gif";
				fileInput.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;opacity:0";
				fileInput.addEventListener("change", () => {
					const file = fileInput.files && fileInput.files.length ? fileInput.files[0] : null;
					const handler = pendingPick;
					pendingPick = null;
					fileInput.value = "";
					if (file && typeof handler === "function") handler(file);
				});
				document.body.appendChild(fileInput);
			}
			pendingPick = onFile;
			fileInput.value = "";
			fileInput.click();
		}

		function retainFileInput() {
			fileInputUsers += 1;
			return () => {
				fileInputUsers = Math.max(0, fileInputUsers - 1);
				if (fileInputUsers === 0 && fileInput && fileInput.parentNode) {
					fileInput.parentNode.removeChild(fileInput);
					fileInput = null;
					pendingPick = null;
				}
			};
		}

		function ImagePicker(props) {
			const { variant, preview, disabled, onPick } = props;
			const [over, setOver] = useState(false);
			const className = variant === "avatar" ? "dsla-pick dsla-pickAvatar" : "dsla-pick";
			return h("div", {
				className,
				"data-over": over ? "1" : "0",
				onDragOver: (event) => { event.preventDefault(); if (!disabled) setOver(true); },
				onDragLeave: () => setOver(false),
				onDrop: (event) => {
					event.preventDefault();
					setOver(false);
					if (disabled) return;
					const files = event.dataTransfer && event.dataTransfer.files;
					if (files && files.length) onPick(files[0]);
				},
			}, [
				h("div", { key: "th", className: "dsla-thumb" },
					preview ? h("img", { src: preview, alt: "" }) : h("span", { className: "dsla-thumbEmpty" }, "—")),
				h("button", {
					key: "b",
					type: "button",
					className: "dsla-btn",
					disabled: disabled === true,
					onClick: () => pickFile(onPick),
				}, props.replaceLabel || "更换"),
			]);
		}

		//#endregion

		//#region 设置页

		function readAsDataUrl(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result || ""));
				reader.onerror = () => reject(new Error("读取本地文件失败"));
				reader.readAsDataURL(file);
			});
		}

		function LaunchAnimationPage(props) {
			const t = props.t || ((key) => key);
			const [status, setStatus] = useState(undefined);
			const [draft, setDraft] = useState(undefined);
			const [busy, setBusy] = useState(false);
			const [errors, setErrors] = useState({});
			const [pending, setPending] = useState("");
			const [previews, setPreviews] = useState({ identity: "", artwork: "" });
			const [confirmReset, setConfirmReset] = useState(false);
			const owner = useRef({}).current;
			const toast = window.__dshSettingsToastV1;
			useEffect(() => {
				toast.activate(owner);
				const releaseInput = retainFileInput();
				return () => { toast.cancel(owner); releaseInput(); };
			}, [owner]);

			const fail = (key, message) => {
				const text = String(message || "未知错误");
				setErrors((previous) => ({ ...previous, [key]: text }));
				toast.show(owner, 'error', text);
			};
			const clearError = (key) =>
				setErrors((previous) => (previous[key] ? { ...previous, [key]: "" } : previous));

			const refresh = useCallback(async () => {
				try {
					const response = await fetch(API_PATH, { cache: "no-store" });
					const data = await response.json();
					if (data && data.ok) {
						setStatus(data);
						setDraft(data.settings);
						return true;
					} else {
						fail("page", "读取设置失败：" + ((data && data.error) || "服务端没有返回原因"));
						return false;
					}
				} catch (error) {
					fail("page", "读取设置失败：" + String((error && error.message) || error));
					return false;
				}
			}, []);

			const loadPreviews = useCallback(async () => {
				const next = {};
				for (const kind of ["identity", "artwork"]) {
					try {
						const response = await fetch(API_PATH, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ action: "preview", kind }),
						});
						const data = await response.json();
						if (data && data.ok && typeof data.dataUrl === "string") next[kind] = data.dataUrl;
					} catch (_) {
						/* 预览拿不到就显示占位，不影响设置页本身 */
					}
				}
				if (Object.keys(next).length) setPreviews((previous) => ({ ...previous, ...next }));
			}, []);

			useEffect(() => {
				ensureCss();
				refresh();
				loadPreviews();
			}, [refresh, loadPreviews]);

			const save = useCallback(async (patch, key) => {
				const next = { ...(draft || {}), ...patch };
				setDraft(next);
				clearError(key);
				setBusy(true);
				try {
					const response = await fetch(API_PATH, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ settings: next }),
					});
					const data = await response.json();
					if (data && data.ok) {
						setStatus((previous) => ({ ...(previous || {}), ...data }));
						setDraft(data.settings);
					} else {
						fail(key, "保存失败：" + ((data && data.error) || "服务端没有返回原因"));
					}
				} catch (error) {
					fail(key, "保存失败：" + String((error && error.message) || error));
				} finally {
					setBusy(false);
				}
			}, [draft]);

			const upload = useCallback(async (kind, file) => {
				if (!file) return;
				const limit = LIMIT_MB[kind] || LIMIT_MB.identity;
				const prefix = kind === "artwork" ? "换图失败：" : "头像换图失败：";
				clearError(kind);
				if (file.type && !/^image\//.test(file.type)) {
					fail(kind, prefix + `这不是图片文件（${file.type}），要 png / jpg / webp 这类`);
					return;
				}
				if (typeof file.size === "number" && file.size > limit * 1024 * 1024) {
					fail(kind, prefix + `图片太大（${(file.size / 1048576).toFixed(1)} MB），上限 ${limit} MB`);
					return;
				}
				setBusy(true);
				setPending(kind);
				try {
					const data = await readAsDataUrl(file);
					const response = await fetch(API_PATH, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ action: "upload", kind, data }),
					});
					const result = await response.json().catch(() => null);
					if (!result || result.ok !== true) {
						fail(kind, prefix + ((result && result.error) || `HTTP ${response.status}，服务端没有返回原因`));
						return;
					}
					// 守卫：后端没重启时（还是旧版 index.js），这个 action 会被当成普通设置保存，
					// 返回 ok=true 但没有任何落盘结果 —— 那样会误以为换图成功，所以要挑明。
					if (!result.file) {
						fail(kind, prefix + "后端还是旧版：上传接口没生效，重启一次 DSH 再试");
						return;
					}
					setPreviews((previous) => ({ ...previous, [kind]: data }));
					if (await refresh()) toast.show(owner, 'success', t('updated'));
				} catch (error) {
					fail(kind, prefix + String((error && error.message) || error));
				} finally {
					setPending("");
					setBusy(false);
				}
			}, [refresh]);

			const resetAll = useCallback(async () => {
				setBusy(true);
				clearError("page");
				try {
					const response = await fetch(API_PATH, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ action: "resetAll" }),
					});
					const result = await response.json().catch(() => null);
					if (!result || result.ok !== true) {
						fail("page", "恢复默认失败：" + ((result && result.error) || `HTTP ${response.status}`));
						return;
					}
					// 同上：旧后端没有 resetAll，会当成保存设置返回 ok=true，但素材没还原
					if (!result.settings || !result.artwork) {
						fail("page", "恢复默认失败：后端还是旧版，重启一次 DSH 再试");
						return;
					}
					setDraft(result.settings);
					setErrors({});
					setPreviews({ identity: "", artwork: "" });
					const refreshed = await refresh();
					await loadPreviews();
					if (refreshed) toast.show(owner, 'success', t('resetDone'));
				} catch (error) {
					fail("page", "恢复默认失败：" + String((error && error.message) || error));
				} finally {
					setBusy(false);
					setConfirmReset(false);
				}
			}, [refresh, loadPreviews]);

			if (draft === undefined) {
				return h("div", { className: "dsla-page" },
					h("div", { className: errors.page ? "dsla-errTop" : "dsla-label" },
						errors.page ? (errors.page || t("readFailedTitle")) : t("loading")));
			}

			// 自定义头像不可用时，用状态里的原因直接说人话；上传失败走 errors.identity
			const identityState = (status && status.identityImage) || {};
			let identityError = errors.identity || "";
			if (!identityError && draft.identityMode === "custom" && identityState.ok === false) {
				const reasonKey = REASON_KEYS[identityState.reason];
				const reasonText = reasonKey ? t(reasonKey) : identityState.reason;
				identityError = `${t("identityLabel")}: ${reasonText}${identityState.file ? ` (${identityState.file})` : ""}`;
			}

			return h("div", { className: "dsla-page" }, [
				h("div", { key: "head", className: "dsla-head" }, [
					h("h1", { key: "t", className: "dsla-title" }, t("title")),
					h("div", { key: "a", className: "dsla-actions" }, [
						h("button", { key: "no", type: "button", className: "dsla-btn", disabled: busy || confirmReset, onClick: async () => { setConfirmReset(true); try { if (await toast.confirm(owner, t("confirmReset"), [t("confirm"), t("cancel")])) await resetAll(); } finally { setConfirmReset(false); } } }, t("reset")),
					]),
				]),
				errors.page ? h("div", { key: "pageerr", className: "dsla-errTop" }, errors.page) : null,

				h("div", { key: "c1", className: "dsla-card" }, [
					h("h2", { key: "ct", className: "dsla-card-title" }, t("cardAnim")),
					h(Row, {
						key: "mode",
						label: t("modeLabel"),
						desc: t("modeDesc"),
						error: errors.mode || null,
					}, h(Segmented, {
						value: draft.mode,
						disabled: busy,
						options: [
							{ value: "full", label: t("modeFull") },
							{ value: "fast", label: t("modeFast") },
						],
						onChange: (value) => save({ mode: value }, "mode"),
					})),
				]),

				h("div", { key: "c2", className: "dsla-card" }, [
					h("h2", { key: "ct", className: "dsla-card-title" }, t("cardBg")),
					h(Row, {
						key: "identity",
						tall: true,
						label: t("identityLabel"),
						desc: t("identityDesc"),
						error: identityError,
						busy: pending === "identity" ? t("busyIdentity") : "",
					}, h(ImagePicker, {
						variant: "avatar",
						preview: previews.identity,
						disabled: busy,
						replaceLabel: t("replace"),
						onPick: (file) => upload("identity", file),
					})),
					h(Row, {
						key: "artwork",
						tall: true,
						label: t("artworkLabel"),
						desc: t("artworkDesc"),
						error: errors.artwork || null,
						busy: pending === "artwork" ? t("busyArtwork") : "",
					}, h(ImagePicker, {
						variant: "artwork",
						preview: previews.artwork,
						disabled: busy,
						replaceLabel: t("replace"),
						onPick: (file) => upload("artwork", file),
					})),
				]),
			]);
		}

		//#endregion

		/** 黑匣子上报：把页面实况 + 注入脚本的轨迹回报给宿主落盘（只读页面状态，失败不影响使用）。 */
		async function reportDiagnostics(phase) {
			try {
				if (typeof fetch !== "function" || typeof document === "undefined") return;
				const hostNode = document.getElementById("dsh-launch-animation");
				const trace = Array.isArray(window.__DSH_LAUNCH_ANIMATION_TRACE__) ? window.__DSH_LAUNCH_ANIMATION_TRACE__ : null;
				const stage = (() => {
					try {
						const win = hostNode && hostNode.shadowRoot && hostNode.shadowRoot.querySelector(".window");
						return win ? (win.dataset.stage || "") : null;
					} catch (_) { return null; }
				})();
				const report = {
					at: new Date().toISOString(),
					phase: phase || "",
					href: String(location.href),
					overlayPresent: Boolean(hostNode),
					overlayHasShadow: Boolean(hostNode && hostNode.shadowRoot),
					overlayStage: stage,
					activeFlag: window.__DSH_LAUNCH_ANIMATION_ACTIVE__ === true,
					captionStylePresent: Boolean(document.getElementById("dsh-launch-animation-caption")),
					captionProbePresent: Boolean(document.querySelector('span[style*="--dsw-specific-sidebar-fill"]')),
					captionProbeColors: (() => {
						try {
							const probe = document.querySelector('span[style*="--dsw-specific-sidebar-fill"]');
							if (!probe) return null;
							const s = getComputedStyle(probe);
							return { fill: s.backgroundColor, symbol: s.color };
						} catch (_) { return null; }
					})(),
					captionStyleText: (() => {
						try {
							const el = document.getElementById("dsh-launch-animation-caption");
							return el ? el.textContent.replace(/\s+/g, " ").slice(0, 160) : null;
						} catch (_) { return null; }
					})(),
					bootCardPresent: Boolean(document.querySelector("[data-dsh-boot]")),
					rootChildren: (() => { try { const r = document.getElementById("root"); return r ? r.childElementCount : -1; } catch (_) { return -1; } })(),
					readyState: document.readyState,
					dslanStyleRows: Array.from(document.querySelectorAll("style")).filter((n) => (n.textContent || "").indexOf("dslan-host") >= 0).length,
					overlayGeometry: (() => {
						try {
							const sr = hostNode && hostNode.shadowRoot;
							const w = sr && sr.querySelector(".window");
							const r = w && w.getBoundingClientRect();
							const rr = hostNode && hostNode.getBoundingClientRect();
							return { window: r ? Math.round(r.width) + "x" + Math.round(r.height) : null, host: rr ? Math.round(rr.width) + "x" + Math.round(rr.height) : null };
						} catch (_) { return null; }
					})(),
					trace: trace ? trace.slice(-60) : null,
				};
				await fetch(API_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "report", report }) });
			} catch (_) { /* 上报失败忽略 */ }
		}

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, DICTS), "launch-animation: dictionaries");
			ctx.effect(() => {
				const mid = window.setTimeout(() => { reportDiagnostics("mid"); }, 6000);
				const after = window.setTimeout(() => { reportDiagnostics("after"); }, 22000);
				return () => { window.clearTimeout(mid); window.clearTimeout(after); };
			}, "launch-animation: diagnostics");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: NS,
						order: 23,
						label: () => t("tab"),
						locale: NS,
					},
					LaunchAnimationPage,
				),
			);
		}

		exports.name = NS;
		exports.inject = inject;
		exports.apply = apply;
		// ⚠️ 这一行不能删：factory 必须返回 exports，否则 __ModuleLoader__ 拿到 undefined，
		// DSH 会报 "invalid plugin, expect function or object with an apply method, received undefined"
		// 并在 web 启动阶段致命退出（2026-10-08 就是这么崩的）。回归测试：源码\tests\客户端半边自测.mjs
		return module.exports;
	},
});
