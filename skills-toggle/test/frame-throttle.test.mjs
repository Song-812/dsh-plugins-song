// / 菜单隐藏器的节流核心必须是可离线断言的纯函数：MutationObserver 的回调可能
// 一帧触发几十次，每次都同步跑全文档 querySelectorAll 太贵 —— 同帧必须合并成
// 一次运行（rAF 合并），取消后待跑的帧也要能撤销。
// 运行：node --test test\frame-throttle.test.mjs
import { readFile } from 'node:fs/promises'

let harness = await readFile(new URL('./client-smoke.mjs', import.meta.url), 'utf8')
harness = harness.slice(0, harness.indexOf('const tree = render()'))
harness = harness.replace("new URL('../lib/client.js', import.meta.url)", 'new URL(' + JSON.stringify(new URL('../lib/client.js', import.meta.url).href) + ')')
harness += `
const throttleModule = plugin.__test__ !== undefined && typeof plugin.__test__.createFrameThrottle === 'function'
  ? plugin.__test__.createFrameThrottle
  : undefined;
check('createFrameThrottle 已导出为可测纯函数', throttleModule !== undefined,
  throttleModule === undefined ? 'plugin.__test__.createFrameThrottle 不存在' : '');

if (throttleModule !== undefined) {
  // 假帧调度器：request 返回句柄、cancel 撤销、flush 按注册顺序执行本帧任务。
  const makeFrame = () => {
    let next = 1;
    const queued = new Map();
    return {
      request(callback) { const id = next; next += 1; queued.set(id, callback); return id; },
      cancel(id) { queued.delete(id); },
      flush() { const entries = [...queued.entries()]; queued.clear(); for (const [, callback] of entries) callback(); },
      queued,
    };
  };

  {
    const frame = makeFrame();
    let runs = 0;
    const schedule = throttleModule(() => { runs += 1; }, frame);
    schedule(); schedule(); schedule(); schedule(); schedule();
    check('同帧内连续五次触发只排一个帧任务', frame.queued.size === 1, \`queued=\${frame.queued.size}\`);
    frame.flush();
    check('帧到来时恰好运行一次', runs === 1, \`runs=\${runs}\`);
  }

  {
    const frame = makeFrame();
    let runs = 0;
    const schedule = throttleModule(() => { runs += 1; }, frame);
    schedule(); frame.flush();
    schedule(); frame.flush();
    check('跑完后可再次排队（每帧至多一次，不是只排一次）', runs === 2, \`runs=\${runs}\`);
  }

  {
    const frame = makeFrame();
    let runs = 0;
    const schedule = throttleModule(() => { runs += 1; }, frame);
    schedule();
    schedule.cancel();
    check('cancel 撤掉待跑的帧任务', frame.queued.size === 0, \`queued=\${frame.queued.size}\`);
    frame.flush();
    check('取消后帧到来也不再运行', runs === 0, \`runs=\${runs}\`);
  }

  {
    const frame = makeFrame();
    let runs = 0;
    const schedule = throttleModule(() => { runs += 1; }, frame);
    schedule.cancel();
    schedule();
    check('没有待跑任务时 cancel 不影响下一次排队', frame.queued.size === 1, \`queued=\${frame.queued.size}\`);
  }
}

// 装配检查：观察器回调必须走节流器，而不是直接同步跑 hideMenuSkillRows。
const clientSource = await readFile(CLIENT, 'utf8');
const observerBlock = clientSource.slice(clientSource.indexOf('function installSkillMenuHider'));
check('观察器回调经节流器合并（不再每次变更同步全文档查询）',
  observerBlock.includes('createFrameThrottle(hideMenuSkillRows') && observerBlock.includes('scheduleHide()'),
  'installSkillMenuHider 里没有接节流器');
check('隐藏器的清理会撤销待跑的帧', observerBlock.includes('scheduleHide.cancel()'), 'disposer 里没有 cancel');

if (failures) throw Error(failures + ' frame throttle assertions failed');
`
await import('data:text/javascript;base64,' + Buffer.from(harness).toString('base64'))
