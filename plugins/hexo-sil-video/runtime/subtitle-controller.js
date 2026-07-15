import { createListenerScope } from './shared.js';

let menuSequence = 0;

export function createSubtitleController({
  player,
  video,
  button,
  menu,
  model,
  setStatus = () => {},
  showFullscreenUi = () => {},
  state = null,
  ui = null,
  moduleLoader = url => import(url),
  rendererFactory = null,
  diagnostics = null
}) {
  const tracks = Array.isArray(model.subtitles) ? model.subtitles : [];
  const scope = createListenerScope();
  const documentRef = player.ownerDocument;
  let renderer = null;
  let activeContent = '';
  let abortController = null;
  let requestToken = 0;
  let selectedIndex = -1;
  let focusedIndex = -1;
  let pendingIndex = tracks.findIndex(track => track.default);
  let modulePromise = null;
  let candidateRenderer = null;
  const destroyedRenderers = new WeakSet();
  const candidateCancellations = new WeakMap();
  let renderQueue = Promise.resolve();
  let renderError = null;
  let destroyed = false;

  menuSequence += 1;
  menu.id = `sil-video-subtitle-menu-${menuSequence}`;
  menu.setAttribute('role', 'menu');
  button.disabled = false;
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-controls', menu.id);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-pressed', 'false');

  function focusOption(index) {
    focusedIndex = index;
    menu.querySelectorAll('[data-sil-video-track]').forEach(option => {
      option.tabIndex = Number(option.dataset.silVideoTrack) === focusedIndex ? 0 : -1;
    });
    menu.querySelector(`[data-sil-video-track="${focusedIndex}"]`)?.focus();
  }

  function setMenuOpen(open, returnFocus = true) {
    menu.hidden = !open;
    ui?.setSubtitleMenuOpen(open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    showFullscreenUi();
    if (open) queueMicrotask(() => focusOption(selectedIndex));
    else if (returnFocus) {
      button.focus();
      queueMicrotask(() => { if (menu.hidden) button.focus(); });
    }
  }

  function syncButtons() {
    menu.querySelectorAll('[data-sil-video-track]').forEach(option => {
      option.setAttribute('aria-checked', Number(option.dataset.silVideoTrack) === selectedIndex ? 'true' : 'false');
      option.tabIndex = Number(option.dataset.silVideoTrack) === focusedIndex ? 0 : -1;
    });
    button.setAttribute('aria-pressed', selectedIndex >= 0 ? 'true' : 'false');
  }

  async function loadModule() {
    if (!modulePromise) {
      // The production path remains a dynamic import(model.runtime.subtitles); tests may inject a loader.
      modulePromise = Promise.resolve().then(() => moduleLoader(model.runtime.subtitles)).catch(error => {
        // A rejected import must not poison later explicit selections.
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  }

  function isCurrent(token) { return !destroyed && token === requestToken; }

  function enqueueRender(task) {
    const pending = renderQueue.then(task, task);
    renderQueue = pending.catch(error => {
      if (destroyed) renderError = error;
    });
    return pending;
  }

  async function destroyCandidate(candidate) {
    if (!candidate || destroyedRenderers.has(candidate)) return;
    destroyedRenderers.add(candidate);
    try { await candidate.destroy?.(); } catch (error) { diagnostics?.report('subtitle.destroy', error); throw error; }
  }

  async function cancelCandidate() {
    const candidate = candidateRenderer;
    if (!candidate) return;
    candidateRenderer = null;
    const cancellation = candidateCancellations.get(candidate);
    const cleanup = destroyCandidate(candidate);
    if (cancellation) cleanup.then(cancellation.resolve, cancellation.reject);
    await cleanup;
  }

  async function applyTrack(runtime, content, oldContent, token) {
    if (renderer) {
      await renderer.ready;
      try {
        await renderer.renderer.setTrack(content);
        if (!isCurrent(token)) {
          if (oldContent) await renderer.renderer.setTrack(oldContent);
          else await renderer.renderer.freeTrack();
          return null;
        }
        return renderer;
      } catch (error) {
        if (oldContent) {
          try { await renderer.renderer.setTrack(oldContent); } catch (rollbackError) {
            await destroyCandidate(renderer);
            renderer = null;
            throw Object.assign(error, { rollbackError });
          }
        } else {
          await destroyCandidate(renderer);
          renderer = null;
        }
        throw error;
      }
    }
    const candidate = (rendererFactory || runtime.createSubtitleRenderer)({
      video,
      content,
      runtime: model.runtime,
      fonts: model.fonts,
      fallbackFont: model.fallbackFont
    });
    candidateRenderer = candidate;
    let resolveCancellation;
    let rejectCancellation;
    candidateCancellations.set(candidate, {
      promise: new Promise((resolve, reject) => {
        resolveCancellation = resolve;
        rejectCancellation = reject;
      }),
      resolve: resolveCancellation,
      reject: rejectCancellation
    });
    try {
      await Promise.race([candidate.ready, candidateCancellations.get(candidate).promise]);
      if (candidateRenderer !== candidate || !isCurrent(token)) {
        await destroyCandidate(candidate);
        candidateCancellations.delete(candidate);
        return null;
      }
      renderer = candidate;
      candidateRenderer = null;
      candidateCancellations.delete(candidate);
      return candidate;
    } catch (error) {
      if (candidateRenderer === candidate) candidateRenderer = null;
      candidateCancellations.delete(candidate);
      await destroyCandidate(candidate);
      throw error;
    }
  }

  async function select(index) {
    const token = ++requestToken;
    pendingIndex = -1;
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    setMenuOpen(false);
    const previousIndex = selectedIndex;
    const previousContent = activeContent;
    try {
      await cancelCandidate();
    } catch (error) {
      if (isCurrent(token)) {
        const message = index < 0 ? `字幕关闭失败：${error.message}` : `字幕加载失败：${error.message}`;
        diagnostics?.report('subtitle.select', error);
        state?.set('subtitles', message, { error: true });
        if (!state) setStatus(message, true);
      }
      return false;
    }
    if (index < 0) {
      try {
        await enqueueRender(async () => {
          if (!isCurrent(token) || !renderer) return;
          await renderer.ready;
          await renderer.renderer.freeTrack();
        });
        if (!isCurrent(token)) return false;
        selectedIndex = -1;
        activeContent = '';
        syncButtons();
        state?.clear('subtitles');
        if (!state) setStatus();
        return true;
      } catch (error) {
        if (isCurrent(token)) {
          const message = `字幕关闭失败：${error.message}`;
          if (state) state.set('subtitles', message, { error: true });
          else setStatus(message, true);
        }
        return false;
      }
    }
    const track = tracks[index];
    if (!track) return false;
    state?.set('subtitles', `正在加载${track.label}字幕…`, { level: 'loading' });
    try {
      const runtime = await loadModule();
      if (!isCurrent(token)) return false;
      const content = await runtime.loadSubtitleText(track, controller.signal);
      if (!isCurrent(token)) return false;
      await enqueueRender(async () => {
        if (!isCurrent(token)) return;
        await applyTrack(runtime, content, previousContent, token);
      });
      if (!isCurrent(token)) return false;
      selectedIndex = index;
      activeContent = content;
      syncButtons();
      state?.clear('subtitles');
      if (!state) setStatus();
      return true;
    } catch (error) {
      if (error?.name === 'AbortError' || !isCurrent(token)) return false;
      selectedIndex = error?.rollbackError ? -1 : previousIndex;
      activeContent = error?.rollbackError ? '' : previousContent;
      syncButtons();
      const message = error?.code === 'SIL_VIDEO_SUBTITLE_CAPABILITY'
        ? '当前浏览器不支持高级字幕渲染。'
        : `字幕加载失败：${error.message}`;
      diagnostics?.report('subtitle.select', error);
      state?.set('subtitles', message, { error: true });
      if (!state) setStatus(message, true);
      return false;
    }
  }

  function activatePending() {
    if (pendingIndex < 0) return;
    const index = pendingIndex;
    pendingIndex = -1;
    void select(index);
  }

  function buildMenu() {
    menu.replaceChildren();
    const choices = [{ label: '关闭字幕', index: -1 }, ...tracks.map((track, index) => ({ label: track.label, index, lang: track.srclang }))];
    for (const choice of choices) {
      const option = documentRef.createElement('button');
      option.type = 'button';
      option.className = 'sil-video-player__subtitle-option';
      option.dataset.silVideoTrack = String(choice.index);
      option.setAttribute('role', 'menuitemradio');
      option.tabIndex = choice.index === -1 ? 0 : -1;
      option.setAttribute('aria-checked', choice.index === -1 ? 'true' : 'false');
      if (choice.lang) option.lang = choice.lang;
      option.textContent = choice.label;
      scope.listen(option, 'click', () => { void select(choice.index); });
      menu.append(option);
    }
  }

  scope.listen(button, 'click', () => setMenuOpen(menu.hidden));
  scope.listen(menu, 'keydown', event => {
    const options = Array.from(menu.querySelectorAll('[data-sil-video-track]'));
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false);
      return;
    }
    if (event.key === 'Tab') {
      setMenuOpen(false, false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const current = Math.max(0, options.findIndex(option => Number(option.dataset.silVideoTrack) === focusedIndex));
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? options.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      focusOption(Number(options[next].dataset.silVideoTrack));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void select(focusedIndex);
    }
  });
  scope.listen(player.ownerDocument, 'pointerdown', event => {
    if (!menu.hidden && !menu.contains(event.target) && event.target !== button) setMenuOpen(false, false);
  });
  if (pendingIndex >= 0) {
    scope.listen(player, 'focusin', activatePending);
    scope.listen(player, 'keydown', activatePending);
    scope.listen(player, 'pointerdown', activatePending);
    scope.listen(player, 'wheel', activatePending);
  }
  buildMenu();

  return {
    activatePending,
    async resize() { if (renderer) await renderer.resize(true); },
    select,
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      requestToken += 1;
      abortController?.abort();
      const errors = [];
      try { scope.destroy(); } catch (error) { errors.push(error); }
      try { await cancelCandidate(); } catch (error) { errors.push(error); }
      try { await renderQueue; } catch (error) { errors.push(error); }
      if (renderError) { errors.push(renderError); renderError = null; }
      if (renderer) {
        const current = renderer;
        renderer = null;
        try { await destroyCandidate(current); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Subtitle controller cleanup failed.');
    }
  };
}
