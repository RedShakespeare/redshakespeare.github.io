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
  const RETRY_BASE_DELAY = 500;
  const RETRY_MAX_DELAY = 15000;
  let pending = null;
  let observer = null;
  let retryTimer = null;
  let retryAttempt = 0;
  const loadedStyles = new Set();
  const loadingStyles = new Map();
  const optionalRetryTimers = new Map();
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
      player.dataset.silVideoBootstrapError = 'true';
      player.dataset.silVideoError = 'true';
      const header = player.querySelector('[data-sil-video-fallback-status]');
      const status = player.querySelector('[data-sil-video-status]');
      if (header) header.hidden = false;
      if (status) status.textContent = message;
    });
  }

  function clearFallback() {
    document.querySelectorAll(`${selector}[data-sil-video-bootstrap-error="true"]`).forEach(player => {
      delete player.dataset.silVideoBootstrapError;
      delete player.dataset.silVideoError;
      const header = player.querySelector('[data-sil-video-fallback-status]');
      const status = player.querySelector('[data-sil-video-status]');
      if (header) header.hidden = true;
      if (status) status.textContent = '';
    });
  }

  function retryDelay(attempt) {
    return Math.min(RETRY_BASE_DELAY * (2 ** Math.min(attempt, 5)), RETRY_MAX_DELAY);
  }

  function clearRetry() {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry() {
    if (retryTimer !== null || loadedCore || !document.querySelector(selector)) return;
    const delay = retryDelay(retryAttempt);
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      scan();
    }, delay);
  }

  function loadStyle(url) {
    if (loadedStyles.has(url)) return Promise.resolve();
    if (loadingStyles.has(url)) return loadingStyles.get(url);
    const pendingStyle = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.dataset.silVideoStyle = 'true';
      const timer = setTimeout(() => { link.remove(); reject(resourceError('样式', url)); }, RESOURCE_TIMEOUT);
      link.onload = () => { clearTimeout(timer); loadedStyles.add(url); resolve(); };
      link.onerror = () => { clearTimeout(timer); link.remove(); reject(resourceError('样式', url)); };
      document.head.append(link);
    });
    loadingStyles.set(url, pendingStyle);
    pendingStyle.then(
      () => loadingStyles.delete(url),
      () => loadingStyles.delete(url)
    );
    return pendingStyle;
  }

  function loadOptionalStyle(style, attempt = 0) {
    if (loadedStyles.has(style.url)) return;
    void loadStyle(style.url).catch(error => {
      report(error);
      if (optionalRetryTimers.has(style.url)) return;
      const timer = setTimeout(() => {
        optionalRetryTimers.delete(style.url);
        if (document.querySelector(selector)) loadOptionalStyle(style, attempt + 1);
      }, retryDelay(attempt));
      optionalRetryTimers.set(style.url, timer);
    });
  }

  function loadStyles() {
    const required = [];
    for (const style of config.styles) {
      if (style.required) required.push(loadStyle(style.url));
      else loadOptionalStyle(style);
    }
    return Promise.all(required);
  }

  function loadCore() {
    if (loadedCore) return Promise.resolve();
    clearFallback();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = config.script;
      script.defer = true;
      script.dataset.silVideoCore = 'true';
      const timer = setTimeout(() => { script.remove(); reject(resourceError('核心脚本', config.script)); }, RESOURCE_TIMEOUT);
      script.onload = () => {
        clearTimeout(timer);
        loadedCore = true;
        clearRetry();
        retryAttempt = 0;
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
    pending = loadStyles()
      .then(loadCore)
      .catch(error => {
        pending = null;
        report(error);
        fallback('播放器资源加载失败，请使用原生控件。');
        scheduleRetry();
      });
    return pending;
  }

  function scan() {
    if (document.querySelector(selector)) {
      clearRetry();
      return load();
    }
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
