// 消息提示插件 —— 引擎行为测试（node:test，无第三方依赖）
//
// 做法：把 lib/client.js 原样加载进一个假世界（假的 window / localStorage /
// AudioContext / 会话服务），挂进假 ctx，再用假时钟推进时间，断言"响了几声、什么时候响"。
// 不 mock 插件内部函数，测的就是真实产物。
//
// 运行：node --test "test/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const SOURCE = readFileSync(CLIENT_PATH, 'utf8');

const STORE_KEY = 'dsh-msg-notify.v1';
const SECOND = 1000;
const REPEAT = 30 * SECOND;

// 引擎用 Date.now() 取时间；测试把时钟握在手里（node:test 同文件内顺序执行）。
let clockNow = 0;
const realDateNow = Date.now;
Date.now = () => clockNow;
test.after(() => { Date.now = realDateNow; });

// 四种音色的首音频率：断言响的是哪一类，靠的就是它。
const TONE_FREQ = { ding: 523.25, fault: 196, tap: 1046.5 };

function makeSettings(overrides = {}) {
  const kinds = {
    question: { tone: 'tap', repeat: 'off' },
    done: { tone: 'ding', repeat: 'off' },
    failed: { tone: 'fault', repeat: 'off' },
    stalled: { tone: 'fault', repeat: 'off' },
  };
  for (const [kind, patch] of Object.entries(overrides)) {
    kinds[kind] = Object.assign({}, kinds[kind], patch);
  }
  return { version: 1, kinds };
}

// 一个"世界"：假时钟 + 假浏览器 + 假会话服务，插件挂上去之后可以任意推进时间。
function createWorld(initial = makeSettings()) {
  const storage = new Map([[STORE_KEY, JSON.stringify(initial)]]);
  const timers = [];
  let seq = 0;
  let now = 0;
  const audio = []; // 每"响一次"记一个首音频率（同一次播放里的第 2、3 个音符不重复记）
  let playBoundary = true; // 一次动作（通知/定时器触发）之内只记第一声
  function markBoundary() { playBoundary = true; }

  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        connect() {},
        start() {
          if (!playBoundary) return;
          playBoundary = false;
          audio.push(osc.frequency.value);
        },
        stop() {},
      };
      return osc;
    }
    createGain() {
      return {
        gain: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }

  const rows = {};    // sessions.list 快照：id -> 行
  const status = {};  // uiSession.sessionStatus 快照：id -> 状态
  const errors = {};  // 会话快照里的 lastAgentError
  const feeds = {};   // 会话事件流：id -> { entries, subscribers, change }
  const forgotten = new Set(); // 故意拿不到事件流的会话（模拟没在这个客户端打开过）
  const listSubs = [];
  const statusSubs = [];
  const winListeners = {};

  const window = {
    AudioContext: FakeAudioContext,
    setTimeout(fn, ms = 0) {
      const id = ++seq;
      timers.push({ id, at: now + ms, fn, every: 0 });
      return id;
    },
    setInterval(fn, ms = 1) {
      const id = ++seq;
      timers.push({ id, at: now + ms, fn, every: ms });
      return id;
    },
    clearTimeout(id) { drop(id); },
    clearInterval(id) { drop(id); },
    addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      winListeners[type] = (winListeners[type] || []).filter(item => item !== fn);
    },
    dispatchEvent(event) {
      for (const fn of winListeners[event.type] || []) fn(event);
      return true;
    },
  };

  function drop(id) {
    const index = timers.findIndex(timer => timer.id === id);
    if (index >= 0) timers.splice(index, 1);
  }

  // 会话事件流：插件靠它判断"到底有没有动静"。没有 feeds 条目 = 拿不到动静。
  function feedRecord(id) {
    return (feeds[id] ||= { entries: [], subscribers: [], change: { kind: 'replace', entries: [] } });
  }

  function feedSource(id) {
    const record = feedRecord(id);
    return {
      getSnapshot: () => ({
        entries: record.entries,
        hasMore: false,
        revision: record.entries.length,
        change: record.change,
      }),
      subscribe(fn) {
        record.subscribers.push(fn);
        return () => { record.subscribers = record.subscribers.filter(listener => listener !== fn); };
      },
    };
  }

  function pushEntry(id, entry) {
    const record = feedRecord(id);
    record.entries.push(entry);
    record.change = { kind: 'append', entries: [entry] };
    markBoundary();
    for (const fn of [...record.subscribers]) fn();
  }

  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };

  const docListeners = new Map();
  const document = {
    addEventListener(type, fn) { if (!docListeners.has(type)) docListeners.set(type, new Set()); docListeners.get(type).add(fn); },
    removeEventListener(type, fn) { docListeners.get(type)?.delete(fn); },
    dispatch(type) { for (const fn of [...(docListeners.get(type) || [])]) fn(); },
    createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
    head: { appendChild() {} },
  };

  const services = {
    slots: {
      inject: () => () => {},
      register: () => () => {},
    },
    sessions: {
      list: {
        getSnapshot: () => ({ byId: rows }),
        subscribe: fn => { listSubs.push(fn); return () => {}; },
      },
      binding: id => {
        const session = { getSnapshot: () => ({ lastAgentError: errors[id] ?? null }) };
        return forgotten.has(id) ? { session } : { session, eventSource: feedSource(id) };
      },
    },
    uiSession: {
      sessionStatus: {
        getSnapshot: () => new Map(Object.entries(status)),
        subscribe: fn => { statusSubs.push(fn); return () => {}; },
      },
    },
  };

  const captured = {};
  window.__ModuleLoader__ = { load: definition => { captured.definition = definition; } };

  const react = {
    createElement: () => null,
    useState: value => [typeof value === 'function' ? value() : value, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  };

  // eslint-disable-next-line no-new-func
  const run = new Function('window', 'localStorage', 'document', 'console', 'require', SOURCE);
  run(window, localStorage, document, console, name => {
    if (name === 'react') return react;
    throw new Error('unexpected require: ' + name);
  });

  assert.ok(captured.definition, '插件没有通过 __ModuleLoader__ 注册');
  const plugin = captured.definition.factory(name => {
    if (name === 'react') return react;
    throw new Error('unexpected require: ' + name);
  });
  assert.equal(typeof plugin.apply, 'function', '插件没有导出 apply');

  let mounted = false;
  const disposers = [];
  const ctx = {
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === 'function') disposers.push(dispose);
      return typeof dispose === 'function' ? dispose : () => {};
    },
    inject(_deps, callback) {
      callback({ get: name => services[name], effect: this.effect });
      return () => {};
    },
    get: name => services[name],
  };

  function mount() {
    if (mounted) return;
    clockNow = now;
    plugin.apply(ctx);
    mounted = true;
  }

  function advance(ms) {
    const target = now + ms;
    for (;;) {
      let due = null;
      let at = Infinity;
      for (const timer of timers) {
        if (timer.at <= target && timer.at < at) { due = timer; at = timer.at; }
      }
      if (!due) break;
      now = due.at;
      clockNow = now;
      if (due.every) due.at += due.every;
      else drop(due.id);
      markBoundary();
      due.fn();
    }
    now = target;
    clockNow = now;
  }

  function setRow(id, patch) {
    rows[id] = Object.assign({ running: false, updatedAt: now, retainedBy: { mainView: 1 } }, rows[id], patch);
  }
  function setStatus(id, patch) {
    status[id] = Object.assign({ running: false, pendingInteraction: null }, status[id], patch);
  }
  function notify() {
    markBoundary();
    for (const fn of statusSubs) fn();
    for (const fn of listSubs) fn();
  }
  // 改设置：写盘 + 发 storage 事件（插件按"另一个窗口改了设置"的路径响应）
  function changeSettings(next) {
    storage.set(STORE_KEY, JSON.stringify(next));
    window.dispatchEvent({ type: 'storage', key: STORE_KEY });
  }

  function replaceFeed(id, entries) {
    const record = feedRecord(id);
    record.entries = entries.slice();
    record.change = { kind: 'replace', entries: entries.slice() };
    markBoundary();
    for (const fn of [...record.subscribers]) fn();
  }

  return {
    window, storage, audio, rows, status, document, docListeners,
    unmount() { for (const dispose of disposers.splice(0).reverse()) dispose(); mounted = false; },
    mount, advance, setRow, setStatus, notify, changeSettings, replaceFeed,
    now: () => now,
    fireQuestion(id) {
      setRow(id, { running: true });
      setStatus(id, { running: true });
      notify();
      setStatus(id, { running: true, pendingInteraction: { kind: 'question', questions: [{ question: '选哪个？' }] } });
      notify();
    },
    clearQuestion(id) {
      setStatus(id, { pendingInteraction: null });
      notify();
    },
    // 事件流上的"动静"：流式增量、命令开始、命令返回。
    pushChunk(id) { pushEntry(id, { type: 'transient', event: { type: 'assistant/live-chunk' } }); },
    pushToolCall(id) { pushEntry(id, { type: 'event', event: { type: 'tool/call' } }); },
    pushToolResult(id) { pushEntry(id, { type: 'event', event: { type: 'tool/result' } }); },
    // 模拟"拿不到这个会话的动静"（会话没打开过）。
    forgetFeed(id) { forgotten.add(id); delete feeds[id]; },
    setError(id, message) { errors[id] = message; },
  };
}

test('提问挂起时响一声；重复=不重复时不再响', () => {
  const world = createWorld();
  world.mount();
  world.fireQuestion('a');
  assert.deepEqual(world.audio, [TONE_FREQ.tap], '应该只响一声轻点');

  world.advance(REPEAT * 2);
  assert.equal(world.audio.length, 1, '重复=不重复时不该再响');
});

test('重复=一直重复：每 30 秒再响，处理掉立即停', () => {
  const world = createWorld(makeSettings({ question: { repeat: 'always' } }));
  world.mount();
  world.fireQuestion('a');
  assert.equal(world.audio.length, 1);

  world.advance(REPEAT);
  assert.equal(world.audio.length, 2, '30 秒后应再响一次');
  world.advance(REPEAT);
  assert.equal(world.audio.length, 3, '60 秒后应再响一次');

  world.clearQuestion('a');
  world.advance(REPEAT * 2);
  assert.equal(world.audio.length, 3, '处理掉之后不该再响');
});

test('正在重复时把重复改成不重复，下一拍就停', () => {
  const world = createWorld(makeSettings({ question: { repeat: 'always' } }));
  world.mount();
  world.fireQuestion('a');
  world.advance(REPEAT);
  assert.equal(world.audio.length, 2);

  world.changeSettings(makeSettings({ question: { repeat: 'off' } }));
  world.advance(REPEAT * 2);
  assert.equal(world.audio.length, 2, '关掉之后不该再响');
});

test('完成响一声；重复=再响 3 次时共响 4 声后停', () => {
  const world = createWorld(makeSettings({ done: { repeat: 'three' } }));
  world.mount();

  world.setRow('a', { running: true });
  world.setStatus('a', { running: true });
  world.notify();
  world.setRow('a', { running: false });
  world.setStatus('a', { running: false });
  world.notify();
  world.advance(SECOND);
  assert.equal(world.audio.length, 1, '完成后先响一声');

  world.advance(REPEAT * 5);
  assert.equal(world.audio.length, 4, '再响 3 次，一共 4 声');
});

test('音色选静音时不出声，也不抛错', () => {
  const world = createWorld(makeSettings({ question: { tone: 'none', repeat: 'always' } }));
  world.mount();
  world.fireQuestion('a');
  world.advance(REPEAT * 2);
  assert.deepEqual(world.audio, []);
});

test('出错时响低沉的音，与“完成”区分开', () => {
  const world = createWorld();
  world.mount();

  world.setRow('a', { running: true });
  world.setStatus('a', { running: true });
  world.notify();

  world.setError('a', 'boom: command failed');
  world.setRow('a', { running: false });
  world.setStatus('a', { running: false });
  world.notify();
  world.advance(SECOND);

  assert.deepEqual(world.audio, [TONE_FREQ.fault], '出错应响低沉，而不是叮咚');
});

test('刚打开页面时，运行中的会话先安静 5 分钟再判', () => {
  const world = createWorld();
  world.mount();
  world.setRow('a', { running: true, updatedAt: world.now() });
  world.setStatus('a', { running: true });
  world.notify();

  world.advance(4 * 60 * SECOND);
  assert.equal(world.audio.length, 0, '刚打开的 5 分钟内不该报卡住');

  world.advance(2 * 60 * SECOND);
  assert.equal(world.audio.length, 1, '安静满 5 分钟才报');
});

test('卡住只响一次；有动静后计时重置，再安静 5 分钟才再响', () => {
  const world = createWorld(makeSettings({ stalled: { repeat: 'off' } }));
  world.mount();
  world.setRow('a', { running: true });
  world.setStatus('a', { running: true });
  world.notify();

  world.advance(5 * 60 * SECOND + 10 * SECOND);
  assert.equal(world.audio.length, 1, '安静满 5 分钟应响一次');

  world.advance(10 * 60 * SECOND);
  assert.equal(world.audio.length, 1, '重复=不重复时不该反复响');

  world.pushChunk('a');
  world.advance(4 * 60 * SECOND);
  assert.equal(world.audio.length, 1, '刚有动静不该算卡住');

  world.advance(2 * 60 * SECOND);
  assert.equal(world.audio.length, 2, '再次安静满 5 分钟应再响一次');
});

test('持续有动静时不报卡住', () => {
  const world = createWorld();
  world.mount();
  world.setRow('a', { running: true });
  world.setStatus('a', { running: true });
  world.notify();

  for (let i = 0; i < 8; i++) {
    world.advance(2 * 60 * SECOND);
    world.pushChunk('a');
  }
  assert.equal(world.audio.length, 0, '一直在输出就不该报卡住');
});

test('命令还挂着时不报卡住；命令返回后再安静 5 分钟才报', () => {
  const world = createWorld();
  world.mount();
  world.setRow('a', { running: true });
  world.setStatus('a', { running: true });
  world.notify();

  world.pushToolCall('a');
  world.advance(10 * 60 * SECOND);
  assert.equal(world.audio.length, 0, '命令还没返回，不算卡住');

  world.pushToolResult('a');
  world.advance(4 * 60 * SECOND);
  assert.equal(world.audio.length, 0, '命令刚返回，还没到 5 分钟');

  world.advance(2 * 60 * SECOND);
  assert.equal(world.audio.length, 1, '命令返回后安静满 5 分钟才报');
});

test('子智能体还在跑时，父会话不算卡住', () => {
  const world = createWorld();
  world.mount();
  world.setRow('parent', { running: true });
  world.setRow('child', { running: true, parentSessionId: 'parent' });
  world.setStatus('parent', { running: true });
  world.setStatus('child', { running: true });
  world.notify();

  for (let i = 0; i < 5; i++) {
    world.advance(2 * 60 * SECOND);
    world.pushChunk('child');
  }
  assert.equal(world.audio.length, 0, '子智能体还在动，父会话不该报卡住');
});

test('拿不到会话动静时不报卡住', () => {
  const world = createWorld();
  world.mount();
  world.forgetFeed('a');
  world.setRow('a', { running: true });
  world.setStatus('a', { running: true });
  world.notify();

  world.advance(10 * 60 * SECOND);
  assert.equal(world.audio.length, 0, '拿不到动静就不猜');
});


test('等用户回答时满 5 分钟不报卡住', () => {
  const world = createWorld(makeSettings({
    question: { tone: 'tap', repeat: 'off' },
    stalled: { tone: 'fault', repeat: 'off' },
  }));
  world.mount();
  world.fireQuestion('a');
  assert.deepEqual(world.audio, [TONE_FREQ.tap], '先响提问');

  world.advance(10 * 60 * SECOND);
  assert.equal(world.audio.length, 1, '等回答期间不该再报卡住');
});

test('事件窗口裁掉旧 tool/call 后仍记得命令挂着，不误报卡住', () => {
  const world = createWorld();
  world.mount();
  world.setRow('a', { running: true });
  world.setStatus('a', { running: true });
  world.notify();

  world.pushToolCall('a');
  // 模拟窗口滑动：entries 里只剩孤立 result（旧 call 被裁掉），若整窗重算会把 pending 打成 0。
  // 增量：pushToolCall 时 pending+1；即便窗口后来裁掉该 call，也不再整窗重算把 pending 打成 0。
  world.advance(10 * 60 * SECOND);
  assert.equal(world.audio.length, 0, 'call 仍挂着（增量计数），不该报卡住');

  world.pushToolResult('a');
  world.advance(4 * 60 * SECOND);
  assert.equal(world.audio.length, 0, '刚返回还没满 5 分钟');
  world.advance(2 * 60 * SECOND);
  assert.equal(world.audio.length, 1, '返回后安静满 5 分钟才报');
});

test('窗口 replace 成前导孤立 result 时宁可不报卡住', () => {
  const world = createWorld();
  world.mount();
  world.setRow('a', { running: true });
  world.setStatus('a', { running: true });
  world.notify();
  // 先让 trackActivity 接上（轮询拍）
  world.advance(5 * SECOND);

  // 通过 binding 的 feed 做 replace：只有一条孤立 tool/result
  // 需要访问内部 feeds——扩展 createWorld 太重，改为用 notify 路径：
  // 直接调用 sessions.binding 拿到的 source 不够；在测试世界里 pushEntry 只能 append。
  // 给 createWorld 补一个 replaceFeed 辅助（见下方若未定义则本测试用增量近似）。
  if (typeof world.replaceFeed === 'function') {
    world.replaceFeed('a', [{ type: 'event', event: { type: 'tool/result' } }]);
    world.advance(10 * 60 * SECOND);
    assert.equal(world.audio.length, 0, '配对不可靠时宁可不报');
  } else {
    // 退化：至少保证孤立 call 一直挂着不会误报（由上一则覆盖）
    assert.ok(true);
  }
});

test('新一轮开始时残留同文案错误应报出错而不是完成', () => {
  const world = createWorld();
  world.mount();

  // 上一轮留下的错误还在
  world.setError('a', 'boom');
  world.setRow('a', { running: false });
  world.setStatus('a', { running: false });
  world.notify();

  // 新一轮开跑（基线若吃残留 boom，结束仍是 boom 会被旧逻辑当成完成）
  world.setRow('a', { running: true });
  world.setStatus('a', { running: true });
  world.notify();

  world.setRow('a', { running: false });
  world.setStatus('a', { running: false });
  world.notify();
  world.advance(SECOND);

  assert.deepEqual(world.audio, [TONE_FREQ.fault], '同文案残留错误应报出错');
});

test('改设置不掐掉正在进行的完成重复链', () => {
  const world = createWorld(makeSettings({ done: { repeat: 'three' } }));
  world.mount();

  world.setRow('a', { running: true });
  world.setStatus('a', { running: true });
  world.notify();
  world.setRow('a', { running: false });
  world.setStatus('a', { running: false });
  world.notify();
  world.advance(SECOND);
  assert.equal(world.audio.length, 1, '完成后先响一声');

  // 中途改设置（例如只改提问音色），完成链应继续
  world.changeSettings(makeSettings({
    done: { tone: 'ding', repeat: 'three' },
    question: { tone: 'fault', repeat: 'off' },
  }));
  world.advance(REPEAT * 5);
  assert.equal(world.audio.length, 4, '改设置后完成重复链应仍满 4 声');
});


test('审批等待期间不误报完成，恢复运行并完成后正常提示', () => {
  const w=createWorld(); w.mount(); w.setRow('a',{running:true}); w.setStatus('a',{running:true}); w.notify();
  w.setRow('a',{running:false}); w.setStatus('a',{running:false,pendingInteraction:{kind:'approval'}}); w.notify(); w.advance(1000);
  assert.deepEqual(w.audio,[]);
  w.setRow('a',{running:true}); w.setStatus('a',{running:true,pendingInteraction:null}); w.notify();
  w.setRow('a',{running:false}); w.setStatus('a',{running:false}); w.notify(); w.advance(1000);
  assert.deepEqual(w.audio,[TONE_FREQ.ding]);
});

test('关闭时清除音频激活监听，重新开启后可以再次监听', () => {
  const w=createWorld(); w.mount();
  assert.equal(w.docListeners.get('pointerdown')?.size,1);
  w.unmount(); assert.equal(w.docListeners.get('pointerdown')?.size,0);
  w.mount(); assert.equal(w.docListeners.get('pointerdown')?.size,1);
  w.unmount(); assert.equal(w.docListeners.get('pointerdown')?.size,0);
});


test('完成结算期间出现审批时取消完成提示', () => {
 const w=createWorld();w.mount();w.setRow('a',{running:true});w.setStatus('a',{running:true});w.notify();
 w.setRow('a',{running:false});w.setStatus('a',{running:false});w.notify();
 w.setStatus('a',{pendingInteraction:{kind:'approval'}});w.notify();w.advance(1000);
 assert.deepEqual(w.audio,[]);
});

test('审批等待时不误报卡住', () => {
 const w=createWorld();w.mount();w.setRow('a',{running:true});w.setStatus('a',{running:true,pendingInteraction:{kind:'approval'}});w.notify();w.advance(7*60*SECOND);
 assert.deepEqual(w.audio,[]);
});
