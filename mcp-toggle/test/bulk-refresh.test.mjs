/**
 * 回归：一键切换（组旋钮 bulkSet）的两个问题——
 *  1) 刷新风暴：setEnabled 成功路径每行 void refresh()，bulk 时 N 行 N 刷；
 *  2) 完成提示被抹掉：先 setNotice 再 void refresh()，而 refresh 开头同步
 *     setNotice(undefined)，「已切换 N 个」几乎不可见。
 * 期望：bulk 期间跳过行级刷新、循环结束统一刷一次；提示写在刷新之后，
 * 作为最后一次 notice 写入留存。
 *
 * 复用 client-smoke.mjs 的前缀（假模块加载器 + 钩子桩 + 渲染器），断言跑在真实代码上。
 *
 * Run: node test\bulk-refresh.test.mjs   (from the plugin folder)
 */
import { readFile } from 'node:fs/promises'

let harness = await readFile(new URL('./client-smoke.mjs', import.meta.url), 'utf8')
harness = harness.slice(0, harness.indexOf('const tree = render()'))
harness = harness.replace("new URL('../lib/client.js', import.meta.url)", 'new URL(' + JSON.stringify(new URL('../lib/client.js', import.meta.url).href) + ')')

harness += String.raw`

// ---- 场景：两行都关着，点组旋钮一键全开 ----------------------------------------
const stormRows = [
  { id: 'mcp-x', entryId: 'entry-x', label: 'X 服务器', endpoint: 'http://x/mcp', enabled: false, fiberPhase: null, toolCount: 0 },
  { id: 'mcp-y', entryId: 'entry-y', label: 'Y 服务器', endpoint: 'http://y/mcp', enabled: false, fiberPhase: null, toolCount: 0 },
];
const stormEnabled = new Map([['entry-x', false], ['entry-y', false]]);
const stormCalls = [];
ctx.remote = {
  pluginManager: {
    listPlugins: async () => ({
      ok: true,
      value: stormRows.map((row) => ({
        entryId: row.entryId,
        patchId: row.id,
        moduleName: '@deepseek-ai/dsh-mcp-client',
        enabled: stormEnabled.get(row.entryId),
        fiberPhase: null,
      })),
    }),
    setPluginEnabled: async (entryId, enabled) => {
      stormCalls.push({ entryId, enabled });
      stormEnabled.set(entryId, enabled);
      return { ok: true, value: { application: 'applied' } };
    },
  },
};

const stormTree = render({ servers: stormRows, prefs: { titles: {}, order: [], collapsed: false, groupTitle: '' } });
const stormKnob = collect(stormTree, (node) => node.props.role === 'switch' && node.props.className === undefined)[0];
stormKnob.props.onClick();
for (let step = 0; step < 300; step += 1) {
  await new Promise((resolve) => setImmediate(resolve));
  flushTimers();
}

check('两行都被切换（批量确实跑完了）',
  stormCalls.length === 2 && stormCalls.every((call) => call.enabled === true),
  JSON.stringify(stormCalls));

// readDescriptors 是唯一的 GET（savePrefs 走 POST），所以 GET 次数＝刷新次数。
const refreshGets = fetchCalls.filter((call) => call.url === '/api/mcp-toggle' && (call.options === undefined || call.options.method === undefined));
check('批量全程只统一刷新一次（不再一行一刷）',
  refreshGets.length === 1,
  '刷新次数=' + refreshGets.length);

// notice 的写入索引是 4（去掉 patchFiles 状态之后）；最后一次写入必须是「已切换 2 个」。
const noticeWrites = stateLog.filter((entry) => entry.index === 4);
const lastNotice = noticeWrites.length === 0 ? undefined : noticeWrites[noticeWrites.length - 1].value;
check('完成提示是最后一次写入（没被刷新同步清掉）',
  lastNotice !== undefined && lastNotice.kind === 'ok' && lastNotice.text.includes('已切换 2 个'),
  JSON.stringify(lastNotice));

// ---- 单行开关不受抑制：单独切一行仍然即时刷新 ----------------------------------
const singleEnabled = new Map([['entry-x', false]]);
const singleCalls = [];
ctx.remote = {
  pluginManager: {
    listPlugins: async () => ({
      ok: true,
      value: stormRows.map((row) => ({
        entryId: row.entryId,
        patchId: row.id,
        moduleName: '@deepseek-ai/dsh-mcp-client',
        enabled: row.entryId === 'entry-x' ? singleEnabled.get('entry-x') : false,
        fiberPhase: null,
      })),
    }),
    setPluginEnabled: async (entryId, enabled) => {
      singleCalls.push({ entryId, enabled });
      singleEnabled.set(entryId, enabled);
      return { ok: true, value: { application: 'applied' } };
    },
  },
};
const singleTree = render({ servers: stormRows, prefs: { titles: {}, order: [], collapsed: false, groupTitle: '' } });
const singleSwitch = collect(collect(singleTree, (node) => node.props.className === 'mct-card')[0], (node) => node.props.role === 'switch')[0];
// 展开后的 LocalSwitch 是一个 button：点击会按当前 checked 反转（当前为关 → 开）。
singleSwitch.props.onClick();
for (let step = 0; step < 300; step += 1) {
  await new Promise((resolve) => setImmediate(resolve));
  flushTimers();
}
const singleGets = fetchCalls.filter((call) => call.url === '/api/mcp-toggle' && (call.options === undefined || call.options.method === undefined));
check('单行开关仍然各自刷新一次（抑制只作用于批量）',
  singleCalls.length === 1 && singleGets.length === 1,
  '切换=' + singleCalls.length + ' 刷新=' + singleGets.length);

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
`

await import('data:text/javascript;base64,' + Buffer.from(harness).toString('base64'))
