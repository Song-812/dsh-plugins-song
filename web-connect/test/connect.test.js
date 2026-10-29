import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createWebConnect } from '../lib/connect.js';

async function fixture(t) {
  const routes = new Map();
  let origin;
  const server = http.createServer((req,res) => {
    for (const [path, handler] of routes) if (req.url === path || req.url.startsWith(path + '/')) return handler(req,res);
    if (req.url === '/?token=unit-test-launch-token') {
      res.writeHead(302, {'set-cookie':'session=test-session; Path=/; HttpOnly; SameSite=Strict', location:'./'}); res.end();
    } else if (req.headers.cookie === 'session=test-session') { res.end('<html>Harness</html>'); }
    else { res.writeHead(401); res.end('unauthorized'); }
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  const webServer = { getOrigin:()=>origin, register:({path,handler})=>{routes.set(path,handler); return ()=>routes.delete(path);} };
  const connection = {authenticatedUrl:url=>url+'?token=unit-test-launch-token'};
  const connector = createWebConnect({webServer,connection});
  t.after(async()=>{connector.dispose(); server.closeAllConnections(); await new Promise(r=>server.close(r));});
  return {connector,origin,routes,server};
}
function get(url,headers={}) {
  return new Promise((resolve,reject)=>{http.get(url,{headers},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));}).on('error',reject);});
}

test('one-use local entry delivers native HttpOnly cookie without exposing launch token',async t=>{
  const {connector,origin}=await fixture(t);
  const ticket=connector.createEntry('/');
  assert.equal(ticket.url.includes('unit-test-launch-token'),false);
  const response=await get(ticket.url);
  assert.equal(response.status,303);
  assert.equal(response.headers.location,origin+'/');
  assert.match(response.headers['set-cookie'][0],/HttpOnly/);
  assert.equal((await get(ticket.url)).status,410);
  assert.equal((await get(origin+'/',{cookie:response.headers['set-cookie'][0].split(';')[0]})).status,200);
});

test('rejects remote and credential-bearing target paths',async t=>{
  const {connector}=await fixture(t);
  for(const path of ['http://example.com','//example.com','/\\example.com','/?token=hidden','/?Token=hidden','/?TOKEN=x']) {
    assert.throws(()=>connector.createEntry(path));
  }
});

test('dispose removes transient route and revokes entries',async t=>{
  const {connector,routes}=await fixture(t);
  connector.createEntry('/'); connector.dispose(); assert.equal(routes.size,0);
  assert.throws(()=>connector.createEntry('/'));
});

test('user browser receives only local entry and reports confirmed delivery',async t=>{
  const {connector}=await fixture(t);
  const result=await connector.openUser({open:async url=>{assert.ok(!url.includes('token=')); await get(url);}});
  assert.equal(result.ok,true); assert.equal(result.mode,'user');
  assert.ok(!JSON.stringify(result).includes('test-session'));
});

test('agent browser reuses local page and verifies authenticated DOM',async t=>{
  const {connector,origin}=await fixture(t);
  const calls=[]; let cookie;
  const call=async(name,args)=>{
    calls.push({name,args});
    if(name==='list_pages') return {content:[{type:'text',text:`1: DeepSeek Harness (${origin}/) [selected]`}]};
    if(name==='select_page') return {content:[]};
    if(name==='navigate_page') { assert.equal(args.pageId,1); const entry=await get(args.url); cookie=entry.headers['set-cookie'][0].split(';')[0]; return {content:[]}; }
    if(name==='evaluate_script') { assert.equal(args.pageId,1); assert.equal((await get(origin+'/',{cookie})).status,200); return {content:[{type:'text',text:'```json\n'+JSON.stringify({url:origin+'/',ready:true,title:'DeepSeek Harness',authenticated:true})+'\n```'}]}; }
    throw Error('unexpected tool');
  };
  const result=await connector.openAgent({call});
  assert.equal(result.ok,true); assert.equal(result.pageId,1);
  assert.ok(!calls.some(c=>c.name==='new_page'));
  assert.ok(!JSON.stringify(calls).includes('unit-test-launch-token'));
});

test('MCP failures never return secret-bearing upstream messages',async t=>{
  const {connector}=await fixture(t);
  await assert.rejects(connector.openAgent({call:async()=>{throw Error('token=unit-test-launch-token');}}),e=>!e.message.includes('unit-test-launch-token'));
});

test('agent creates a page in the existing MCP browser when no DSH tab exists',async t=>{
  const {connector,origin}=await fixture(t); let opened=false;
  const result=await connector.openAgent({call:async(name,args)=>{
    if(name==='list_pages') return {content:[{type:'text',text:opened?`7: ${origin}/ [selected]`:'1: https://example.org [selected]'}]};
    if(name==='new_page') {assert.equal(args.isolatedContext,undefined); assert.equal(args.background,true); await get(args.url); opened=true; return {content:[]};}
    if(name==='evaluate_script') return {content:[{type:'text',text:'```json\n'+JSON.stringify({url:origin+'/',ready:true,authenticated:true})+'\n```'}]};
    throw Error('unexpected');
  }});
  assert.equal(result.pageId,7);
});

test('browser navigation alone is not reported as authenticated success',async t=>{
  const {connector,origin}=await fixture(t);
  await assert.rejects(connector.openAgent({call:async(name,args)=>{
    if(name==='list_pages') return {content:[]};
    if(name==='new_page') {await get(args.url); return {content:[]};}
    if(name==='evaluate_script') return {content:[{type:'text',text:JSON.stringify({url:origin+'/',ready:true,authenticated:false})}]};
  }}));
});

test('non-loopback server is rejected before any authentication',()=>{
  const connector=createWebConnect({webServer:{getOrigin:()=> 'https://example.org',register:()=>()=>{}},connection:{authenticatedUrl:()=>{throw Error('must not run');}}});
  assert.throws(()=>connector.createEntry('/'),/本机/); connector.dispose();
});

test('forged Host cannot consume the local entry',async t=>{
  const {connector}=await fixture(t); const entry=connector.createEntry('/');
  assert.equal((await get(entry.url,{Host:'example.org'})).status,403);
  assert.equal((await get(entry.url)).status,303);
});

test('cancelled user request revokes entry instead of opening browser',async t=>{
  const {connector}=await fixture(t); const controller=new AbortController(); controller.abort();
  let opened=false;
  await assert.rejects(connector.openUser({signal:controller.signal,open:async()=>{opened=true;}}));
  assert.equal(opened,false);
});

test('multi-tab prefers selected DSH page over earlier matching tab',async t=>{
  const {connector,origin}=await fixture(t);
  let navigated;
  const result=await connector.openAgent({call:async(name,args)=>{
    if(name==='list_pages') {
      return {content:[{type:'text',text:
        `1: Old tab (${origin}/old)\n`+
        `3: Current (${origin}/) [selected]\n`+
        `5: Other https://example.org`
      }]};
    }
    if(name==='select_page') { assert.equal(args.pageId,3); return {content:[]}; }
    if(name==='navigate_page') { navigated=args.pageId; await get(args.url); return {content:[]}; }
    if(name==='evaluate_script') {
      assert.equal(args.pageId,3);
      return {content:[{type:'text',text:'```json\n'+JSON.stringify({url:origin+'/',ready:true,authenticated:true})+'\n```'}]};
    }
    throw Error('unexpected '+name);
  }});
  assert.equal(navigated,3);
  assert.equal(result.pageId,3);
});

test('openUser preserves clear browser-launch errors instead of generic wrap',async t=>{
  const {connector}=await fixture(t);
  await assert.rejects(
    connector.openUser({open:async()=>{ throw new Error('系统默认浏览器无法启动。'); }}),
    e => e.message === '系统默认浏览器无法启动。'
  );
});

test('agent preserves 未找到验证页面 instead of generic wrap',async t=>{
  const {connector,origin}=await fixture(t);
  let opened=false;
  await assert.rejects(connector.openAgent({call:async(name,args)=>{
    if(name==='list_pages') return {content:[{type:'text',text: opened ? '1: https://example.org [selected]' : ''}]};
    if(name==='new_page') { await get(args.url); opened=true; return {content:[]}; }
    throw Error('unexpected '+name);
  }}), e => e.message === '未找到验证页面。');
});

test('AbortError from user cancel is not wrapped as generic browser failure',async t=>{
  const {connector}=await fixture(t);
  const controller=new AbortController();
  const pending=connector.openUser({
    signal:controller.signal,
    open:async()=>{ controller.abort(); const err=new Error('aborted'); err.name='AbortError'; throw err; },
  });
  await assert.rejects(pending, e => e.name==='AbortError');
});

test('localhost Host is accepted when origin is 127.0.0.1 with same port',async t=>{
  const {connector,origin,server}=await fixture(t);
  const port=server.address().port;
  const entry=connector.createEntry('/');
  // Origin is 127.0.0.1:port; browser sends Host: localhost:port
  const response=await get(entry.url,{Host:`localhost:${port}`});
  assert.equal(response.status,303, `expected 303 got ${response.status}; origin=${origin}`);
});

test('dispose aborts in-flight agent evaluate',async t=>{
  const {connector,origin}=await fixture(t);
  let evaluateStarted=false;
  const agent=connector.openAgent({call:async(name,args)=>{
    if(name==='list_pages') return {content:[{type:'text',text:`1: ${origin}/ [selected]`}]};
    if(name==='select_page') return {content:[]};
    if(name==='navigate_page') { await get(args.url); return {content:[]}; }
    if(name==='evaluate_script') {
      evaluateStarted=true;
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(resolve, 5_000);
        // stay pending until dispose aborts the run (checked via subsequent live() — we simulate long MCP)
        // The connector checks disposed before/after call; dispose mid-await should abort on next live() after call returns.
        // So we just delay; dispose will set disposed and abort agentRuns — when evaluate returns, live() throws.
        setTimeout(()=>{ clearTimeout(timer); resolve(); }, 200);
      });
      return {content:[{type:'text',text:JSON.stringify({url:origin+'/',ready:true,authenticated:true})}]};
    }
    throw Error('unexpected');
  }});
  // Let navigate complete and evaluate start
  await new Promise(r=>setTimeout(r, 50));
  connector.dispose();
  await assert.rejects(agent, e => /停用|Abort/i.test(e.message) || e.name==='AbortError');
  assert.equal(evaluateStarted,true);
});

test('操作标签已离开本站时，不对它执行检查，改选仍在本站的标签',async t=>{
  const {connector,origin}=await fixture(t);let count=0,evaluated;
  const result=await connector.openAgent({call:async(name,args)=>{
    if(name==='list_pages') return {text:++count===1?`1: ${origin}/ [selected]`:`1: https://example.invalid/\n2: ${origin}/ [selected]`};
    if(name==='select_page')return {};
    if(name==='navigate_page'){await get(args.url);return {}};
    if(name==='evaluate_script'){evaluated=args.pageId;return{text:JSON.stringify({url:origin+'/',ready:true,authenticated:true})}};
    throw Error('unexpected');
  }});
  assert.equal(evaluated,2);assert.equal(result.pageId,2);
});
test('底层工具未返回时取消立即反馈，并拒绝新操作直到底层结束',async t=>{
  const {connector}=await fixture(t);let release;const gate=new Promise(r=>{release=r});const ctrl=new AbortController();
  const work=connector.openAgent({signal:ctrl.signal,call:async()=>{await gate;return{text:''}}});
  await new Promise(r=>setTimeout(r,5));ctrl.abort();
  const settled=await Promise.race([work.then(()=>false,()=>true),new Promise(r=>setTimeout(()=>r(false),100))]);
  assert.equal(settled,true,'取消后应尽快返回');
  await assert.rejects(connector.openAgent({call:async()=>({text:''})}),/尚未结束|稍后/);
  release();await new Promise(r=>setTimeout(r,20));
});

test('浏览器底层操作结束后可重新发起验证',async t=>{
  const {connector}=await fixture(t);let release;const gate=new Promise(r=>{release=r});const ctrl=new AbortController();
  const work=connector.openAgent({signal:ctrl.signal,call:async()=>{await gate;return{text:''}}});await new Promise(r=>setTimeout(r,5));ctrl.abort();await assert.rejects(work);release();await new Promise(r=>setTimeout(r,30));
  await assert.rejects(connector.openAgent({call:async()=>{throw Error('fixture-new-attempt')}}),/fixture-new-attempt/);
});
test('列表后标签切到其他站点时，页面脚本在发请求前停止',async t=>{
  const {connector,origin}=await fixture(t);let script;
  await assert.rejects(connector.openAgent({call:async(name,args)=>{
    if(name==='list_pages') return {text:`1: ${origin}/ [selected]`};
    if(name==='select_page')return {};if(name==='navigate_page'){await get(args.url);return {}};
    if(name==='evaluate_script'){script=args.function;return{text:JSON.stringify({url:'https://example.invalid/',ready:false,authenticated:false})}};
  }}),/页面尚未完成/);
  const vm=await import('node:vm');let fetchCalled=false;const fn=vm.runInNewContext('('+script+')',{location:{origin:'https://example.invalid',href:'https://example.invalid/'},fetch:()=>{fetchCalled=true;throw Error('must not fetch')}});const result=await fn();assert.equal(fetchCalled,false);assert.equal(result.authenticated,false);
});

test('已排队的验证被取消后不会调用浏览器',async t=>{
  const {connector}=await fixture(t);let release;const gate=new Promise(r=>release=r);let secondCalls=0;const first=connector.openAgent({call:async()=>{await gate;throw Error('fixture-first')}}).catch(()=>{});await new Promise(r=>setTimeout(r,5));const ctrl=new AbortController();const second=connector.openAgent({signal:ctrl.signal,call:async()=>{secondCalls++;return {text:''}}});ctrl.abort();await assert.rejects(second);release();await first;await new Promise(r=>setTimeout(r,30));assert.equal(secondCalls,0);
});
