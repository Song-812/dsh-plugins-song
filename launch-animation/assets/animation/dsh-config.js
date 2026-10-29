/* DSH启动动画 · 动画配置（文案与时长）
   引擎（engine.js）通过 env.config 读这份对象，文案改动只需要改这里。 */
(function (root) {
  'use strict';
  const CONFIG = Object.freeze({
    fullDurationMs: 14478,
    fastDurationMs: 4000,
    skipOutroMs: 500,
    // 素材地址由引导层注入（插件用内联 data URL，预览页用相对路径）
    assets: Object.freeze({ avatar: '', artwork: '' }),
    text: Object.freeze({
      brand: 'DEEPSEEK HARNESS',
      sequence: 'STARTUP SEQUENCE / DSH',
      syncLabel: 'BOOT RATIO',
      syncPhase: 'INITIALIZING',
      introTitle: 'DEEPSEEK HARNESS',
      introCaption: 'DSH INITIALIZE / HARNESS CORE',
      subtitle: '正在唤醒 DeepSeek Harness',
      coordinates: 'DEEPSEEK HARNESS / DSH',
      endEyebrow: 'CONNECTION ESTABLISHED',
      endTitle: 'DEEPSEEK HARNESS，已准备就绪。',
      endDescription: '启动序列完成',
      skip: 'CLICK / ESC TO SKIP',
      // 身份段形态：brand（灰鲸+字标）/ custom（用自定义身份图）/ none（跳过身份段）
      identityMode: 'brand'
    }),
    gate: Object.freeze({
      // 等 DSH 界面就绪的上限：超时就放行，绝不把用户关在动画外面
      timeoutMs: 25000,
      pollMs: 100
    })
  });
  function durationForMode(mode) {
    return mode === 'fast' ? CONFIG.fastDurationMs : CONFIG.fullDurationMs;
  }
  root.__DSH_LAUNCH_CONFIG__ = CONFIG;
  root.__DSH_LAUNCH_DURATION__ = durationForMode;
})(globalThis);
