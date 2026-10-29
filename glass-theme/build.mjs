// 构建：主机半边 → lib/index.js（ESM）；浏览器半边 → lib/client.js（loader 工厂包装）。
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('lib')
fs.mkdirSync(OUT, { recursive: true })

// 主机半边：Node ESM，内置模块交给运行时。
await build({
  entryPoints: ['src/host/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'lib/index.js',
  charset: 'utf8',
  logLevel: 'info',
})

// 浏览器半边：先打成 CJS，再塞进 __ModuleLoader__ 的工厂函数里。
const client = await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'cjs',
  target: 'chrome120',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  loader: { '.css': 'text' },
  charset: 'utf8',
  logLevel: 'info',
})

const code = client.outputFiles[0].text
const indent = (text) => text.split('\n').map((line) => (line === '' ? '' : `    ${line}`)).join('\n')
const wrapped = `// dsh-glass-theme — 浏览器半边（构建产物，别手改；改 src/ 后跑 npm run build）。
window.__ModuleLoader__.load({
  id: 'dsh-glass-theme',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
${indent(code)}
    return module.exports.default ?? module.exports;
  },
});
`
fs.writeFileSync(path.join(OUT, 'client.js'), wrapped, 'utf8')
process.stdout.write(`client bundle: ${(wrapped.length / 1024).toFixed(1)} KB\n`)
