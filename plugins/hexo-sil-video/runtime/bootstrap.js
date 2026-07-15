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
  let pending = null;
  const loadedStyles = new Set();
  let loadedCore = false;

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
      link.onload = resolve;
      link.onerror = () => { link.remove(); reject(new Error('style')); };
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
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error('script')); };
      script.addEventListener('load', () => { loadedCore = true; }, { once: true });
      document.head.append(script);
    });
  }

  function load() {
    if (pending) return pending;
    pending = config.styles.reduce((promise, url) => promise.then(() => loadStyle(url)), Promise.resolve())
      .then(loadCore)
      .catch(() => {
        pending = null;
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
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node instanceof Element && (node.matches(selector) || node.querySelector(selector))) load();
  }))).observe(document.documentElement, { childList: true, subtree: true });
})();
