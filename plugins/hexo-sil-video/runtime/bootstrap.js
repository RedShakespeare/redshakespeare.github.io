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
  let failed = false;

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
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.dataset.silVideoStyle = 'true';
      link.onload = resolve;
      link.onerror = () => reject(new Error('style'));
      document.head.append(link);
    });
  }

  function loadCore() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = config.script;
      script.defer = true;
      script.dataset.silVideoCore = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('script'));
      document.head.append(script);
    });
  }

  function load() {
    if (failed) return fallback('播放器资源加载失败，请使用原生控件。');
    if (pending) return pending;
    pending = config.styles.reduce((promise, url) => promise.then(() => loadStyle(url)), Promise.resolve())
      .then(loadCore)
      .catch(() => {
        failed = true;
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
