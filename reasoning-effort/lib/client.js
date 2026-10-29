/**
 * dsh-reasoning-effort · client 半边（v0.3.0 · 2026-10-26 重写）
 *
 * 挂在 DSH 的 conversation.input.model 座位上，提供：
 *   ① 输入框里的模型胶囊（闪电 + 模型名 + 档位名 + 折叠箭头）
 *   ② 点开后的弹窗：顶栏（闪电 / 模型卡 / 切回默认）+ 推理强度滑条 + 模型列表
 *   ③ 闪电加速档：在普通版与加速版之间切换
 *
 * ── 本次重写删掉的东西 ──────────────────────────────────────────────
 *   · 「设置 → 思考档位」整个页面（settings.section 注册、页面组件、.dsh-rs 全部样式），
 *     以及它对 remote.settings 的读写依赖 —— 本插件不提供设置页。
 *   · 右上角按钮从「设为默认（新会话沿用）」改成「切回默认」：
 *     点一下固定切到 deepseek-account / deepseek-flash / high，在哪个对话里点都生效。
 *
 * 档位怎么来：完全由 DSH 按模型官方目录决定（插件不碰、不补、不覆盖）。
 * 配置怎么来：4 个开关值在 $DSH_HOME/reasoning-effort/settings.json，由 host 路由提供。
 */
window.__ModuleLoader__.load({
	id: "dsh-reasoning-effort",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");

		/* ════════════════════════════════════════════════════════════════
		   1. 文案
		   ════════════════════════════════════════════════════════════════ */
		const zh = {
			label: "推理强度",
			chooseModel: "选择模型",
			menu: "模型与推理强度",
			loading: "正在刷新模型列表…",
			empty: "没有可用的模型。",
			supported: "支持档位",
			unsupported: "不可用",
			turboOn: "加速模式",
			turboOff: "普通模式",
			turboNoBase: "当前模型没有加速版",
			switchDefault: "切回默认",
			error: "设置失败：{message}"
		};
		const en = {
			label: "Reasoning",
			chooseModel: "Choose a model",
			menu: "Model and reasoning effort",
			loading: "Refreshing models…",
			empty: "No models available.",
			supported: "Supported effort",
			unsupported: "Unavailable",
			turboOn: "Turbo",
			turboOff: "Standard",
			turboNoBase: "No turbo build for this model",
			switchDefault: "Back to default",
			error: "Unable to update effort: {message}"
		};

		/* ════════════════════════════════════════════════════════════════
		   2. 加速档配置（来自 host 的 /api/reasoning-effort）
		   改完 settings.json 后要刷新页面才生效 —— 它不在 DSH 的 settings 里，
		   ���不到那套约 2 秒的热更新。
		   ════════════════════════════════════════════════════════════════ */
		let TURBO_BASE_MODEL_ID = "mimo-v2.6-pro";
		let TURBO_MODEL_ID = "mimo-v2.6-pro-ultraspeed";
		let BOLT_ON_FLASH = false;
		let HIDDEN_MODELS = ["mimo-v2.6-pro-ultraspeed"];
		const TURBO_ROUTE = "/api/reasoning-effort";

		/** 「是不是加速版」只看 turboModelId；「要不要在列表里藏掉」只看 hiddenModels。 */
		const isTurboModelId = (id) => id === TURBO_MODEL_ID;
		const isHiddenModel = (id) => HIDDEN_MODELS.indexOf(id) >= 0;

	/** 配置是异步拉的：到货之后要能叫醒已经渲染的界面，否则隐藏名单/加速档要刷新页面才生效。 */
	let configVersion = 0;
	const configListeners = new Set();
	function subscribeConfig(listener) {
		configListeners.add(listener);
		return () => { configListeners.delete(listener); };
	}
	function bumpConfig() {
		configVersion += 1;
		for (const listener of [...configListeners]) { try { listener(); } catch (_) {} }
	}
	const readConfigVersion = () => configVersion;

		function loadTurboConfig() {
			fetch(TURBO_ROUTE, { method: "GET" })
				.then((r) => r.json())
				.then((d) => {
					const s = d && d.ok === true ? d.settings : null;
					if (s === null || typeof s !== "object") return;
					if (typeof s.turboBaseModelId === "string" && s.turboBaseModelId !== "") TURBO_BASE_MODEL_ID = s.turboBaseModelId;
					if (typeof s.turboModelId === "string" && s.turboModelId !== "") TURBO_MODEL_ID = s.turboModelId;
					BOLT_ON_FLASH = s.boltOnFlash === true;
					if (Array.isArray(s.hiddenModels)) HIDDEN_MODELS = s.hiddenModels.filter((v) => typeof v === "string" && v !== "");
			bumpConfig();
				})
				.catch(() => {});
		}

		/* ════════════════════════════════════════════════════════════════
		   3. 「切回默认」的目标
		   官方账户的 DeepSeek-V4.1-Flash（模型 id 就是 deepseek-flash，
		   界面上那个「1017」是 DSH 自带的小角标，不是模型名的一部分）。
		   走的是 DSH 的选择通道，所以点了它之后，新会话默认也会变成这个组合
		   —— 这正好是预期效果。
		   ════════════════════════════════════════════════════════════════ */
		const DEFAULT_PROVIDER = "deepseek-account";
		const DEFAULT_MODEL = "deepseek-flash";
		const DEFAULT_EFFORT = "high";

		/* ════════════════════════════════════════════════════════════════
		   3.5 切换流程
		   切换成功与否都不加额外提示：模型显示本身就是结果——切成功了
		   界面就变成那个模型，失败了就还是原来的样子。
		   失败静默吞掉；忙碌态无论成败都会复位。
		   导出这个函数是为了能脱离界面做回归测试。
		   ════════════════════════════════════════════════════════════════ */
		const commitSwitch = async (select, selection, handlers) => {
			handlers.begin();
			try {
				await select(selection);
			} catch {
				/* 失败就让界面保持原样，不弹提示、不打勾 */
			} finally {
				handlers.settle();
			}
		};

		/* ════════════════════════════════════════════════════════════════
		   4. 小图标
		   ════════════════════════════════════════════════════════════════ */
		/** 闪电图标：纯装饰。可点时由外层 <button> 承接点击与键盘。 */
		function BoltIcon({ active, disabled }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				className: "dsh-reasoning-model__bolt",
				viewBox: "0 0 24 24",
				"aria-hidden": "true",
				"data-active": active === true ? "true" : "false",
				"data-disabled": disabled === true ? "true" : "false",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
					fill: active === true && disabled !== true ? "currentColor" : "none",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}

		function ChevronIcon({ open }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className: "dsh-reasoning-model__chevron",
				"data-open": open,
				viewBox: "0 0 24 24",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "m7 9 5 5 5-5",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2.2",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}

		/* ════════════════════════════════════════════════════════════════
		   5. 推理强度滑条（Codex 风格粗滑条，离散档位）
		   ════════════════════════════════════════════════════════════════ */
		function clamp(value, min, max) {
			return Math.max(min, Math.min(max, value));
		}

		function EffortSlider({ efforts, index, disabled, onChange, onCommit, label }) {
			const trackRef = (0, react.useRef)(null);
			const draggingRef = (0, react.useRef)(false);
			const dragStartIndexRef = (0, react.useRef)(0);
			const [dragging, setDragging] = (0, react.useState)(false);
			/* length<=1 时 lastIndex=0，避免误传入 1 档时指到不存在的 index 1 */
			const lastIndex = Math.max(0, efforts.length - 1);
			const shownIndex = clamp(Math.round(index), 0, lastIndex);

			/* 轨道两端各留 15px 给 28px 的滑块，避免它被裁掉。 */
			const positionForIndex = (value) => {
				const ratio = efforts.length <= 1 ? 0 : clamp(value / lastIndex, 0, 1);
				const percent = ratio * 100;
				const offset = 15 - 30 * ratio;
				const sign = offset < 0 ? "- " : "+ ";
				return "calc(" + percent + "% " + sign + Math.abs(offset) + "px)";
			};
			const positionFor = (clientX) => {
				const track = trackRef.current;
				if (track === null || efforts.length <= 1) return 0;
				const rect = track.getBoundingClientRect();
				return clamp(((clientX - rect.left - 15) / Math.max(1, rect.width - 30)) * lastIndex, 0, lastIndex);
			};
			const snap = (position) => clamp(Math.round(position), 0, lastIndex);

			const onPointerDown = (event) => {
				if (disabled) return;
				event.preventDefault();
				event.currentTarget.setPointerCapture(event.pointerId);
				dragStartIndexRef.current = shownIndex;
				draggingRef.current = true;
				setDragging(true);
				onChange(snap(positionFor(event.clientX)));
			};
			const onPointerMove = (event) => {
				if (!draggingRef.current) return;
				onChange(snap(positionFor(event.clientX)));
			};
			const finishPointer = (event) => {
				if (!draggingRef.current) return;
				const next = snap(positionFor(event.clientX));
				draggingRef.current = false;
				setDragging(false);
				onChange(next);
				onCommit(next);
				if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
			};
			const cancelPointer = (event) => {
				if (!draggingRef.current) return;
				draggingRef.current = false;
				setDragging(false);
				onChange(dragStartIndexRef.current);
				if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
			};
			const onKeyDown = (event) => {
				if (disabled) return;
				const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1
					: event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1
						: 0;
				if (direction === 0) return;
				event.preventDefault();
				const next = clamp(shownIndex + direction, 0, lastIndex);
				onChange(next);
				onCommit(next);
			};

			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: trackRef,
				className: "dsh-reasoning-effort__slider",
				"data-dragging": dragging,
				role: "slider",
				tabIndex: disabled ? -1 : 0,
				"aria-label": label || "Reasoning",
				"aria-valuemin": 0,
				"aria-valuemax": lastIndex,
				"aria-valuenow": shownIndex,
				/* 恰好两档的模型（xiaomi）对外说 Off / On，别把配置键漏出去。 */
				"aria-valuetext": efforts.length === 2
					? (efforts[shownIndex]?.id === "off" ? "Off" : "On")
					: efforts[shownIndex]?.name ?? "",
				onPointerDown,
				onPointerMove,
				onPointerUp: finishPointer,
				onPointerCancel: cancelPointer,
				onKeyDown,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-reasoning-effort__range",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-reasoning-effort__rail" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-reasoning-effort__fill",
							style: { width: positionForIndex(shownIndex) }
						}),
						efforts.map((effort, effortIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-reasoning-effort__tick",
							"data-active": effortIndex <= shownIndex,
							"data-major": effortIndex === shownIndex,
							style: { left: positionForIndex(effortIndex) },
							title: effort.description
						}, effort.id)),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-reasoning-effort__thumb",
							style: { left: positionForIndex(shownIndex) }
						})
					]
				})
			});
		}

		/* ════════════════════════════════════════════════════════════════
		   6. 模型座位（输入框里的那颗胶囊 + 弹窗）
		   ════════════════════════════════════════════════════════════════ */
		function groupLabel(group) {
			const namedGroup = group;
			return namedGroup.name ?? namedGroup.label ?? namedGroup.title ?? group.id;
		}

		function modelFor(state) {
			const current = state.current;
			if (current === null) return void 0;
			for (const group of state.groups) {
				if (group.id !== current.provider) continue;
				const model = group.models.find((candidate) => candidate.id === current.model);
				if (model !== void 0) return { current, group, model };
			}
		}

		function ReasoningBar({ locked, directory, load, select, t }) {
			const state = (0, react.useSyncExternalStore)(
				(listener) => directory.subscribe(listener),
				() => directory.getSnapshot()
			);
			const [open, setOpen] = (0, react.useState)(false);
			const [pendingEffort, setPendingEffort] = (0, react.useState)(null);
			const [pendingModel, setPendingModel] = (0, react.useState)(null);
			const [committing, setCommitting] = (0, react.useState)(false);
			const [modelsScrolling, setModelsScrolling] = (0, react.useState)(false);
			const [expandedProviders, setExpandedProviders] = (0, react.useState)(() => new Set());
			const [activeModelIndex, setActiveModelIndex] = (0, react.useState)(0);
			const [view, setView] = (0, react.useState)("main");
			const rootRef = (0, react.useRef)(null);
			const modelScrollTimerRef = (0, react.useRef)(null);
			/* Esc 可能同时打到组件 onKeyDown 与 document 监听；同步闸门避免连 select 两次 */
			const closingRef = (0, react.useRef)(false);
			const configTick = (0, react.useSyncExternalStore)(subscribeConfig, readConfigVersion);

			(0, react.useEffect)(() => {
				load();
			}, [load]);

			(0, react.useEffect)(() => () => {
				if (modelScrollTimerRef.current !== null) window.clearTimeout(modelScrollTimerRef.current);
			}, []);

			const currentModel = (0, react.useMemo)(() => modelFor(state), [state]);

			/* 展平后的可见模型（只含已展开的 provider，且滤掉隐藏名单） */
			const flatModels = (0, react.useMemo)(() => {
				const list = [];
				for (const group of state.groups) {
					if (!expandedProviders.has(group.id)) continue;
					for (const model of group.models) {
						if (isHiddenModel(model.id)) continue;
						list.push({ group, model });
					}
				}
				return list;
			}, [state.groups, expandedProviders, configTick]);

			const visibleGroup = pendingModel?.group ?? currentModel?.group;
			const visibleModel = pendingModel?.model ?? currentModel?.model;
			const reasoning = visibleModel?.reasoning;
			const efforts = reasoning?.efforts ?? [];
			const fallbackEffort = reasoning?.defaultEffort ?? efforts[Math.floor(efforts.length / 2)]?.id;
			const selectedId = pendingModel === null
				? (state.current?.reasoningEffort ?? fallbackEffort)
				: (pendingModel.effortId ?? fallbackEffort);
			const selectedIndex = Math.max(0, efforts.findIndex((effort) => effort.id === selectedId));
			const selected = efforts[selectedIndex];
			const visibleModelKey = visibleModel === void 0 || visibleGroup === void 0
				? void 0
				: visibleGroup.id + ":" + visibleModel.id + ":" + efforts.map((effort) => effort.id).join(",");

			/* 拖动中的预览位置：模型或档位一变就失效，退回真实选中值。 */
			const displayIndex = pendingEffort !== null
				&& pendingEffort.modelKey === visibleModelKey
				&& pendingEffort.effortId !== selected?.id
				&& state.error === null
				? clamp(pendingEffort.index, 0, Math.max(0, efforts.length - 1))
				: selectedIndex;
			const displaySelected = efforts[displayIndex];
			const isMax = efforts.length > 1 && displayIndex === efforts.length - 1;
			const busy = locked === true || committing || state.status === "selecting";

			/* 切到加速版时仍然显示同 provider 里普通版的名字，靠闪电亮灭区分。 */
			const turboBaseName = visibleGroup?.models?.find((m) => m.id === TURBO_BASE_MODEL_ID)?.name ?? TURBO_BASE_MODEL_ID;
			const modelLabel = visibleModel !== void 0 && isTurboModelId(visibleModel.id)
				? turboBaseName
				: (visibleModel?.name ?? state.current?.model ?? t("chooseModel"));

			const activeProvider = pendingModel?.group.id ?? state.current?.provider;
			const activeModelId = pendingModel?.model.id ?? state.current?.model;

			/* 只在这两处主动滚动：① 进入模型列表时定位当前模型；② 键盘移动高亮时跟随。
			   展开/收起 provider 一律不滚 —— 否则序号重排会把列表拽回当前模型那页。 */
			const scrollModelIntoView = (index) => {
				const node = document.getElementById("dsh-reasoning-model-option-" + index);
				if (node !== null && node.scrollIntoView) node.scrollIntoView({ block: "nearest" });
			};

			const closePicker = (0, react.useCallback)(() => {
				if (!open || committing || closingRef.current) return;
				closingRef.current = true;
				const staged = pendingModel;
				setOpen(false);
				setPendingEffort(null);
				if (staged === null || state.current === null) {
					setPendingModel(null);
					return;
				}
				const selection = { provider: staged.group.id, model: staged.model.id };
				if (staged.effortId !== void 0) selection.reasoningEffort = staged.effortId;
				setCommitting(true);
				select(selection).catch(() => {}).finally(() => {
					setCommitting(false);
					setPendingModel(null);
				});
			}, [committing, open, pendingModel, select, state.current]);

			(0, react.useEffect)(() => {
				if (open) closingRef.current = false;
			}, [open]);

			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					const target = event.target;
					if (target instanceof Node && rootRef.current?.contains(target)) return;
					closePicker();
				};
				// Esc 也要能关：点开弹层不一定会把焦点搬进组件里（焦点常常还在输入框），
				// 只靠组件上的 onKeyDown 会漏掉这种情况。
				const closeOnEscape = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					closePicker();
				};
				document.addEventListener("mousedown", closeOutside);
				document.addEventListener("keydown", closeOnEscape);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
					document.removeEventListener("keydown", closeOnEscape);
				};
			}, [closePicker, open]);

			(0, react.useEffect)(() => {
				if (pendingEffort === null) return;
				if (pendingEffort.modelKey !== visibleModelKey || pendingEffort.effortId === selected?.id || state.error !== null) {
					setPendingEffort(null);
				}
			}, [pendingEffort, selected?.id, state.error, visibleModelKey]);

			const chooseModel = (provider, modelId) => {
				const targetGroup = state.groups.find((group) => group.id === provider);
				const target = targetGroup?.models.find((model) => model.id === modelId);
				if (target === void 0 || targetGroup === void 0 || state.current === null) return;
				if (pendingModel?.group.id === provider && pendingModel.model.id === modelId) return;
				if (pendingModel === null && state.current.provider === provider && state.current.model === modelId) return;
				const targetEfforts = target.reasoning?.efforts ?? [];
				const currentEffort = pendingModel?.effortId ?? state.current.reasoningEffort;
				const effort = currentEffort !== void 0 && targetEfforts.some((item) => item.id === currentEffort)
					? currentEffort
					: (target.reasoning?.defaultEffort ?? targetEfforts[Math.floor(targetEfforts.length / 2)]?.id);
				setPendingEffort(null);
				setPendingModel({ group: targetGroup, model: target, effortId: effort });
			};

			const toggleProvider = (provider) => {
				setExpandedProviders((previous) => {
					const next = new Set(previous);
					if (next.has(provider)) next.delete(provider);
					else next.add(provider);
					return next;
				});
			};

			(0, react.useEffect)(() => {
				if (!open) return;
				const index = flatModels.findIndex((entry) => entry.group.id === activeProvider && entry.model.id === activeModelId);
				if (index >= 0) setActiveModelIndex(index);
			}, [open, flatModels, activeProvider, activeModelId]);

			(0, react.useEffect)(() => {
				if (!open || view !== "models") return;
				const index = flatModels.findIndex((entry) => entry.group.id === activeProvider && entry.model.id === activeModelId);
				if (index >= 0) {
					scrollModelIntoView(index);
					return;
				}
				/* 当前模型的 provider 被收起时，退化为滚到那个标题。 */
				const head = document.getElementById("dsh-reasoning-model-provider-" + activeProvider);
				if (head !== null && head.scrollIntoView) head.scrollIntoView({ block: "nearest" });
			}, [open, view]);

			/* Off / On 显示名：档位键只能用 DSH 的七档枚举（写不进 "on"），
			   所以配置用 off/high，由前端在「恰好两档」时改显示。 */
			const twoTier = efforts.length === 2;
			const labelFor = (effort) => effort === void 0
				? t("unsupported")
				: twoTier
					? (effort.id === "off" ? "Off" : "On")
					: effort.name;

			/* 闪电状态跟「眼前看到的模型」走（含弹窗里的预选），两颗按钮读同一组值。 */
			const turboActive = activeModelId !== void 0 && isTurboModelId(activeModelId);
			const knownBase = activeModelId !== void 0 && (activeModelId === TURBO_BASE_MODEL_ID || isTurboModelId(activeModelId));
			const hasBase = knownBase || BOLT_ON_FLASH === true;
			const boltDisabled = activeModelId === void 0 || busy || !hasBase;
			const boltTitle = turboActive ? t("turboOn") : hasBase ? t("turboOff") : t("turboNoBase");

			const toggleTurbo = () => {
				if (boltDisabled || state.current === null) return;
				const baseId = pendingModel?.model.id ?? state.current.model;
				const provider = pendingModel?.group.id ?? state.current.provider;
				const selection = {
					provider,
					model: isTurboModelId(baseId) ? TURBO_BASE_MODEL_ID : TURBO_MODEL_ID
				};
				const effort = pendingModel?.effortId ?? state.current.reasoningEffort;
				if (effort !== void 0) selection.reasoningEffort = effort;
				/* 闪电接管本次切换：必须丢掉预选，否则关弹窗时 closePicker 会再 select 一次覆盖掉。 */
				setPendingModel(null);
				setPendingEffort(null);
				setCommitting(true);
				select(selection).catch(() => {}).finally(() => {
					setCommitting(false);
				});
			};

			/* ── 切回默认 ──────────────────────────────────────────────
			   固定切到官方账户的 DeepSeek-V4.1-Flash + High，不看当前在哪个对话、
			   也不看当前模型是什么。走 DSH 的选择通道，所以顺带会把新会话默认
			   也设成这个组合（这正是预期行为）。 */
			const switchToDefault = () => {
				if (busy) return;
				commitSwitch(select, {
					provider: DEFAULT_PROVIDER,
					model: DEFAULT_MODEL,
					reasoningEffort: DEFAULT_EFFORT
				}, {
					begin: () => {
						setPendingModel(null);
						setPendingEffort(null);
						setCommitting(true);
					},
					settle: () => {
						setCommitting(false);
					}
				});
			};

			const providerLabel = visibleGroup === void 0 ? t("chooseModel") : groupLabel(visibleGroup);

			const onModelsKeyDown = (event) => {
				if (flatModels.length === 0) return;
				const last = flatModels.length - 1;
				if (event.key === "ArrowDown") {
					event.preventDefault();
					const next = Math.min(last, activeModelIndex + 1);
					setActiveModelIndex(next);
					scrollModelIntoView(next);
					return;
				}
				if (event.key === "ArrowUp") {
					event.preventDefault();
					const next = Math.max(0, activeModelIndex - 1);
					setActiveModelIndex(next);
					scrollModelIntoView(next);
					return;
				}
				if (event.key === "Home") {
					event.preventDefault();
					setActiveModelIndex(0);
					scrollModelIntoView(0);
					return;
				}
				if (event.key === "End") {
					event.preventDefault();
					setActiveModelIndex(last);
					scrollModelIntoView(last);
					return;
				}
				if (event.key === "Enter") {
					const entry = flatModels[activeModelIndex];
					if (entry === void 0) return;
					event.preventDefault();
					chooseModel(entry.group.id, entry.model.id);
				}
			};

			const commitEffort = (index) => {
				const effort = efforts[index];
				if (effort === void 0 || effort.id === selected?.id) return;
				if (pendingModel !== null) {
					setPendingModel((previous) => previous === null ? previous : { ...previous, effortId: effort.id });
					setPendingEffort(null);
					return;
				}
				if (state.current === null) return;
				select({
					provider: state.current.provider,
					model: state.current.model,
					reasoningEffort: effort.id
				}).catch(() => {});
			};

			const previewEffort = (index) => {
				const effort = efforts[index];
				if (effort === void 0 || visibleModelKey === void 0) return;
				if (pendingModel !== null) {
					setPendingModel((previous) => previous === null ? previous : { ...previous, effortId: effort.id });
					setPendingEffort(null);
					return;
				}
				setPendingEffort({ modelKey: visibleModelKey, effortId: effort.id, index });
			};

			const markModelsScrolling = () => {
				setModelsScrolling(true);
				if (modelScrollTimerRef.current !== null) window.clearTimeout(modelScrollTimerRef.current);
				modelScrollTimerRef.current = window.setTimeout(() => {
					modelScrollTimerRef.current = null;
					setModelsScrolling(false);
				}, 100);
			};

			const toggle = () => {
				if (busy) return;
				if (open) {
					closePicker();
					return;
				}
				load();
				/* 每次打开都回到档位页；分组只展开当前 provider，其余闭合（不记忆上次状态）。 */
				setView("main");
				setExpandedProviders(new Set(activeProvider === void 0 ? [] : [activeProvider]));
				setOpen(true);
			};

			const onKeyDown = (event) => {
				if (event.key !== "Escape" || !open) return;
				event.preventDefault();
				event.stopPropagation();
				closePicker();
			};

			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: "dsh-reasoning-model",
				"data-busy": busy,
				"data-max": isMax,
				"data-open": open,
				onKeyDown,
				children: [
					/* ── 胶囊本体：闪电与触发器是并列按钮，避免按钮套按钮 ── */
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-reasoning-model__shell",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsh-reasoning-model__bolt-btn",
								type: "button",
								title: boltTitle,
								"aria-label": boltTitle,
								"aria-pressed": turboActive,
								disabled: boltDisabled,
								onClick: toggleTurbo,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BoltIcon, {
									active: turboActive,
									disabled: boltDisabled
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: "dsh-reasoning-model__trigger",
								type: "button",
								"aria-haspopup": "dialog",
								"aria-expanded": open,
								"aria-label": reasoning === void 0
									? modelLabel
									: modelLabel + "，" + t("label") + " " + labelFor(displaySelected),
								disabled: busy,
								onClick: toggle,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-reasoning-model__model",
										title: modelLabel,
										children: modelLabel
									}),
									reasoning !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsh-reasoning-model__effort",
										title: t("label") + " " + labelFor(displaySelected),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: labelFor(displaySelected) })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronIcon, { open })
								]
							})
						]
					}),

					/* ── 弹窗 ── */
					open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-reasoning-model__popover",
						role: "dialog",
						"aria-label": t("menu"),
						"data-view": view,
						children: [
							/* 顶栏：闪电 / 模型卡 / 切回默认 */
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-reasoning-model__topbar",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "dsh-reasoning-model__fast",
										type: "button",
										title: boltTitle,
										"aria-label": boltTitle,
										"aria-pressed": turboActive,
										"data-active": turboActive ? "true" : "false",
										"data-disabled": boltDisabled ? "true" : "false",
										disabled: boltDisabled,
										onClick: toggleTurbo,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BoltIcon, {
											active: turboActive,
											disabled: boltDisabled
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										className: "dsh-reasoning-model__card",
										type: "button",
										disabled: busy,
										onClick: () => setView("models"),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-reasoning-model__card-name",
												title: modelLabel,
												children: modelLabel
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-reasoning-model__card-provider",
												children: providerLabel
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "dsh-reasoning-model__switch-default",
										type: "button",
										disabled: busy,
										title: t("switchDefault"),
										onClick: switchToDefault,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
											viewBox: "0 0 24 24",
											className: "dsh-reasoning-model__switch-icon",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
													d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.6",
													strokeLinecap: "round"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
													d: "M21 3v5h-5",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.6",
													strokeLinecap: "round",
													strokeLinejoin: "round"
												})
											]
										})
									})
								]
							}),

							/* 模型列表（第二层视图） */
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-reasoning-model__models",
								"data-scrolling": modelsScrolling,
								role: "listbox",
								tabIndex: 0,
								"aria-label": t("chooseModel"),
								"aria-activedescendant": "dsh-reasoning-model-option-" + activeModelIndex,
								onKeyDown: onModelsKeyDown,
								onWheel: markModelsScrolling,
								onScroll: markModelsScrolling,
								children: [
									state.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-reasoning-model__status",
										children: t("loading")
									}),
									state.groups.map((group) => {
										/* 整组模型都被隐藏 → 连组标题也不渲染，不留空壳。 */
										if ((group.models ?? []).every((model) => isHiddenModel(model.id))) return null;
										const expanded = expandedProviders.has(group.id);
										const name = groupLabel(group);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
											className: "dsh-reasoning-model__provider",
											"data-expanded": expanded,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
													className: "dsh-reasoning-model__provider-toggle",
													type: "button",
													id: "dsh-reasoning-model-provider-" + group.id,
													"aria-expanded": expanded,
													"aria-label": name,
													disabled: busy,
													onClick: () => toggleProvider(group.id),
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: "dsh-reasoning-model__provider-copy",
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "dsh-reasoning-model__provider-name",
															children: name
														})]
													})]
												}),
												expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "dsh-reasoning-model__provider-models",
													children: group.models
														.filter((model) => !isHiddenModel(model.id))
														.map((model) => {
															const active = activeProvider === group.id && activeModelId === model.id;
															const flatIndex = flatModels.findIndex((entry) => entry.group.id === group.id && entry.model.id === model.id);
															return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
																className: "dsh-reasoning-model__option",
																type: "button",
																role: "option",
																id: "dsh-reasoning-model-option-" + flatIndex,
																"aria-selected": active,
																"data-active": flatIndex === activeModelIndex,
																tabIndex: -1,
																disabled: busy,
																onClick: () => {
																	chooseModel(group.id, model.id);
																	setView("main");
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																	className: "dsh-reasoning-model__option-copy",
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: "dsh-reasoning-model__option-name",
																		children: model.name
																	})]
																})]
															}, group.id + ":" + model.id);
														})
												})
											]
										}, group.id);
									}),
									state.status === "ready" && state.groups.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-reasoning-model__status",
										children: t("empty")
									})
								]
							}),

							/* 推理强度区 */
							reasoning !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "dsh-reasoning-effort",
								"data-max": isMax,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-reasoning-effort__value",
										children: labelFor(displaySelected)
									}),
									efforts.length > 1
										? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EffortSlider, {
											efforts,
											index: displayIndex,
											disabled: busy,
											label: t("label"),
											onChange: previewEffort,
											onCommit: commitEffort
										})
										: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dsh-reasoning-effort__single",
											children: [t("supported"), ": ", labelFor(displaySelected)]
										})
								]
							}),

							state.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-reasoning-model__error",
								role: "status",
								children: t("error", { message: state.error })
							})
						]
					})
				]
			});
		}

		/* ════════════════════════════════════════════════════════════════
		   7. 样式（只留前台部分；设置页的 .dsh-rs 整套已随页面一起删除）
		   ════════════════════════════════════════════════════════════════ */
		const STYLE_ID = "dsh-reasoning-effort-styles";
		const PLUGIN_ID = "dsh-reasoning-effort";
		const CSS = `/* dsh-reasoning-effort · Codex 桌面端风格 */
.dsh-reasoning-model{position:relative;z-index:4;display:flex;min-width:0;max-width:min(100%,420px);align-items:center}
.dsh-reasoning-model__shell{box-sizing:border-box;display:flex;min-width:0;max-width:100%;height:32px;align-items:center;gap:2px;padding:0 7px 0 6px;border:1px solid transparent;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,#f1f2f4);color:var(--dsw-alias-label-secondary,#4f5867);transition:background-color .14s ease,border-color .14s ease,box-shadow .14s ease}
.dsh-reasoning-model__shell:hover{border-color:var(--dsw-alias-border-l2,#d8dce3);background:var(--dsw-alias-interactive-bg-hover,#eceef1)}
.dsh-reasoning-model__shell:has(:focus-visible){border-color:var(--dsw-alias-state-business-primary,#3b82f6);box-shadow:0 0 0 3px rgb(59 130 246 / 18%)}
.dsh-reasoning-model__bolt-btn{box-sizing:border-box;display:inline-flex;flex:none;width:22px;height:22px;align-items:center;justify-content:center;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer}
.dsh-reasoning-model__bolt-btn:disabled{cursor:default}
.dsh-reasoning-model__bolt-btn:focus-visible{outline:2px solid #0169cc;outline-offset:0}
.dsh-reasoning-model__bolt-btn:not(:disabled):hover .dsh-reasoning-model__bolt{color:var(--dsw-alias-button-primary-hover, #db2777)}
.dsh-reasoning-model__trigger{box-sizing:border-box;display:flex;min-width:0;flex:1;max-width:100%;height:32px;align-items:center;gap:6px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px;font-weight:500;line-height:17px;cursor:pointer}
.dsh-reasoning-model__trigger:focus-visible{outline:0}
.dsh-reasoning-model__trigger:disabled{color:var(--dsw-alias-label-dimmed,#a1a7b1);cursor:default;opacity:.72}
.dsh-reasoning-model[data-busy='true'] .dsh-reasoning-model__trigger:disabled{color:var(--dsw-alias-label-secondary,#4f5867);opacity:1}
.dsh-reasoning-model__bolt{width:16px;height:16px;flex:none;color:var(--dsw-alias-label-primary,#17191d);transition:color .2s ease;pointer-events:none}
.dsh-reasoning-model__bolt[data-active='true']{color:var(--dsw-alias-brand-primary, #f472b6);animation:dsh-bolt-breathe 2.4s ease-in-out infinite}
.dsh-reasoning-model__bolt[data-disabled='true']{color:#b6bcc6}
body[data-ds-dark-theme] .dsh-reasoning-model__bolt[data-active='true']{color:var(--dsw-alias-brand-primary, #f9a8d4)}
body[data-ds-dark-theme] .dsh-reasoning-model__bolt[data-disabled='true']{color:#4a4d53}
@keyframes dsh-bolt-breathe{0%,100%{opacity:.5}50%{opacity:1}}
.dsh-reasoning-model__model{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-reasoning-model__effort{display:inline-flex;min-width:0;align-items:center;gap:4px;color:var(--dsw-alias-brand-primary,#4d6bfe);font-weight:600;white-space:nowrap}
.dsh-reasoning-model[data-max='true'] .dsh-reasoning-model__effort{color:#924ff7}
.dsh-reasoning-model__chevron{width:15px;height:15px;flex:none;color:var(--dsw-alias-label-tertiary,#838b98);transition:transform .14s ease}
.dsh-reasoning-model__chevron[data-open='true']{transform:rotate(180deg)}

/* 面板：纯白 + 淡边框 + 淡阴影 */
.dsh-reasoning-model__popover{position:absolute;right:0;bottom:calc(100% + 8px);z-index:20;box-sizing:border-box;width:min(254px,calc(100vw - 24px));max-height:min(360px,calc(100vh - 96px));overflow:auto;overscroll-behavior:contain;padding:6px;border:1px solid #dadada;border-radius:16px;background:#fff;color:#1a1c1f;box-shadow:0 4px 12px rgb(20 30 50 / 8%);--dsh-scrollbar-width:6px;--dsh-scrollbar-thumb-border:2px;--dsh-scrollbar-thumb:rgb(26 28 31 / 18%);--dsh-scrollbar-thumb-hover:rgb(26 28 31 / 30%);transform-origin:bottom right;animation:dsh-reasoning-pop-in .32s cubic-bezier(.23,1,.32,1) 30ms both}
body[data-ds-dark-theme] .dsh-reasoning-model__popover{background:var(--dsw-alias-bg-overlay,#303136);color:#dfdfdf;border-color:rgb(255 255 255 / 12%);box-shadow:0 4px 12px rgb(0 0 0 / 34%);--dsh-scrollbar-thumb:rgb(255 255 255 / 20%);--dsh-scrollbar-thumb-hover:rgb(255 255 255 / 32%)}
@keyframes dsh-reasoning-pop-in{0%{opacity:0;transform:scale(.98)}to{opacity:1;transform:scale(1)}}
@supports (corner-shape:superellipse(1.5)){.dsh-reasoning-model__popover{border-radius:20px;corner-shape:superellipse(1.5)}}

/* 模型列表 */
.dsh-reasoning-model__models{display:flex;flex-direction:column;gap:1px;max-height:200px;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:0;outline:0}
.dsh-reasoning-model__models:focus-visible{outline:2px solid #0169cc;outline-offset:2px;border-radius:8px}
.dsh-reasoning-model__models[data-scrolling='true'] .dsh-reasoning-model__option{transition:none}
.dsh-reasoning-model__provider{min-width:0;padding:2px 0}
.dsh-reasoning-model__provider-toggle{display:flex;width:100%;min-height:28px;align-items:center;justify-content:space-between;gap:8px;padding:3px 6px;border:0;border-radius:8px;background:transparent;color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 65%,#000);text-align:left;font:inherit;font-size:14px;font-weight:600;line-height:20px;cursor:pointer;transition:background-color .12s ease}
.dsh-reasoning-model__provider-toggle:hover:not(:disabled){background:rgb(26 28 31 / 5%)}
.dsh-reasoning-model__provider-toggle:focus-visible{outline:2px solid #0169cc;outline-offset:-2px}
.dsh-reasoning-model__provider-toggle:disabled{color:#a1a7b1;cursor:wait}
.dsh-reasoning-model__provider-toggle::after{width:7px;height:7px;flex:none;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;content:'';opacity:.55;transform:rotate(45deg);transition:transform .14s ease}
.dsh-reasoning-model__provider[data-expanded='true'] .dsh-reasoning-model__provider-toggle::after{transform:rotate(-135deg)}
body[data-ds-dark-theme] .dsh-reasoning-model__provider-toggle:hover:not(:disabled){background:rgb(255 255 255 / 6%)}
.dsh-reasoning-model__provider-copy{display:flex;min-width:0;flex:1;align-items:baseline;justify-content:space-between;gap:10px}
.dsh-reasoning-model__provider-name{overflow:hidden;font-weight:600;color:inherit;text-overflow:ellipsis;white-space:nowrap}
body[data-ds-dark-theme] .dsh-reasoning-model__provider-name{color:#afafaf}
.dsh-reasoning-model__provider-models{display:flex;flex-direction:column;gap:1px;padding:2px 0 4px}
.dsh-reasoning-model__option{display:flex;width:100%;min-height:34px;align-items:center;gap:8px;padding:5px 8px;border:0;border-radius:8px;background:transparent;color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 50%,#fff);text-align:left;font:inherit;font-size:16px;line-height:22px;cursor:pointer;transition:background-color .12s ease}
.dsh-reasoning-model__option[aria-selected='true']{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 12%,transparent);color:var(--dsw-alias-brand-primary,#4d6bfe);font-weight:600}
.dsh-reasoning-model__option:hover:not(:disabled),.dsh-reasoning-model__option[data-active='true']{background:rgb(26 28 31 / 5%)}
body[data-ds-dark-theme] .dsh-reasoning-model__option{color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 45%,#000)}
body[data-ds-dark-theme] .dsh-reasoning-model__provider-toggle{color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 70%,#fff)}
body[data-ds-dark-theme] .dsh-reasoning-model__option[aria-selected='true']{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 20%,transparent);color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 85%,#fff)}
body[data-ds-dark-theme] .dsh-reasoning-model__option:hover:not(:disabled),body[data-ds-dark-theme] .dsh-reasoning-model__option[data-active='true']{background:rgb(255 255 255 / 6%)}
.dsh-reasoning-model__option:focus-visible{outline:2px solid #0169cc;outline-offset:-2px}
.dsh-reasoning-model__option:disabled{color:#a1a7b1;cursor:wait}
.dsh-reasoning-model__option-copy{display:flex;min-width:0;flex:1;flex-direction:column}
.dsh-reasoning-model__option-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-reasoning-model__status{padding:10px 8px;color:#8f8f8f;font-size:14px;line-height:20px}
.dsh-reasoning-model__error{margin:8px 4px 2px;padding:8px 9px;border-radius:8px;background:rgb(217 45 72 / 8%);color:#d92d48;font-size:13px;line-height:18px}

/* 推理强度区 */
.dsh-reasoning-effort{margin-top:5px;padding:8px 0 0;border-top:.5px solid rgb(26 28 31 / 8%)}
body[data-ds-dark-theme] .dsh-reasoning-effort{border-top-color:rgb(255 255 255 / 10%)}

/* 滑道：Codex 实测规格（轨道 24px / 圆点 4px / 滑块 28px） */
.dsh-reasoning-effort__value{padding:0;color:var(--dsw-alias-brand-primary,#4d6bfe);font-size:16px;font-weight:600;line-height:19px;text-align:center}
.dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__value{color:#924ff7}
body[data-ds-dark-theme] .dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__value{color:#ad7bf9}
.dsh-reasoning-effort__slider{height:28px;margin:8px 0 0;touch-action:none;cursor:pointer;outline:0}
.dsh-reasoning-effort__slider:active,.dsh-reasoning-effort__slider[data-dragging='true']{cursor:grabbing}
.dsh-reasoning-effort__range{position:relative;height:28px;margin:0;padding:0}
.dsh-reasoning-effort__rail{position:absolute;top:50%;right:6px;left:6px;height:24px;transform:translateY(-50%);border-radius:12px;background:#e8e7e8}
body[data-ds-dark-theme] .dsh-reasoning-effort__rail{background:rgb(255 255 255 / 12%)}
.dsh-reasoning-effort__fill{position:absolute;z-index:1;top:0;left:0;height:100%;min-width:0;border-radius:12px 0 0 12px;background:var(--dsw-alias-brand-primary,#4d6bfe);transition:width .18s cubic-bezier(.2,.8,.3,1)}
.dsh-reasoning-effort__tick{position:absolute;z-index:2;top:50%;width:4px;height:4px;border-radius:50%;transform:translate(-50%,-50%);background:#b5b5b7;transition:transform .12s ease,filter .12s ease}
.dsh-reasoning-effort__tick::before{position:absolute;top:-6px;right:-6px;bottom:-6px;left:-6px;content:'';border-radius:50%}
.dsh-reasoning-effort__tick[data-active='true']{background:rgb(255 255 255 / 30%)}
.dsh-reasoning-effort__tick:hover{filter:brightness(.85);transform:translate(-50%,-50%) scale(2)}
body[data-ds-dark-theme] .dsh-reasoning-effort__tick{background:rgb(255 255 255 / 45%)}
.dsh-reasoning-effort__thumb{position:absolute;z-index:3;top:50%;width:28px;height:28px;margin-left:0;transform:translate(-50%,-50%);border:1px solid #e4e4e5;border-radius:50%;background:#fff;box-shadow:0 0 2px #0000001a;transition:left .18s cubic-bezier(.2,.9,.25,1),transform .12s ease}
.dsh-reasoning-effort__slider:hover .dsh-reasoning-effort__thumb{transform:translate(-50%,-50%) scale(1.1429)}
.dsh-reasoning-effort__slider:focus-visible .dsh-reasoning-effort__thumb{outline:2px solid #0169cc;outline-offset:0}

/* 最高档（该模型的最后一档）：渐变 + 粒子 + 呼吸发光 + 扫光 + 滑块脉冲 */
.dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__fill{overflow:hidden;background-image:radial-gradient(circle 20px at 100% 50%,rgb(224 201 255 / 76%),rgb(224 201 255 / 0%) 100%),linear-gradient(90deg,#326fff 0%,#7057e9 56%,#a855f7 100%);animation:dsh-reasoning-max-flash 1.05s ease-in-out infinite}
.dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__fill::before{position:absolute;top:0;bottom:0;left:0;width:400%;background-image:radial-gradient(circle 1.5px at 18% 50%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 10% 32%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 17% 66%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 24% 44%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 31% 58%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 38% 36%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 45% 62%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 52% 48%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 59% 34%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 66% 60%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 73% 42%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 80% 56%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 87% 38%,#ffffffb8,transparent 100%),radial-gradient(circle 1.5px at 94% 54%,#ffffffb8,transparent 100%);background-size:25% 100%;background-repeat:repeat-x;content:'';filter:drop-shadow(0 0 2px #ffffff57);animation:dsh-reasoning-flow 1.9s linear infinite}
.dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__fill::after{position:absolute;top:0;right:auto;bottom:0;left:-40%;width:35%;border-radius:999px;background:linear-gradient(105deg,transparent 0%,rgb(255 255 255 / 0%) 20%,rgb(255 255 255 / 84%) 50%,rgb(221 200 255 / 32%) 80%,transparent 100%);content:'';filter:blur(2px);opacity:1;animation:dsh-reasoning-max-sweep .95s linear infinite}
.dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__thumb{border-color:#cdb2ef;box-shadow:0 0 0 3px rgb(168 85 247 / 14%),0 0 16px rgb(168 85 247 / 58%),0 2px 6px rgb(20 30 50 / 12%);animation:dsh-reasoning-max-pulse 1.35s ease-in-out infinite}
.dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__tick[data-active='true']{background:#c29af6}
.dsh-reasoning-effort__single{padding:8px 0 2px;color:#8f8f8f;font-size:14px;line-height:20px}
@keyframes dsh-reasoning-max-flash{0%,100%{filter:saturate(1) brightness(1);box-shadow:inset 0 1px 1px rgb(255 255 255 / 14%),0 0 6px rgb(168 85 247 / 20%)}50%{filter:saturate(1.45) brightness(1.16);box-shadow:inset 0 1px 1px rgb(255 255 255 / 24%),0 0 16px rgb(168 85 247 / 72%),0 0 30px rgb(192 132 252 / 28%)}}
@keyframes dsh-reasoning-max-sweep{0%{transform:translateX(-130%);opacity:0}25%{opacity:.85}75%{opacity:.85}100%{transform:translateX(520%);opacity:0}}
@keyframes dsh-reasoning-max-pulse{0%,100%{filter:saturate(1);transform:translate(-50%,-50%) scale(1)}50%{filter:saturate(1.35) brightness(1.12);transform:translate(-50%,-50%) scale(1.1)}}
@keyframes dsh-reasoning-flow{from{transform:translateX(0)}to{transform:translateX(-25%)}}
/* 两层显隐：main = 顶栏 + 滑道；models = 折叠列表 */
.dsh-reasoning-model__popover[data-view='main'] .dsh-reasoning-model__models{display:none}
.dsh-reasoning-model__popover[data-view='models'] .dsh-reasoning-model__topbar,.dsh-reasoning-model__popover[data-view='models'] .dsh-reasoning-effort{display:none}
/* 顶栏 */
.dsh-reasoning-model__topbar{display:flex;align-items:center;gap:6px;padding:0}
.dsh-reasoning-model__fast{display:inline-flex;flex:none;width:26px;height:26px;align-items:center;justify-content:center;padding:0;border:0;border-radius:8px;background:transparent;color:#8d8e8f;font:inherit;cursor:pointer;transition:color .2s ease,background-color .12s ease}
.dsh-reasoning-model__fast:not(:disabled):hover{color:var(--dsw-alias-button-primary-hover, #db2777)}
.dsh-reasoning-model__fast:focus-visible{outline:2px solid #0169cc;outline-offset:-2px}
.dsh-reasoning-model__fast[data-active='true']{color:var(--dsw-alias-brand-primary, #f472b6);animation:dsh-bolt-breathe 2.4s ease-in-out infinite}
.dsh-reasoning-model__fast:disabled,.dsh-reasoning-model__fast[data-disabled='true']{color:#c4c8cf;cursor:default}
body[data-ds-dark-theme] .dsh-reasoning-model__fast{color:#4a4d53}
body[data-ds-dark-theme] .dsh-reasoning-model__fast[data-active='true']{color:var(--dsw-alias-brand-primary, #f9a8d4)}
body[data-ds-dark-theme] .dsh-reasoning-model__fast[data-disabled='true']{color:#3a3d43}
.dsh-reasoning-model__card{display:flex;flex:1;min-width:0;flex-direction:column;align-items:center;gap:1px;padding:2px 8px;border:0;border-radius:6px;background:transparent;color:#1a1c1f;font:inherit;cursor:pointer;transition:background-color .12s ease}
.dsh-reasoning-model__card:hover:not(:disabled){background:#f1f1f2}
.dsh-reasoning-model__card:focus-visible{outline:2px solid #0169cc;outline-offset:-2px}
.dsh-reasoning-model__card:disabled{cursor:wait;opacity:.7}
body[data-ds-dark-theme] .dsh-reasoning-model__card{background:transparent;color:#f2f2f2}
body[data-ds-dark-theme] .dsh-reasoning-model__card:hover:not(:disabled){background:rgb(255 255 255 / 10%)}
.dsh-reasoning-model__card-name{max-width:100%;overflow:hidden;font-size:16px;font-weight:600;line-height:22px;text-overflow:ellipsis;white-space:nowrap}
.dsh-reasoning-model__card-provider{max-width:100%;overflow:hidden;font-size:12px;line-height:16px;color:#656668;text-overflow:ellipsis;white-space:nowrap}
body[data-ds-dark-theme] .dsh-reasoning-model__card-provider{color:#afafaf}
/* 切回默认（点一下 = 切到官方 Flash + High；成功与否都不额外打勾，模型显示本身就是结果） */
.dsh-reasoning-model__switch-default{display:inline-flex;flex:none;width:26px;height:26px;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:#8d8e8f;font:inherit;font-size:14px;cursor:pointer;transition:background-color .12s ease,color .12s ease}
.dsh-reasoning-model__switch-default:hover:not(:disabled){background:rgb(26 28 31 / 6%);color:#1a1c1f}
.dsh-reasoning-model__switch-default:focus-visible{outline:2px solid #0169cc;outline-offset:-2px}
.dsh-reasoning-model__switch-default:disabled{cursor:wait;opacity:.6}
body[data-ds-dark-theme] .dsh-reasoning-model__switch-default:hover:not(:disabled){background:rgb(255 255 255 / 8%);color:#f2f2f2}
.dsh-reasoning-model__switch-icon{width:16px;height:16px}
@media (max-width:760px){.dsh-reasoning-model__shell{max-width:calc(100vw - 90px)}.dsh-reasoning-model__popover{right:-6px;width:min(254px,calc(100vw - 20px))}}
@media (prefers-reduced-motion:reduce){.dsh-reasoning-model__chevron,.dsh-reasoning-effort__fill,.dsh-reasoning-effort__thumb,.dsh-reasoning-model__popover{transition:none;animation:none}.dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__fill,.dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__fill::before,.dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__fill::after,.dsh-reasoning-effort[data-max='true'] .dsh-reasoning-effort__thumb{animation:none}}
`;

		function installReasoningStyles() {
			if (typeof document === "undefined") return () => {};
			if (document.getElementById(STYLE_ID) !== null) return () => {};
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.dataset.plugin = PLUGIN_ID;
			style.dataset.pluginCss = PLUGIN_ID + "/reasoning-model.css";
			style.textContent = CSS;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}

		/* ════════════════════════════════════════════════════════════════
		   8. 挂载
		   注意依赖声明里 remote / remote.session 不能少：
		   conversation.input.model 是 session 作用域的座位，DSH 要靠这条
		   remote 会话通道把座位绑定到具体会话。v0.3.0 第一次重写时把它们
		   当成「设置页专用」一起删了，结果座位注册成功却一直 inactive
		   （输入框回退成 DSH 原生选择器）。
		   真正用不到的只有 remote.settings（设置页已删），不声明。
		   ════════════════════════════════════════════════════════════════ */
		const NS = "reasoning-effort";
		const inject = ["slots", "locale", "modelDirectories", "sessions", "remote", "remote.session"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-reasoning-effort: dictionaries");
			ctx.effect(() => installReasoningStyles(), "dsh-reasoning-effort: styles");
			const t = ctx.locale.bind(NS);

			ctx.inject(["slots", "modelDirectories"], (scope) => {
				const models = scope.modelDirectories;
				scope.slots.inject("conversation.input.model", () => scope.slots.register({
					name: "conversation.input.model",
					priority: -1,
					label: () => t("label"),
					locale: NS,
					inject: (sessionId) => {
						const directory = models.directoryFor(sessionId);
						return {
							directory: directory.store,
							load: () => {
								directory.load().catch(() => {});
							},
							select: (selection) => directory.select(selection)
						};
					}
				}, ReasoningBar));
			});

			/* 加速档配置是插件自有数据，异步从 host 路由拉一次。 */
			loadTurboConfig();
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.commitSwitch = commitSwitch;
		return module.exports;
	}
});
