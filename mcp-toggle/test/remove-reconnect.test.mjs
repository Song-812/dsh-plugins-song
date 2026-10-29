import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('./client-smoke.mjs',import.meta.url),'utf8');
const prefix=source.slice(0,source.indexOf('const tree = render()')).replace(/const CLIENT = new URL\([^\n]+/,'const CLIENT = new URL('+JSON.stringify(new URL('../lib/client.js',import.meta.url).href)+')');
const checks=`
const tree=render();
const walk=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...(n.children??[]).flatMap(x=>walk(x,p))];
const cls=(n,c)=>String(n.props?.className??'').split(' ').includes(c);
const ends=walk(tree,n=>cls(n,'mct-cardEnd'));
check('卡片存在',ends.length>0);
check('每张卡片右侧仅保留状态点和开关',ends.every(e=>e.children.filter(x=>x&&typeof x==='object').length===2&&walk(e,n=>n.props?.role==='switch').length===1));
check('不再有重连按钮',walk(tree,n=>n.type==='button'&&String(n.props?.title??n.props?.['aria-label']??'').includes('重连')).length===0);
check('拖动手柄保留',walk(tree,n=>cls(n,'mct-grip')&&typeof n.props.onPointerDown==='function').length>0);
if(failures)throw Error(failures+' checks failed');`;
await import('data:text/javascript;base64,'+Buffer.from(prefix+'\n'+checks).toString('base64'));
