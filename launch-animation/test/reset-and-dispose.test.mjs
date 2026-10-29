import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../lib/index.js'

function mount() {
 const routes=[]; let cleanup
 apply({on(){},inject(_deps, cb){cleanup=cb({connection:{fetch:{register(route){routes.push(route);return () => { route.cleaned=true }}}}})}})
 return {routes,cleanup}
}
async function reset(route){
 const response=await route.fetch(new Request('http://localhost/api/launch-animation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'resetAll'})}))
 return response.json()
}
test('关闭时交还两个接口的清理函数',()=>{
 const {routes,cleanup}=mount()
 assert.equal(routes.length,2); assert.equal(typeof cleanup,'function'); cleanup()
 assert.ok(routes.every(route=>route.cleaned===true))
})
for (const failure of ['file','directory']) test('恢复默认的图片清理失败必须报告失败：'+failure,async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'launch-audit-')); process.env.DSH_HOME=home
 const uploads=path.join(home,'launch-animation','uploads');fs.mkdirSync(uploads,{recursive:true});const file=path.join(uploads,'fictional.png');fs.writeFileSync(file,'fictional')
 const originalRm=fs.rmSync, originalRead=fs.readdirSync
 try {
  fs.rmSync=function(p,...args){if(failure==='file' && path.resolve(String(p))===file) throw new Error('模拟文件无法删除');return originalRm.call(this,p,...args)}
  fs.readdirSync=function(p,...args){if(failure==='directory' && path.resolve(String(p))===uploads) throw new Error('模拟目录无法读取');return originalRead.call(this,p,...args)}
  const {routes}=mount();const result=await reset(routes.find(r=>r.path==='/api/launch-animation'))
  assert.equal(result.ok,false);assert.match(result.error,/清理/);assert.equal(fs.existsSync(file),true)
 } finally {fs.rmSync=originalRm;fs.readdirSync=originalRead;originalRm(home,{recursive:true,force:true})}
})
test('恢复默认成功时清除虚构图片并报告成功',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'launch-audit-ok-'));process.env.DSH_HOME=home
 const uploads=path.join(home,'launch-animation','uploads');fs.mkdirSync(uploads,{recursive:true});const file=path.join(uploads,'fictional.png');fs.writeFileSync(file,'fictional')
 try {const {routes}=mount();const result=await reset(routes.find(r=>r.path==='/api/launch-animation'));assert.equal(result.ok,true);assert.equal(fs.existsSync(file),false)}
 finally {fs.rmSync(home,{recursive:true,force:true})}
})

test('一个接口清理出错时仍清理另一个接口',()=>{
 let cleanup, firstCleaned=false, count=0
 apply({on(){},inject(_deps,cb){cleanup=cb({connection:{fetch:{register(){count++;return count===1?()=>{firstCleaned=true}:()=>{throw new Error('模拟清理失败')}}}}})}})
 cleanup();assert.equal(firstCleaned,true)
})
test('第二个接口注册失败时清理第一个并报告错误',()=>{
 let count=0,firstCleaned=false
 assert.throws(()=>apply({on(){},inject(_deps,cb){cb({connection:{fetch:{register(){count++;if(count===2) throw new Error('模拟注册失败');return ()=>{firstCleaned=true}}}}})}}),/模拟注册失败/)
 assert.equal(firstCleaned,true)
})
