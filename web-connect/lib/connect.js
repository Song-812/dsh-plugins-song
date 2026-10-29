import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';

const PREFIX = '/_dsh-web-connect/';
const TTL = 60_000;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function localOrigin(webServer) {
  const url = new URL(webServer.getOrigin());
  if (!LOOPBACK.has(url.hostname)) throw new Error('网页连接仅支持本机回环服务。');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('不支持的本机协议。');
  return url.origin;
}

function hasTokenParam(searchParams) {
  for (const key of searchParams.keys()) {
    if (key.toLowerCase() === 'token') return true;
  }
  return false;
}

function targetUrl(origin, path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new Error('只能指定本站页面路径。');
  const url = new URL(path, origin);
  if (url.origin !== origin || url.username || url.password || hasTokenParam(url.searchParams)) throw new Error('页面路径不允许包含外部地址或认证信息。');
  return url.href;
}

/** Host 头与 origin 是否同属本机回环且端口一致（localhost / 127.0.0.1 / ::1 互通）。 */
function hostMatchesOrigin(requestHost, origin) {
  if (typeof requestHost !== 'string' || !requestHost) return false;
  let req;
  try {
    req = new URL('http://' + requestHost);
  } catch {
    return false;
  }
  const expected = new URL(origin);
  const reqPort = req.port || '80';
  const expPort = expected.port || (expected.protocol === 'https:' ? '443' : '80');
  if (reqPort !== expPort) return false;
  const a = LOOPBACK.has(req.hostname);
  const b = LOOPBACK.has(expected.hostname);
  if (a && b) return true;
  return req.hostname === expected.hostname;
}

function nativeCookie(url, signal) {
  // Node 原生请求不使用全局 fetch dispatcher 或网页抓取代理；认证地址仅存在于宿主内存。
  return new Promise((resolve, reject) => {
    const request = (url.startsWith('https:') ? https : http).get(url, { signal, timeout: 10_000 }, response => {
      response.resume();
      const cookies = response.headers['set-cookie'];
      if (![302, 303].includes(response.statusCode) || !cookies?.length) return reject(new Error('官方认证入口未签发浏览器登录状态。'));
      resolve(cookies);
    });
    request.on('timeout', () => request.destroy(new Error('认证请求超时。')));
    request.on('error', err => {
      if (err?.name === 'AbortError' || signal?.aborted) return reject(err);
      reject(new Error('本机认证服务不可达。'));
    });
  });
}

function textOf(result) {
  if (typeof result === 'string') return result;
  const blocks = result?.content;
  if (Array.isArray(blocks)) {
    return blocks.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n');
  }
  if (typeof result?.text === 'string') return result.text;
  return '';
}

/**
 * 从 list_pages 文本中解析本站页。优先 [selected]，否则取最后一个匹配（更像刚导航的页）。
 * 兼容：`- 1: …`、`1: title (url) [selected]`、裸 URL、偶发 JSON 数组。
 */
function pageAtOrigin(result, origin, requiredId) {
  const text = textOf(result);
  const pages = [];

  // 文本行：可选列表前缀、数字 id、其余内容里找 URL
  for (const match of text.matchAll(/(?:^|\n)\s*(?:[-*•]\s*)?(\d+)\s*[:.]\s*([^\n]+)/g)) {
    const id = Number(match[1]);
    const rest = match[2];
    const selected = /\[selected\]/i.test(rest);
    const urls = [...rest.matchAll(/https?:\/\/[^\s)\]]+/g)].map(m => m[0].replace(/[.,;]+$/, ''));
    for (const raw of urls.length ? urls : []) {
      try {
        if (new URL(raw).origin === origin) {
          pages.push({ id, selected });
          break;
        }
      } catch { /* 非 URL */ }
    }
  }

  // 若文本里是 JSON 数组/对象带 pages
  if (!pages.length) {
    try {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const parsed = JSON.parse(match ? match[1] : text.trim());
      const list = Array.isArray(parsed) ? parsed : (parsed?.pages ?? parsed?.pageList ?? []);
      if (Array.isArray(list)) {
        for (const item of list) {
          const id = Number(item?.id ?? item?.pageId);
          const url = item?.url ?? item?.href;
          if (!Number.isFinite(id) || !url) continue;
          try {
            if (new URL(url).origin === origin) pages.push({ id, selected: !!(item.selected || item.active) });
          } catch { /* skip */ }
        }
      }
    } catch { /* 不是 JSON */ }
  }

  if (!pages.length) return undefined;
  if (requiredId !== undefined) return pages.find(p => p.id === requiredId)?.id;
  const selected = pages.find(p => p.selected);
  return (selected ?? pages.at(-1)).id;
}

function readState(result) {
  const text = textOf(result);
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  try { return JSON.parse(match ? match[1] : text); } catch { throw new Error('无法确认验证浏览器的页面状态。'); }
}

function isAbort(error, signal) {
  return signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

/** 保留已知中文/业务错误；含 token 的上游信息脱敏；其余带上原文摘要。 */
function rethrowPublic(error, signal, fallback) {
  if (isAbort(error, signal)) throw error;
  const msg = typeof error?.message === 'string' ? error.message : '';
  if (!msg) throw new Error(fallback);
  if (/token\s*=/i.test(msg) || /unit-test-launch-token/i.test(msg)) throw new Error(fallback);
  // 本插件与认证链路已抛出的明确错误原样保留
  if (/入口未被领取|60 秒|未找到验证页面|页面尚未完成|本机|插件已停用|chrome-devtools|不支持|仅支持|无法确认|只能指定|不允许包含|官方认证|认证请求超时|系统默认浏览器|系统未能打开|网页连接/.test(msg)) {
    throw error;
  }
  throw new Error(`${fallback.replace(/。$/, '')}（${msg.slice(0, 120)}）。`);
}

export function createWebConnect({ webServer, connection }) {
  const entries = new Map();
  const active = new Set();
  const agentRuns = new Set();
  let disposed = false;
  let serial = Promise.resolve();
  const cancelledButRunning = new Set();
  const removeRoute = webServer.register({kind: 'prefix', path: PREFIX.slice(0, -1), handler: async (request, response) => {
    const origin = localOrigin(webServer);
    const entry = entries.get(request.url);
    const peer = request.socket.remoteAddress;
    if (request.method !== 'GET' || !hostMatchesOrigin(request.headers.host, origin) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) {
      response.writeHead(403); response.end(); return;
    }
    if (!entry || entry.used || Date.now() >= entry.expires) { response.writeHead(410); response.end(); return; }
    entry.used = true; entries.delete(request.url);
    try {
      const cookies = await nativeCookie(connection.authenticatedUrl(origin + '/'), entry.controller.signal);
      if (disposed) throw new Error('插件已停用。');
      response.writeHead(303, {'set-cookie': cookies, location: entry.target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer'});
      response.end(); entry.finish(true);
    } catch {
      response.writeHead(502, {'cache-control': 'no-store'}); response.end('本机网页认证失败，请重试。'); entry.finish(false);
    }
  }});

  function createEntry(path = '/') {
    if (disposed) throw new Error('网页连接插件已停用。');
    const origin = localOrigin(webServer);
    const target = targetUrl(origin, path);
    const route = PREFIX + randomBytes(24).toString('hex');
    let settle;
    const delivered = new Promise(resolve => { settle = resolve; });
    const controller = new AbortController();
    const entry = {target, expires: Date.now() + TTL, controller, used: false};
    const timer = setTimeout(() => { entries.delete(route); controller.abort(); entry.finish(false); }, TTL);
    timer.unref();
    entry.finish = ok => { clearTimeout(timer); active.delete(entry); settle(ok); };
    active.add(entry); entries.set(route, entry);
    return {url: origin + route, target, delivered, revoke: () => {entries.delete(route); controller.abort(); entry.finish(false);}};
  }

  async function openUser({open, path = '/', signal} = {}) {
    const entry = createEntry(path);
    const cancel = () => entry.revoke();
    signal?.addEventListener('abort', cancel, {once: true});
    try {
      signal?.throwIfAborted();
      await open(entry.url);
      if (!await entry.delivered) throw new Error('浏览器未在 60 秒内领取登录入口，请检查默认浏览器后重试。');
      return {ok: true, mode: 'user', url: entry.target, note: '默认浏览器已领取登录状态；不代表已检查页面内容。'};
    } catch (error) {
      rethrowPublic(error, signal, '默认浏览器未能完成本机登录，请确认浏览器已启动后重试。');
    } finally {signal?.removeEventListener('abort', cancel); entry.revoke();}
  }

  function openAgent(options = {}) {
    const signal = options.signal;
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('已取消', 'AbortError'));
    if (cancelledButRunning.size > 0) return Promise.reject(new Error('上次浏览器操作尚未结束，请稍后重试。'));
    const ticket = {};
    const work = serial.then(() => {
      signal?.throwIfAborted();
      return connectAgent(options);
    });
    serial = work.catch(() => {});
    if (!signal) return work;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        cancelledButRunning.add(ticket);
        reject(signal.reason ?? new DOMException('已取消', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, {once: true});
      if (signal.aborted) onAbort();
      work.then(value => {
        signal.removeEventListener('abort', onAbort);
        cancelledButRunning.delete(ticket);
        resolve(value);
      }, error => {
        signal.removeEventListener('abort', onAbort);
        cancelledButRunning.delete(ticket);
        reject(error);
      });
    });
  }

  async function connectAgent({call, path = '/', signal}) {
    const entry = createEntry(path);
    const run = new AbortController();
    agentRuns.add(run);
    const onOuterAbort = () => run.abort();
    signal?.addEventListener('abort', onOuterAbort, {once: true});
    const cancel = () => entry.revoke();
    run.signal.addEventListener('abort', cancel, {once: true});
    const live = () => {
      if (disposed || run.signal.aborted) {
        const err = new Error('插件已停用。');
        err.name = disposed ? 'AbortError' : (run.signal.reason?.name || 'AbortError');
        throw (signal?.aborted && signal.reason) ? signal.reason : err;
      }
    };
    const safeCall = async (name, args) => {
      live();
      const result = await call(name, args);
      live();
      return result;
    };
    try {
      live();
      signal?.throwIfAborted();
      const origin = localOrigin(webServer);
      const existing = pageAtOrigin(await safeCall('list_pages', {}), origin);
      let operatedId = existing;
      if (existing !== undefined) {
        await safeCall('select_page', {pageId: existing, bringToFront: false});
        await safeCall('navigate_page', {pageId: existing, type: 'url', url: entry.url});
        operatedId = existing;
      } else {
        const created = await safeCall('new_page', {url: entry.url, background: true});
        // 若 MCP 返回里带 pageId / id，优先用
        const createdText = textOf(created);
        const idMatch = createdText.match(/\b(?:pageId|id)\b["\s:=]+(\d+)/i) || createdText.match(/(?:^|\n)\s*(?:[-*•]\s*)?(\d+)\s*[:.]/);
        if (idMatch) operatedId = Number(idMatch[1]);
      }
      if (!await entry.delivered) throw new Error('入口未被领取。');
      live();
      const listed = await safeCall('list_pages', {});
      let pageId = pageAtOrigin(listed, origin);
      // 只有本次操作页仍属于本站，才优先使用它。
      if (operatedId !== undefined) {
        const sameOriginId = pageAtOrigin(listed, origin, operatedId);
        if (sameOriginId !== undefined) pageId = sameOriginId;
      }
      if (pageId === undefined) throw new Error('未找到验证页面。');
      const state = readState(await safeCall('evaluate_script', {pageId, function: `async () => {
        if (location.origin !== ${JSON.stringify(origin)}) return {url: location.href, authenticated: false, ready: false};
        const response = await fetch('/', {credentials: 'include', cache: 'no-store'});
        const deadline = Date.now() + 15000;
        while ((!document.body || !document.body.innerText.trim()) && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
        return {url: location.href, title: document.title, authenticated: response.status === 200,
          ready: document.readyState !== 'loading' && !!document.body?.innerText.trim()};
      }`}));
      const clean = new URL(state.url);
      if (clean.origin !== origin || hasTokenParam(clean.searchParams) || !state.ready || !state.authenticated) throw new Error('页面尚未完成认证或加载。');
      return {ok: true, mode: 'agent', url: clean.href, pageId, note: '验证浏览器已登录并加载页面。请继续用 Chrome DevTools 的 take_snapshot / take_screenshot 检查目标改动，再报告验证结果。'};
    } catch (error) {
      rethrowPublic(error, signal, '智能体验证浏览器连接失败。请确认 chrome-devtools MCP 已启用、桌面网页服务正常；本次未确认页面验证成功。');
    } finally {
      signal?.removeEventListener('abort', onOuterAbort);
      agentRuns.delete(run);
      entry.revoke();
    }
  }

  return {createEntry, openUser, openAgent, dispose() {
    disposed = true; removeRoute(); entries.clear();
    for (const run of [...agentRuns]) run.abort();
    agentRuns.clear();
    for (const entry of [...active]) {entry.controller.abort(); entry.finish(false);}
  }};
}
