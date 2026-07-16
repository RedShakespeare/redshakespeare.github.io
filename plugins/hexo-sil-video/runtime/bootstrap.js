(() => {
  'use strict';

  const key = '__hexoSilVideoBootstrap';
  const existing = window[key];
  if (existing) {
    existing.scan();
    return;
  }

  const config = __SIL_VIDEO_BOOTSTRAP_CONFIG__;
  const selector = '[data-sil-video-player]';
  const RESOURCE_TIMEOUT = 15000;
  let pending = null;
  let observer = null;
  const loadedStyles = new Set();
  let loadedCore = false;

  function report(error) {
    try { console.error('[hexo-sil-video:bootstrap]', error); } catch { /* Diagnostics must not block fallback. */ }
  }

  function resourceError(kind, url) {
    const error = new Error(`播放器${kind}加载失败：${url}`);
    error.code = 'SIL_VIDEO_BOOTSTRAP_RESOURCE';
    error.kind = kind;
    error.url = url;
    return error;
  }

  function fallback(message) {
    document.querySelectorAll(selector).forEach(player => {
      player.dataset.silVideoError = 'true';
      const header = player.querySelector('[data-sil-video-fallback-status]');
      const status = player.querySelector('[data-sil-video-status]');
      if (header) header.hidden = false;
      if (status) status.textContent = message;
    });
  }

  function loadStyle(url) {
    if (loadedStyles.has(url)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.dataset.silVideoStyle = 'true';
      const timer = setTimeout(() => { link.remove(); reject(resourceError('样式', url)); }, RESOURCE_TIMEOUT);
      link.onload = () => { clearTimeout(timer); resolve(); };
      link.onerror = () => { clearTimeout(timer); link.remove(); reject(resourceError('样式', url)); };
      link.addEventListener('load', () => loadedStyles.add(url), { once: true });
      document.head.append(link);
    });
  }

  function loadCore() {
    if (loadedCore) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = config.script;
      script.defer = true;
      script.dataset.silVideoCore = 'true';
      const timer = setTimeout(() => { script.remove(); reject(resourceError('核心脚本', config.script)); }, RESOURCE_TIMEOUT);
      script.onload = () => {
        clearTimeout(timer);
        loadedCore = true;
        observer?.disconnect();
        observer = null;
        document.removeEventListener('inside', scan);
        resolve();
      };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(resourceError('核心脚本', config.script)); };
      document.head.append(script);
    });
  }

  function load() {
    if (pending) return pending;
    pending = config.styles.reduce((promise, url) => promise.then(() => loadStyle(url)), Promise.resolve())
      .then(loadCore)
      .catch(error => {
        pending = null;
        report(error);
        fallback('播放器资源加载失败，请使用原生控件。');
      });
    return pending;
  }

  function scan() {
    if (document.querySelector(selector)) return load();
    return undefined;
  }

  window[key] = { scan };
  scan();
  document.addEventListener('inside', scan);
  observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node instanceof Element && (node.matches(selector) || node.querySelector(selector))) load();
  })));
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
