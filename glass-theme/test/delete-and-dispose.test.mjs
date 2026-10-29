import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

async function fixture(t) {
 const home=await mkdtemp(join(tmpdir(),'glass-regression-'))
 t.after(()=>rm(home,{recursive:true,force:true}))
 const artifact=join(home,'lib','index.mjs')
 await build({entryPoints:[fileURLToPath(new URL('../src/host/index.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',outfile:artifact,logLevel:'silent'})
 const host=await import(pathToFileURL(artifact).href), routes=[]
 let cleanup
 host.apply({inject(_deps,fn){cleanup=fn({connection:{fetch:{register(route){routes.push(route);return ()=>{route.cleaned=true}}}}})}})
 return {home,routes,cleanup}
}
test('停用时清理全部四个接口',async t=>{
 const {routes,cleanup}=await fixture(t)
 assert.equal(routes.length,4);assert.equal(typeof cleanup,'function');cleanup();assert.ok(routes.every(route=>route.cleaned))
})
test('壁纸文件删除失败时报告错误并保留当前状态',async t=>{
 const {home,routes}=await fixture(t),dir=join(home,'壁纸'),file=join(dir,'wallpaper-fixture.png'),state=join(dir,'state.json')
 await mkdir(dir,{recursive:true});await writeFile(file,'fictional');await writeFile(state,JSON.stringify({file:'wallpaper-fixture.png'}))
 const unlink=fs.unlinkSync
 t.mock.method(fs,'unlinkSync',function(p,...args){if(String(p)===file) throw Object.assign(new Error('模拟拒绝删除'),{code:'EACCES'});return unlink.call(this,p,...args)})
 const response=await routes.find(r=>r.path==='/api/glass-theme/wallpaper').fetch(new Request('http://fixture/api/glass-theme/wallpaper',{method:'DELETE'}))
 assert.equal(response.status,500);assert.match((await response.json()).error,/删除/)
 assert.equal((await readFile(state,'utf8')).includes('wallpaper-fixture.png'),true);assert.equal(await readFile(file,'utf8'),'fictional')
})
test('文件本来就不存在时仍可清除状态',async t=>{
 const {home,routes}=await fixture(t),dir=join(home,'壁纸');await mkdir(dir,{recursive:true});await writeFile(join(dir,'state.json'),JSON.stringify({file:'wallpaper-gone.png'}))
 const response=await routes.find(r=>r.path==='/api/glass-theme/wallpaper').fetch(new Request('http://fixture/api/glass-theme/wallpaper',{method:'DELETE'}))
 assert.equal(response.status,200);assert.equal(JSON.parse(await readFile(join(dir,'state.json'),'utf8')).file,null)
})

test('正常删除壁纸会清除文件和状态',async t=>{
 const {home,routes}=await fixture(t),dir=join(home,'壁纸'),file=join(dir,'wallpaper-fixture.png');await mkdir(dir,{recursive:true});await writeFile(file,'fictional');await writeFile(join(dir,'state.json'),JSON.stringify({file:'wallpaper-fixture.png'}))
 const response=await routes.find(r=>r.path==='/api/glass-theme/wallpaper').fetch(new Request('http://fixture/api/glass-theme/wallpaper',{method:'DELETE'}))
 assert.equal(response.status,200);assert.equal(fs.existsSync(file),false);assert.equal(JSON.parse(await readFile(join(dir,'state.json'),'utf8')).file,null)
})
test('接口中途注册失败时清理此前注册的接口',async t=>{
 const {home}=await fixture(t);const host=await import(pathToFileURL(join(home,'lib','index.mjs')).href);let n=0,cleaned=0
 assert.throws(()=>host.apply({inject(_deps,fn){fn({connection:{fetch:{register(){if(++n===3)throw Error('模拟注册失败');return ()=>cleaned++}}}})}}),/模拟注册失败/)
 assert.equal(cleaned,2)
})
