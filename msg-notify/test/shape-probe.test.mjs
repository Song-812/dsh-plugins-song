// 消息提示插件 —— 客户端服务形状探测测试（node:test，无第三方依赖）
//
// 背景：「完成/出错/卡住」检测依赖 DSH 客户端内部服务（sessions.list /
// sessions.binding().eventSource / lastAgentError / uiSession.sessionStatus）。
// DSH 升级一旦改了形状，旧代码全部 try/catch 静默兜底，检测悄悄失灵也无迹可查。
// 修法：把形状探测抽成纯函数；探测失败时按文案 console.warn 一次（同文案不刷屏），
// 并点名是哪个服务形状不符。
//
// 运行：node --test "test/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const SOURCE = readFileSync(CLIENT_PATH, 'utf8');

/** 把 lib/client.js 加载进假世界，返回插件对象和被记录下来的 console.warn。 */
function loadBundle() {
  const warns = [];
  const storage = new Map();
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const window = {};
  const document = {
    createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
    head: { appendChild() {} },
  };
  const fakeConsole = {
    warn: (message) => warns.push(String(message)),
    log() {},
    error() {},
  };
  const captured = {};
  window.__ModuleLoader__ = { load: (definition) => { captured.definition = definition; } };
  // eslint-disable-next-line no-new-func
  const run = new Function('window', 'localStorage', 'document', 'console', 'require', SOURCE);
  run(window, localStorage, document, fakeConsole, (name) => {
    if (name === 'react') return { createElement: () => null };
    throw new Error('unexpected require: ' + name);
  });
  assert.ok(captured.definition, '插件没有通过 __ModuleLoader__ 注册');
  const plugin = captured.definition.factory((name) => {
    if (name === 'react') return { createElement: () => null };
    throw new Error('unexpected require: ' + name);
  });
  return { plugin, warns };
}

/** 一个足以跑完 apply() 的极简 ctx：services 缺什么就 get 到什么。 */
function makeCtx(services) {
  const scope = { get: (name) => services[name], effect: (fn) => fn() };
  return {
    effect: (fn) => {
      try {
        return fn();
      } catch (e) {
        return () => {};
      }
    },
    inject: (_deps, callback) => callback(scope),
    get: (name) => services[name],
  };
}

test('形状探测：完好的服务形状返回空清单', () => {
  const { plugin } = loadBundle();
  const { sessionShapeIssues, statusShapeIssues } = plugin.__test__ ?? {};
  assert.equal(typeof sessionShapeIssues, 'function', '应导出 sessionShapeIssues 纯函数');
  assert.equal(typeof statusShapeIssues, 'function', '应导出 statusShapeIssues 纯函数');

  const sessions = {
    list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} },
    binding: () => ({ session: { getSnapshot: () => ({ lastAgentError: null }) } }),
  };
  assert.deepEqual(sessionShapeIssues(sessions), []);

  const uiSession = {
    sessionStatus: { getSnapshot: () => new Map(), subscribe: () => () => {} },
  };
  assert.deepEqual(statusShapeIssues(uiSession), []);
});

test('形状探测：残缺的形状逐条点名不符的服务', () => {
  const { plugin } = loadBundle();
  const { sessionShapeIssues, statusShapeIssues } = plugin.__test__ ?? {};

  const sessionIssues = sessionShapeIssues({ list: { getSnapshot: () => ({ byId: {} }) } });
  assert.ok(
    sessionIssues.some((issue) => issue.includes('sessions.list.subscribe')),
    `应点名 sessions.list.subscribe 缺失，实际：${JSON.stringify(sessionIssues)}`,
  );
  assert.ok(
    sessionIssues.some((issue) => issue.includes('sessions.binding')),
    `应点名 sessions.binding 不是函数，实际：${JSON.stringify(sessionIssues)}`,
  );

  const brokenList = sessionShapeIssues({ list: { subscribe: () => {} }, binding: () => ({}) });
  assert.ok(
    brokenList.some((issue) => issue.includes('sessions.list.getSnapshot')),
    `应点名 sessions.list.getSnapshot 缺失，实际：${JSON.stringify(brokenList)}`,
  );

  const statusIssues = statusShapeIssues({});
  assert.ok(
    statusIssues.some((issue) => issue.includes('uiSession.sessionStatus')),
    `应点名 uiSession.sessionStatus 缺失，实际：${JSON.stringify(statusIssues)}`,
  );

  const halfBroken = statusShapeIssues({ sessionStatus: { getSnapshot: () => new Map() } });
  assert.ok(
    halfBroken.some((issue) => issue.includes('uiSession.sessionStatus.subscribe')),
    `应点名 uiSession.sessionStatus.subscribe 缺失，实际：${JSON.stringify(halfBroken)}`,
  );

  assert.deepEqual(sessionShapeIssues(null), ['sessions 服务缺失']);
  assert.deepEqual(statusShapeIssues(undefined), ['uiSession 服务缺失']);
});

test('形状警告：同一文案只警告一次；不同文案各警告一次', () => {
  const { plugin, warns } = loadBundle();
  const { warnShapeOnce } = plugin.__test__ ?? {};
  assert.equal(typeof warnShapeOnce, 'function', '应导出 warnShapeOnce');

  warnShapeOnce('第一条：sessions.list 形状不符');
  warnShapeOnce('第二条：uiSession.sessionStatus 形状不符');
  warnShapeOnce('第一条：sessions.list 形状不符'); // 重复文案不刷屏
  assert.equal(warns.length, 2, `不同文案应各一条，实际警告：${JSON.stringify(warns)}`);
  assert.ok(warns[0].includes('sessions.list'), '警告应带明确说明');
  assert.ok(warns[1].includes('uiSession.sessionStatus'), '第二条也应留下');

  // 换一个全新的插件实例（模拟刷新页面）才会再警告。
  const second = loadBundle();
  second.plugin.__test__.warnShapeOnce('新实例的第一条');
  assert.equal(second.warns.length, 1, '新实例应重新允许警告一次');
});

test('接线：apply 遇到残缺服务会点名警告，且重复 apply 不刷屏', () => {
  const { plugin, warns } = loadBundle();
  // sessions 缺 list.getSnapshot/subscribe/binding；uiSession 缺 sessionStatus。
  plugin.apply(makeCtx({}));
  const afterFirst = warns.length;
  assert.ok(afterFirst >= 1, 'apply 后应至少警告一次');
  assert.ok(
    warns.some((w) => w.includes('sessions')),
    `应点名不符的服务，实际：${JSON.stringify(warns)}`,
  );
  assert.ok(
    warns.some((w) => w.includes('uiSession')),
    `sessions 与 uiSession 残缺时应都能警告，实际：${JSON.stringify(warns)}`,
  );
  plugin.apply(makeCtx({}));
  assert.equal(warns.length, afterFirst, `重复 apply 不该再刷屏，实际：${JSON.stringify(warns)}`);
});
