import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

test('停用插件时宿主能够清理注册的接口', () => {
 let cleanupCalled = false
 let cleanup
 let spec
 apply({ inject(deps, callback) {
   assert.deepEqual(deps, ['connection'])
   cleanup = callback({ connection: { fetch: { register(value) { spec = value; return () => { cleanupCalled = true } } } } })
 } })
 assert.equal(spec.path, '/api/ui-hide')
 assert.deepEqual(spec.methods, ['GET'])
 assert.equal(typeof cleanup, 'function')
 cleanup()
 assert.equal(cleanupCalled, true)
})

test('宿主未提供清理函数时仍能注册接口', () => {
 let result
 apply({ inject(_deps, callback) { result = callback({connection:{fetch:{register(){ return undefined }}}}) } })
 assert.equal(result, undefined)
})

test('宿主返回非函数时不误当成清理函数', () => {
 let result
 apply({inject(_deps, callback){result=callback({connection:{fetch:{register(){return true}}}})}})
 assert.equal(result, undefined)
})
