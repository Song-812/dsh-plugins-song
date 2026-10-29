/**
 * 「切回默认」流程的行为测试。
 *
 * 直接加载 client 半边的打包文件，只取它导出的流程函数，不渲染界面：
 * 成功与否都不给额外提示——模型显示自己就是结果。失败必须静默且不抛错，
 * 忙碌态无论如何都要复位。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(here, "..", "lib", "client.js");
const SELECTION = {
	provider: "deepseek-account",
	model: "deepseek-flash",
	reasoningEffort: "high"
};

function loadBundle() {
	let captured;
	globalThis.window = {
		__ModuleLoader__: {
			load: (definition) => {
				captured = definition;
			}
		}
	};
	new Function("window", fs.readFileSync(bundlePath, "utf8"))(globalThis.window);
	const stubs = {
		react: {
			useState: (initial) => [initial, () => {}],
			useEffect: () => {},
			useMemo: (factory) => factory(),
			useRef: (initial) => ({ current: initial })
		},
		"react/jsx-runtime": { jsx: () => null, jsxs: () => null, Fragment: "Fragment" }
	};
	return captured.factory((id) => stubs[id]);
}

function recorder() {
	const calls = [];
	return {
		calls,
		handlers: {
			begin: () => calls.push("begin"),
			settle: () => calls.push("settle")
		}
	};
}

test("切换成功时：开始 → 提交选择 → 收尾，不额外打勾", async () => {
	const { commitSwitch } = loadBundle();
	assert.equal(typeof commitSwitch, "function");
	const { calls, handlers } = recorder();

	await commitSwitch(
		async (selection) => {
			assert.deepEqual(selection, SELECTION);
			calls.push("select");
		},
		SELECTION,
		handlers
	);

	assert.deepEqual(calls, ["begin", "select", "settle"]);
});

test("切换失败时：结果与成功一样静默，不抛错", async () => {
	const { commitSwitch } = loadBundle();
	const { calls, handlers } = recorder();

	await commitSwitch(
		async () => {
			calls.push("select");
			throw new Error("provider rejected the switch");
		},
		SELECTION,
		handlers
	);

	assert.deepEqual(calls, ["begin", "select", "settle"]);
});

test("失败后忙碌态一定会复位，不会卡住按钮", async () => {
	const { commitSwitch } = loadBundle();
	let busy = false;
	const { handlers } = recorder();

	await commitSwitch(
		async () => {
			throw new Error("network down");
		},
		SELECTION,
		{
			...handlers,
			begin: () => {
				busy = true;
			},
			settle: () => {
				busy = false;
			}
		}
	);

	assert.equal(busy, false);
});
