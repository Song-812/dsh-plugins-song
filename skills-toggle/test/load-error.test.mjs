import { readFile } from 'node:fs/promises'
let harness = await readFile(new URL('./client-smoke.mjs', import.meta.url), 'utf8')
harness = harness.slice(0, harness.indexOf('const tree = render()'))
harness = harness.replace("new URL('../lib/client.js', import.meta.url)", 'new URL(' + JSON.stringify(new URL('../lib/client.js', import.meta.url).href) + ')')
harness += `
const tree = render();
globalThis.fetch = async () => { throw Error('fixture-unavailable'); };
const refresh = collect(tree, n => n.type === 'button' && n.props.onClick && String(n.props.title || n.props['aria-label'] || '').includes('刷新'))[0];
if (!refresh) throw Error('refresh button missing');
await refresh.props.onClick(); await settle();
const notice = lastNotice();
check('读取失败时显示实际原因', notice.kind === 'error' && notice.text.includes('fixture-unavailable') && !notice.text.includes('{message}'));
if (failures) throw Error(failures + ' load-error assertions failed');
`
await import('data:text/javascript;base64,' + Buffer.from(harness).toString('base64'))
