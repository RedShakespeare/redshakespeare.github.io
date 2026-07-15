import { createListenerScope } from './shared.js';
import { createSubtitleMenu } from './subtitle-menu.js';

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
  let renderer = null;
  let activeContent = '';
  let abortController = null;
  let requestToken = 0;
  let selectedIndex = -1;
  let pendingIndex = tracks.findIndex(track => track.default);
  let modulePromise = null;
  let candidateRenderer = null;
  const destroyedRenderers = new WeakSet();
  const candidateCancellations = new WeakMap();
  let renderQueue = Promise.resolve();
  let renderError = null;
  let destroyed = false;
  let menuView = null;

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
      const activeRenderer = renderer;
      await activeRenderer.ready;
      try {
        await activeRenderer.renderer.setTrack(content);
        if (!isCurrent(token)) {
          if (oldContent) await activeRenderer.renderer.setTrack(oldContent);
          else await activeRenderer.renderer.freeTrack();
          return null;
        }
        return activeRenderer;
      } catch (error) {
        if (oldContent) {
          try { await activeRenderer.renderer.setTrack(oldContent); } catch (rollbackError) {
            if (renderer === activeRenderer) renderer = null;
            try { await destroyCandidate(activeRenderer); } catch (destroyError) { error.destroyError = destroyError; }
            throw Object.assign(error, { rollbackError });
          }
        } else {
          if (renderer === activeRenderer) renderer = null;
          try { await destroyCandidate(activeRenderer); } catch (destroyError) { error.destroyError = destroyError; }
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
    if (destroyed) return false;
    const token = ++requestToken;
    pendingIndex = -1;
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    menuView.setOpen(false);
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
        menuView.sync(selectedIndex);
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
      menuView.sync(selectedIndex);
      state?.clear('subtitles');
      if (!state) setStatus();
      return true;
    } catch (error) {
      if (error?.name === 'AbortError' || !isCurrent(token)) return false;
      selectedIndex = error?.rollbackError ? -1 : previousIndex;
      activeContent = error?.rollbackError ? '' : previousContent;
      menuView.sync(selectedIndex);
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

  menuView = createSubtitleMenu({
    player,
    button,
    menu,
    tracks,
    onSelect: index => { void select(index); },
    showFullscreenUi,
    ui
  });
  if (pendingIndex >= 0) {
    scope.listen(player, 'focusin', activatePending);
    scope.listen(player, 'keydown', activatePending);
    scope.listen(player, 'pointerdown', activatePending);
    scope.listen(player, 'wheel', activatePending);
  }

  return {
    activatePending,
    async resize() { if (!destroyed && renderer) await renderer.resize(true); },
    select,
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      requestToken += 1;
      abortController?.abort();
      const errors = [];
      try { scope.destroy(); } catch (error) { errors.push(error); }
      try { menuView.destroy(); } catch (error) { errors.push(error); }
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
