import { createListenerScope } from './shared.js';
import { createSubtitleMenu } from './subtitle-menu.js';
import { createSubtitleRendererManager } from './subtitle-renderer-manager.js';

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
  let activeContent = '';
  let abortController = null;
  let requestToken = 0;
  let selectedIndex = -1;
  let pendingIndex = tracks.findIndex(track => track.default);
  let modulePromise = null;
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
  const rendererManager = createSubtitleRendererManager({
    video,
    model,
    rendererFactory,
    diagnostics,
    isCurrent
  });

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
      await rendererManager.cancelCandidate();
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
        await rendererManager.enqueue(async () => {
          if (!isCurrent(token)) return;
          await rendererManager.freeTrack();
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
      await rendererManager.enqueue(async () => {
        if (!isCurrent(token)) return;
        await rendererManager.applyTrack({ runtime, content, oldContent: previousContent, token });
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
    async resize() { await rendererManager.resize(); },
    select,
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      requestToken += 1;
      abortController?.abort();
      const errors = [];
      try { scope.destroy(); } catch (error) { errors.push(error); }
      try { menuView.destroy(); } catch (error) { errors.push(error); }
      try { await rendererManager.destroy(); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, 'Subtitle controller cleanup failed.');
    }
  };
}
