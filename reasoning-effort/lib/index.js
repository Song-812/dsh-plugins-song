/**
 * dsh-reasoning-effort · host 半边（v0.3.0 · 2026-10-26 重写）
 *
 * 只做一件事：给前台（浏览器半边）开一个读写本地配置文件的 HTTP 出口。
 * 配置内容存在 $DSH_HOME/reasoning-effort/settings.json —— 纯文本，可直接手改：
 *   turboBaseModelId  普通版模型 id（闪电从它切出去、再切回来）
 *   turboModelId      加速版模型 id（闪电切进去的那个）
 *   boltOnFlash       flash 这类没有加速版的模型上，闪电能不能点
 *   hiddenModels      从输入框模型列表里藏掉的模型 id
 *
 * ── 本次重写删掉的东西（重要）───────────────────────────────────────
 * 旧版启动时会给 llm-pi-ai 里「没写 reasoningEfforts」的模型补上
 * {low, medium, high, xhigh, max} 五档。查证结论：
 *   1. DSH 自己就会按模型的官方目录（pi-ai 的 thinkingLevelMap）决定档位：
 *      没写 reasoningEfforts 时，官方条目的 reasoning/thinkingLevelMap 会被
 *      原样继承（见 dsh-llm-pi-ai 的 resolveModelReasoning）；
 *      只有官方目录里压根没有的模型，才拿不到档位。
 *   2. 一旦有人手写 reasoningEfforts，就会**覆盖**官方映射（不是合并）。
 *      也就是说旧版那段"自动补五档"其实是反着干的：把官方的两档撑成五档。
 *   3. 而且翻遍 ~/.dsh 的配置落盘文件，那段补丁一次都没真正写进去过
 *      （启动时机不对，异常被 logger.warn 吞掉）。
 * 所以整段删除。现在档位完全交回 DSH 按官方走，插件不再碰 llm-pi-ai 设置。
 *
 * 连带的简化：不再依赖 @deepseek-ai/schemastery，也不再导出 Config
 * （插件没有任何可配字段了，配置全在 settings.json 里）。
 */
import { loadSettings, saveSettings } from "./settings.js";

const ROUTE = "/api/reasoning-effort";
const MAX_BODY_BYTES = 8 * 1024;

function jsonResponse(code, payload) {
	return new Response(JSON.stringify(payload), {
		status: code,
		headers: { "content-type": "application/json; charset=utf-8" }
	});
}

async function readJson(request) {
	const text = await request.text();
	if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new Error("请求体过大");
	return JSON.parse(text);
}

/** POST 读写串行：避免两路 load→merge→写交错丢字段。 */
let writeChain = Promise.resolve();
function serialize(task) {
	const result = writeChain.then(task, task);
	writeChain = result.then(() => {}, () => {});
	return result;
}

async function handle(request) {
	if (request.method === "GET") {
		/* 不把本机绝对路径塞进浏览器响应 */
		return jsonResponse(200, { ok: true, settings: loadSettings() });
	}
	if (request.method !== "POST") return jsonResponse(405, { ok: false, error: "只支持 GET 与 POST" });

	let body;
	try {
		body = await readJson(request);
	} catch (error) {
		return jsonResponse(400, { ok: false, error: String((error && error.message) || error) });
	}
	if (typeof body !== "object" || body === null) {
		return jsonResponse(400, { ok: false, error: "请求体必须是 JSON 对象" });
	}
	try {
		const settings = await serialize(() => saveSettings(body.settings ?? body));
		return jsonResponse(200, { ok: true, settings });
	} catch (error) {
		return jsonResponse(500, { ok: false, error: String((error && error.message) || error) });
	}
}

const name = "reasoning-effort";
/** 不再依赖 settings 服务：插件不读也不写 DSH 的配置层。 */
const inject = [];

function apply(ctx) {
	/* 路由按需注册：等 connection 服务就绪再挂，和其他插件同一套做法。 */
	ctx.inject(["connection"], (host) => {
		host.connection.fetch.register({
			path: ROUTE,
			methods: ["GET", "POST"],
			requestBody: "buffered",
			fetch: (request) => handle(request)
		});
	});
}

export { apply, inject, name };
