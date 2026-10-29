// 浏览器检查：顶部确认提示的默认焦点、Esc 取消和失败提示。
// 依赖本机 Chrome 以及 chrome-devtools-mcp 自带的 puppeteer。
// 找不到时跳过，避免在没有该环境的机器上把 `node --test` 跑红。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const client = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const end = client.indexOf('// dsh-session-delete — 客户端半边。')
if (end <= 0) throw new Error('找不到顶部提示脚本')
const toast = client.slice(0, end)

function puppeteerEntry() {
  const fromEnv = process.env.PUPPETEER_MODULE
  if (typeof fromEnv === 'string' && fromEnv !== '' && fs.existsSync(fromEnv)) return fromEnv
  const appData = process.env.APPDATA
  if (typeof appData !== 'string' || appData === '') return ''
  const candidate = path.join(appData, 'npm/node_modules/chrome-devtools-mcp/build/src/third_party/index.js')
  return fs.existsSync(candidate) ? candidate : ''
}

const entry = puppeteerEntry()
let puppeteer = null
if (entry !== '') {
  try {
    ;({ puppeteer } = await import(pathToFileURL(entry).href))
  } catch {
    puppeteer = null
  }
}

test('顶部确认、焦点、取消及错误提示', {
  skip: puppeteer ? false : '需要本机 Chrome 与 chrome-devtools-mcp 内置 puppeteer',
}, async () => {
  const browser = await puppeteer.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] })
  try {
    const page = await browser.newPage()
    await page.setContent('<style>:root{--glass-accent:#ed77ae}</style><button id="original">会话</button>')
    await page.addScriptTag({ content: toast })
    await page.focus('#original')
    await page.evaluate(() => {
      window.owner = {}
      window.answer = null
      window.__dshSettingsToastV1.activate(window.owner)
      window.__dshSettingsToastV1.confirm(window.owner, '测试会话删除？', ['删除', '取消']).then((value) => { window.answer = value })
    })
    assert.equal(await page.$eval('[role="alertdialog"]', (element) => element.textContent.includes('测试会话删除？')), true)
    assert.equal(await page.$eval('[data-answer="yes"]', (element) => element.textContent), '删除')
    assert.equal(await page.$eval('[data-answer="no"]', (element) => element === document.activeElement), true, '默认焦点在取消')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => window.answer === false)
    await page.evaluate(() => { window.__dshSettingsToastV1.show(window.owner, 'error', '删除失败') })
    assert.equal(await page.$eval('[role="alert"]', (element) => element.textContent.includes('删除失败')), true)
    await page.evaluate(() => window.__dshSettingsToastV1.cancel(window.owner))
    assert.equal(await page.$('[data-dsh-settings-toast]'), null)
  } finally {
    await browser.close()
  }
})
