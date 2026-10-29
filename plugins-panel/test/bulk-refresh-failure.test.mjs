import { readFile } from 'node:fs/promises'
let harness = await readFile(new URL('./client-smoke.mjs', import.meta.url), 'utf8')
harness = harness.slice(0, harness.indexOf('const tree = render()'))
harness = harness.replace("new URL('../lib/client.js', import.meta.url)", 'new URL(' + JSON.stringify(new URL('../lib/client.js', import.meta.url).href) + ')')
harness += String.raw`
const fixture = [
 {id:'a',entryId:'a',moduleName:'fixture-a',path:'patch-a',name:'A',enabled:false,group:'self'},
 {id:'b',entryId:'b',moduleName:'fixture-b',path:'patch-b',name:'B',enabled:false,group:'self'},
];
for (const mode of ['success','inventory','prefs']) {
 let reads=0, gets=0;
 const enabled=new Map([['a',false],['b',false]]);
 ctx.remote.pluginManager.listPlugins=async()=>{
   reads++;
   if(mode==='inventory' && reads>2) throw new Error('模拟清单错误');
   return {ok:true,value:fixture.map(x=>({entryId:x.entryId,patchId:x.path,moduleName:x.moduleName,enabled:enabled.get(x.entryId)}))};
 };
 ctx.remote.pluginManager.setPluginEnabled=async(id,value)=>{enabled.set(id,value);return {ok:true,value:{application:'applied'}}};
 globalThis.fetch=async(url,options)=>{
   if((options?.method??'GET')==='GET') { gets++; if(mode==='prefs') throw new Error('模拟偏好错误'); }
   return {ok:true,status:200,json:async()=>({ok:true,selfMade:['fixture-a','fixture-b'],prefs:{}})};
 };
 const tree=render({servers:fixture});
 const knob=collect(tree,node=>node.props.role==='switch' && String(node.props['aria-label']).includes('一键'))[0];
 knob.props.onClick();
 for(let step=0;step<300;step++){await new Promise(resolve=>setImmediate(resolve));flushTimers()}
 const notices=stateLog.filter(x=>x.index===HOOK_STATE.notice); const last=notices.at(-1)?.value;
 if(mode==='success') {
   check('批量切换两项只刷新一次',gets===1,'刷新 '+gets+' 次');
   check('正常完成后显示结果',last?.kind==='ok'&&last.text.includes('已切换 2 个'),JSON.stringify(last));
 } else check(mode+' 刷新失败保留错误',last?.kind==='error',JSON.stringify(last));
}
console.log(failures===0?'ALL PASS':failures+' FAILED'); process.exit(failures===0?0:1);
`
await import('data:text/javascript;base64,' + Buffer.from(harness).toString('base64'))
