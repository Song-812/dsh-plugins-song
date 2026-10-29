import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/index.js';

test('plugin registers two independent tools and cleans them up when disabled', async () => {
  const registered = new Map(); let routeCount=0; let cleanup;
  const ctx = {
    webServer:{getOrigin:()=> 'http://127.0.0.1:1850', register:()=>{routeCount++;return()=>routeCount--; }},
    connection:{authenticatedUrl:()=>{throw Error('must not authenticate while mounting');}},
    tools:{register:d=>{registered.set(d.name,d);return()=>registered.delete(d.name);},get:n=>registered.get(n)},
    effect:fn=>{cleanup=fn();},
    systemPrompt:{section:()=>()=>{},getSectionOrder:()=>100},
  };
  apply(ctx);
  assert.deepEqual([...registered.keys()], ['dsh_web_verify','dsh_web_open']);
  await assert.rejects(registered.get('dsh_web_verify').execute({}, {signal:new AbortController().signal}), /chrome-devtools/);
  for(const tool of registered.values()) {
    assert.equal(tool.output.schema.type,'object');
    assert.equal(typeof tool.output.render({}, {ok:true,note:'ready'})[0].text,'string');
  }
  cleanup(); assert.equal(routeCount,0); assert.equal(registered.size,0);
});
