// 整组一键开关必须「一次 POST 提交整组 changes」：宿主的 apply 路由本来就收
// changes 数组（≤200 项，逐项串行处理），逐行 await 只会让 Host 每次全量重扫，
// 组一大就是 O(N²)。这里用真实组件树点旋钮，断言网络层只发了一次 apply。
// 运行：node --test test\group-bulk.test.mjs
import { readFile } from 'node:fs/promises'

let harness = await readFile(new URL('./client-smoke.mjs', import.meta.url), 'utf8')
harness = harness.slice(0, harness.indexOf('const tree = render()'))
harness = harness.replace("new URL('../lib/client.js', import.meta.url)", 'new URL(' + JSON.stringify(new URL('../lib/client.js', import.meta.url).href) + ')')
harness += `
// alpha 两个开关都关、beta 关了模型 —— 三处变化必须合并成一次提交；
// gamma（坏掉）与 delta（与项目组重名）仍然要跳过。
const batchFixture = structuredClone(inventoryBody);
batchFixture.skills[0].model.off = true;
batchFixture.skills[0].manual.off = true;
batchFixture.skills[1].model.off = true;
const batchTree = render({ inventory: batchFixture });
const batchKnob = collect(byClass(sectionOf(batchTree, 'user'), 'dst-groupActions')[0], (node) => node.props.role === 'switch')[0];
check('两行有关闭时旋钮是灭的', batchKnob.props['aria-checked'] === false);
batchKnob.props.onClick();
await settle();
// 提交顺序按行走：每行先模型后手动。
const expectedByRow = [
  { file: A, key: 'model', enabled: true },
  { file: A, key: 'manual', enabled: true },
  { file: B, key: 'model', enabled: true },
];
check('整组开关只发一次 POST，全部 changes 合并在里面',
  applyLog.length === 1 && JSON.stringify(applyLog[0]) === JSON.stringify(expectedByRow),
  JSON.stringify(applyLog));
check('批量结果按行报数（切了 2 个、跳过 2 个）',
  lastNotice() !== undefined && lastNotice().kind === 'ok'
    && lastNotice().text.includes('已切换 2 个') && lastNotice().text.includes('跳过 2 个'),
  JSON.stringify(lastNotice()));
// 抽出的纯函数也要能直接断言（client 侧可测函数）。
const pure = plugin.__test__ !== undefined && typeof plugin.__test__.bulkChangesFor === 'function' ? plugin.__test__.bulkChangesFor : undefined;
check('bulkChangesFor 以纯函数形式可测',
  pure !== undefined && JSON.stringify(pure([{ file: 'x', model: { off: true }, manual: { off: false } }], true)) === JSON.stringify([{ file: 'x', key: 'model', enabled: true }])
    && JSON.stringify(pure([{ file: 'y', model: { off: false }, manual: { off: false } }], false)) === JSON.stringify([{ file: 'y', key: 'model', enabled: false }, { file: 'y', key: 'manual', enabled: false }])
    && JSON.stringify(pure([], true)) === JSON.stringify([]),
  pure === undefined ? 'plugin.__test__.bulkChangesFor 不存在' : '断言不匹配');
if (failures) throw Error(failures + ' group bulk batch assertions failed');
`
await import('data:text/javascript;base64,' + Buffer.from(harness).toString('base64'))
