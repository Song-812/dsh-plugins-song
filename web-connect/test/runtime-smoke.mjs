import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import * as plugin from '../lib/index.js';

const install = join(process.env.LOCALAPPDATA, 'Programs/DeepSeek Harness/resources/app.asar/dsh/node_modules/@deepseek-ai');
const official = name => import(pathToFileURL(join(install,name,'lib/index.js')).href);
const {Context}=await official('cordis');
const {ToolRuntime}=await official('dsh-tools');
const {default:WebServer}=await official('dsh-host-webserver');
const connection=await official('dsh-client-connection');
const ctx=new Context();
let record;
ctx.provide('credentials');
ctx.provide('systemPrompt');
ctx.set('credentials',{async modifyRecord(_key,update){const changed=await update(record); if(changed!==undefined)record=changed; return record;}});
ctx.set('systemPrompt',{tools:()=>()=>{},section:()=>()=>{},getSectionOrder:()=>100});
const loaded=[];
let client;
let rendered = 0;
try {
  for(const [mod,config] of [[WebServer,{host:'127.0.0.1',port:0}],[ToolRuntime,{}],[connection,{}]]) {
    loaded.push(mod); await ctx.plugin(mod,config).await();
  }
  ctx.webServer.registerFallback((req,res)=>{if(!ctx.connection.authorizeIndex(req,res))return;rendered++;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>DSH 网页连接测试</title><main>DSH 插件独立测试环境：浏览器登录已通过，此测试页可以关闭。</main>');});
  loaded.push(plugin);await ctx.plugin(plugin).await();
  assert.ok(ctx.tools.get('dsh_web_verify')); assert.ok(ctx.tools.get('dsh_web_open'));
  console.log('PASS: official Cordis + ToolRuntime + WebServer + browser auth mounted');
  if(process.env.DSH_TEST_CHROME==='1') {
    const mcpRoot=join(process.env.APPDATA,'npm/node_modules/chrome-devtools-mcp/build/src');
    const {Client,StdioClientTransport}=await import(pathToFileURL(join(mcpRoot,'third_party/index.js')).href);
    client=new Client({name:'dsh-web-connect-integration',version:'0.1.0'},{capabilities:{}});
    const transport=new StdioClientTransport({command:process.env.DSH_TEST_NODE,args:[join(mcpRoot,'bin/chrome-devtools-mcp.js'),'--headless','--isolated','--no-usage-statistics'],stderr:'pipe'});
    await client.connect(transport);
    const listed=await client.listTools();
    for(const tool of listed.tools) ctx.tools.register({name:'mcp__chrome-devtools__'+tool.name,parameters:tool.inputSchema,output:{schema:{},render:()=>[]},execute:async(args)=>{
      try {
        const result=await client.callTool({name:tool.name,arguments:args});
        if(result.isError) {
          const message=(result.content??[]).filter(b=>b.type==='text').map(b=>b.text).join(' ').replace(/https?:\/\/\S+/g,'<url>').replace(/token=[^\s]+/g,'token=<redacted>');
          console.log('MCP FAILURE:',tool.name,message.slice(0,600));throw Error('MCP operation failed');
        }
        console.log('MCP OK:',tool.name);
        return result;
      } catch(e) {console.log('MCP rejected:',tool.name,e.name);throw e;}
    }});
    for(let i=0;i<2;i++) {
      const result=await ctx.tools.get('dsh_web_verify').execute({}, {signal:AbortSignal.timeout(60000)});
      assert.equal(result.ok,true);assert.equal(result.mode,'agent');assert.ok(Number.isInteger(result.pageId));
      const shot=await client.callTool({name:'take_snapshot',arguments:{pageId:result.pageId}});
      assert.equal(shot.isError,undefined);assert.ok(JSON.stringify(shot).includes('DSH 插件独立测试环境'));
      console.log(`PASS: isolated Chrome native authentication + snapshot, run ${i+1}, page ${result.pageId}`);
    }
    await client.close();client=undefined;
  }
  if(process.env.DSH_TEST_USER==='1') {
    const before=rendered;
    const result=await ctx.tools.get('dsh_web_open').execute({}, {signal:AbortSignal.timeout(60000)});
    assert.equal(result.ok,true);assert.equal(result.mode,'user');
    const deadline=Date.now()+10000;
    while(rendered<=before && Date.now()<deadline) await new Promise(r=>setTimeout(r,100));
    assert.ok(rendered>before,'default browser must reach authenticated root page');
    console.log('PASS: Windows default browser received native login and requested authenticated page');
  }
} finally {
  if(client)await client.close();
  for(const mod of loaded.reverse()) await ctx.registry.delete(mod);
}
