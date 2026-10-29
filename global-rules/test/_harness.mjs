/**
 * 测试专用小工具：极简 React 渲染器 + 组件树查询。
 *
 * 只在 test/ 里用，生产代码不引用。目的：把 lib/client.js 的界面半边在
 * Node 里真跑一遍，断言"渲染出来的东西"，而不是断言源码里有没有某个字符串。
 *
 * 支持：useState / useEffect（带依赖比较与 cleanup）/ useCallback / useRef / useMemo。
 * 不支持：并发、批处理、key 复用 —— 够测这个单页面插件就行。
 */

/** React.createElement 的极简版：子节点拍平，空值丢掉。 */
export function createElement(type, props, ...children) {
	const flat = [];
	const push = (child) => {
		if (Array.isArray(child)) {
			child.forEach(push);
			return;
		}
		if (child === null || child === undefined || child === false || child === true) return;
		flat.push(child);
	};
	children.forEach(push);
	return { type, props: { ...(props || {}), children: flat } };
}

const sameDeps = (a, b) => {
	if (!a || !b || a.length !== b.length) return false;
	return a.every((item, i) => Object.is(item, b[i]));
};

/** 建一个只服务单个组件的渲染器；`react` 就是喂给工厂函数的 react 替身。 */
export function createRenderer(initialComponent) {
	const cells = [];
	const effectSlots = [];
	let index = 0;
	let queue = [];
	let props;
	let tree = null;
	let component = initialComponent;

	const react = {
		createElement,
		useState(initial) {
			const slot = index++;
			if (!(slot in cells)) cells[slot] = typeof initial === 'function' ? initial() : initial;
			const set = (next) => {
				cells[slot] = typeof next === 'function' ? next(cells[slot]) : next;
			};
			return [cells[slot], set];
		},
		useEffect(fn, deps) {
			queue.push({ slot: index++, fn, deps });
		},
		useCallback(fn) {
			index++;
			return fn;
		},
		useRef(initial) {
			const slot = index++;
			if (!(slot in cells)) cells[slot] = { current: initial };
			return cells[slot];
		},
		useMemo(fn) {
			index++;
			return fn();
		},
	};

	function render(nextProps) {
		if (nextProps !== undefined) props = nextProps;
		if (typeof component !== 'function') throw new Error('渲染器还没挂组件');
		index = 0;
		queue = [];
		tree = component(props);
		for (const item of queue) {
			const prev = effectSlots[item.slot];
			if (prev && sameDeps(prev.deps, item.deps)) continue;
			if (prev && typeof prev.cleanup === 'function') prev.cleanup();
			const cleanup = item.fn();
			effectSlots[item.slot] = { deps: item.deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
		}
		return tree;
	}

	return {
		render,
		react,
		mount(nextComponent) {
			component = nextComponent;
		},
		/** 模拟"关掉设置页再打开"：状态与副作用全部清零。 */
		reset() {
			cells.length = 0;
			effectSlots.length = 0;
			index = 0;
			queue = [];
			tree = null;
		},
		get tree() {
			return tree;
		},
	};
}

/** 深度遍历组件树。 */
export function walk(node, visit) {
	if (!node || typeof node !== 'object') return;
	visit(node);
	for (const child of node.props?.children ?? []) walk(child, visit);
}

/** 找出所有满足条件的节点。 */
export function findAll(tree, predicate) {
	const out = [];
	walk(tree, (node) => {
		if (predicate(node)) out.push(node);
	});
	return out;
}

/** 一个节点（含子孙）的可见文字。 */
export function textOf(node) {
	if (typeof node === 'string') return node;
	if (typeof node === 'number') return String(node);
	if (!node || typeof node !== 'object') return '';
	return (node.props?.children ?? []).map(textOf).join('');
}

/** 按 className 找元素（className 可以是空格分隔的多类名）。 */
export function byClass(tree, className) {
	return findAll(tree, (node) => {
		const value = node.props?.className;
		return typeof value === 'string' && value.split(/\s+/).includes(className);
	});
}

/** 按可见文字找按钮。 */
export function buttonByText(tree, label) {
	return findAll(tree, (node) => node.type === 'button' && textOf(node) === label)[0];
}

/** 整棵树的可见文字（断言"界面上不出现某句话"用）。 */
export function allText(tree) {
	return textOf(tree);
}

/** 等异步链（fetch → then → setState）跑完；不用真定时器，避免拖慢测试。 */
export async function settle() {
	for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

/**
 * 把组件里的长时间定时器（恢复默认的 4 秒自动收回）截下来，方便测试直接触发；
 * 1 秒以内的定时器仍然走真定时器。
 */
export function spyLongTimers() {
	const realSetTimeout = globalThis.setTimeout;
	const realClearTimeout = globalThis.clearTimeout;
	const pending = [];
	globalThis.setTimeout = (fn, ms, ...rest) => {
		if (typeof ms === 'number' && ms >= 1000) {
			pending.push({ fn, ms, id: 9000 + pending.length });
			return 9000 + pending.length - 1;
		}
		return realSetTimeout(fn, ms, ...rest);
	};
	globalThis.clearTimeout = (handle) => {
		const hit = pending.findIndex((item) => item.id === handle);
		if (hit >= 0) {
			pending.splice(hit, 1);
			return;
		}
		realClearTimeout(handle);
	};
	return {
		pending,
		fire(index = 0) {
			const item = pending[index];
			if (!item) throw new Error('没有截到长定时器');
			item.fn();
		},
		restore() {
			globalThis.setTimeout = realSetTimeout;
			globalThis.clearTimeout = realClearTimeout;
		},
	};
}
