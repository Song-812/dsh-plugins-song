// 「官方管理页」按钮的直达兜底回归：layout/selectPanel 取不到时 title 提示 + 点击 warn，
// selectPanel 抛错时接住并 warn。沿用其他测试的做法：复用 client-smoke 的桩，只追加断言。
import {readFile} from 'node:fs/promises';
let harness=await readFile(new URL('./client-smoke.mjs',import.meta.url),'utf8');
harness=harness.slice(0,harness.indexOf('const tree = render()')).replace("new URL('../lib/client.js', import.meta.url)",'new URL('+JSON.stringify(new URL('../lib/client.js',import.meta.url).href)+')');
harness+=`
const officialBtn=(tree)=>collect(tree,(node)=>byClass(node,'plp-resetBtn')&&node.children.includes('官方管理页'))[0];

// 情况一：ctx.get('layout') 取不到（默认桩就是这样）→ title 提示 + 点击恰好 warn 一次。
const btnTree=render();
const btn=officialBtn(btnTree);
check('取不到 layout 时按钮带「不支持直达」title 提示',btn!==undefined&&btn.props.title==='当前 DSH 版本不支持直达',btn===undefined?'没找到按钮':String(btn.props.title));
const warns=[];
const realWarn=console.warn;
console.warn=(...args)=>{warns.push(args.join(' '));};
try{btn.props.onClick();}finally{console.warn=realWarn;}
check('取不到 layout 时点击 console.warn 恰好一次且点名 selectPanel',warns.length===1&&warns[0].includes('selectPanel'),JSON.stringify(warns));

// 情况二：layout 可用 → 不带 title 提示，点击调用 selectPanel('plugins')。
const selected=[];
ctx.get=(name)=>name==='layout'?{selectPanel:(key)=>{selected.push(key);}}:(name==='locale'?localeService:undefined);
try{
  const okBtn=officialBtn(render());
  check('layout 可用时按钮不带 title 提示',okBtn!==undefined&&okBtn.props.title===undefined,okBtn===undefined?'没找到按钮':String(okBtn.props.title));
  okBtn.props.onClick();
  check('点击调用 selectPanel("plugins")',JSON.stringify(selected)===JSON.stringify(['plugins']),JSON.stringify(selected));
}finally{
  ctx.get=(name)=>(name==='locale'?localeService:undefined);
}

// 情况三：selectPanel 抛错 → 接住不外抛，console.warn 一次并带上错误信息。
const throwWarns=[];
console.warn=(...args)=>{throwWarns.push(args.join(' '));};
ctx.get=(name)=>name==='layout'?{selectPanel:()=>{throw new Error('boom');}}:(name==='locale'?localeService:undefined);
try{
  const throwBtn=officialBtn(render());
  let threw=false;
  try{throwBtn.props.onClick();}catch{threw=true;}
  check('selectPanel 抛错被接住且 console.warn 一次',threw===false&&throwWarns.length===1&&throwWarns[0].includes('boom'),JSON.stringify(throwWarns));
}finally{
  console.warn=realWarn;
  ctx.get=(name)=>(name==='locale'?localeService:undefined);
}

if(failures)throw Error(failures+' official button checks failed');
`;
await import('data:text/javascript;base64,'+Buffer.from(harness).toString('base64'));
