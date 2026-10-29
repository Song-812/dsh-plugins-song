/**
 * 思考档位 · 真体检（可移植，不依赖本机写死路径 / check-kit）。
 * 检查：必要文件、语法、settings 归一化、commitSwitch 流程。
 * 用法：node check.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const notes = [];

function pass(id, detail) {
	notes.push({ id, status: "pass", detail });
}
function fail(id, detail) {
	notes.push({ id, status: "fail", detail });
}

function checkFiles() {
	const required = [
		"lib/client.js",
		"lib/index.js",
		"lib/settings.js",
		"cordis.patch.yml",
		"package.json",
		"test/switch-flow.test.mjs",
		"locale/zh.json",
		"locale/en.json",
	];
	for (const rel of required) {
		const full = path.join(pluginDir, rel);
		if (fs.existsSync(full) && fs.statSync(full).isFile()) {
			pass(`file:${rel}`, "存在");
		} else {
			fail(`file:${rel}`, `缺失：${full}`);
		}
	}
	const stray = path.join(pluginDir, "connect-codex.ps1");
	if (fs.existsSync(stray)) {
		fail("stray:connect-codex.ps1", "插件目录不应再放无关 Codex 脚本（应移走或删除）");
	} else {
		pass("stray:connect-codex.ps1", "已不在插件目录");
	}
}

function checkSyntax() {
	for (const rel of ["lib/index.js", "lib/client.js", "lib/settings.js", "check.mjs", "test/switch-flow.test.mjs"]) {
		const full = path.join(pluginDir, rel);
		const r = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
		if (r.status === 0) pass(`syntax:${rel}`, "node --check 通过");
		else fail(`syntax:${rel}`, (r.stderr || r.stdout || "check failed").trim());
	}
}

async function checkSettings() {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-re-check-"));
	const prev = process.env.DSH_HOME;
	process.env.DSH_HOME = tmp;
	try {
		const mod = await import(pathToFileURL(path.join(pluginDir, "lib/settings.js")).href + `?t=${Date.now()}`);
		const { DEFAULTS, loadSettings, saveSettings } = mod;
		const a = loadSettings();
		assert.equal(a.turboBaseModelId, DEFAULTS.turboBaseModelId);
		assert.equal(a.boltOnFlash, false);
		assert.notEqual(a.hiddenModels, DEFAULTS.hiddenModels);
		assert.deepEqual(a.hiddenModels, [...DEFAULTS.hiddenModels]);
		a.hiddenModels.push("x");
		assert.deepEqual(DEFAULTS.hiddenModels, ["mimo-v2.6-pro-ultraspeed"]);

		const b = saveSettings({ boltOnFlash: true, hiddenModels: [] });
		assert.equal(b.boltOnFlash, true);
		assert.deepEqual(b.hiddenModels, []);
		assert.equal(b.turboModelId, DEFAULTS.turboModelId);

		const c = saveSettings({ turboBaseModelId: "  hi  ", boltOnFlash: "yes" });
		assert.equal(c.turboBaseModelId, "hi");
		assert.equal(c.boltOnFlash, false);

		fs.writeFileSync(path.join(tmp, "reasoning-effort", "settings.json"), "{not-json", "utf8");
		const d = loadSettings();
		assert.equal(d.turboBaseModelId, DEFAULTS.turboBaseModelId);

		pass("settings:normalize", "缺省/空 hiddenModels/布尔/trim/坏 JSON/合并/DEFAULTS 隔离 全过");
	} catch (error) {
		fail("settings:normalize", String(error && error.stack || error));
	} finally {
		if (prev === undefined) delete process.env.DSH_HOME;
		else process.env.DSH_HOME = prev;
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

function checkUnitTests() {
	const r = spawnSync(process.execPath, ["--test", path.join(pluginDir, "test/switch-flow.test.mjs")], {
		encoding: "utf8",
		cwd: pluginDir,
	});
	if (r.status === 0) pass("test:switch-flow", "3 条流程测试通过");
	else fail("test:switch-flow", (r.stderr || r.stdout || "test failed").trim().slice(0, 800));
}

function checkClientGuards() {
	const src = fs.readFileSync(path.join(pluginDir, "lib/client.js"), "utf8");
	const expects = [
		["closingRef", "Esc 双触发闸门"],
		['"aria-label": label || "Reasoning"', "滑条 aria 走 locale"],
		["dsh-reasoning-model__bolt-btn", "胶囊闪电独立按钮"],
		["Math.max(0, efforts.length - 1)", "滑条 lastIndex 防御"],
		["event.stopPropagation()", "Esc stopPropagation"],
	];
	for (const [needle, note] of expects) {
		if (src.includes(needle)) pass(`guard:${note}`, "源码含 " + needle.slice(0, 40));
		else fail(`guard:${note}`, "源码缺少：" + needle);
	}
	const host = fs.readFileSync(path.join(pluginDir, "lib/index.js"), "utf8");
	if (host.includes("function serialize") && host.includes("writeChain")) {
		pass("guard:POST写锁", "index.js 含 serialize/writeChain");
	} else {
		fail("guard:POST写锁", "index.js 缺少写锁");
	}
	if (host.includes("settingsFile:")) {
		fail("guard:路径不外泄", "响应仍带 settingsFile 绝对路径");
	} else {
		pass("guard:路径不外泄", "响应不再带 settingsFile");
	}
}

export async function run() {
	checkFiles();
	checkSyntax();
	checkClientGuards();
	await checkSettings();
	checkUnitTests();
	const failed = notes.filter((n) => n.status === "fail");
	return {
		label: "思考档位",
		packageName: "dsh-reasoning-effort",
		pluginDir,
		ok: failed.length === 0,
		failed: failed.length,
		passed: notes.length - failed.length,
		notes,
	};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const result = await run();
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	process.exit(result.ok ? 0 : 1);
}
