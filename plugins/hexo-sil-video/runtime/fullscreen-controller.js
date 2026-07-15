import {
  FULLSCREEN_UI_HIDE_DELAY,
  createListenerScope,
  focusWithoutScroll
} from './shared.js';

export function createFullscreenController({
  player,
  video,
  stage,
  subtitleMenu,
  fullscreen,
  resizeSubtitles = () => Promise.resolve(),
  state = null,
  ui = null,
  clock = null
}) {
  const scope = createListenerScope();
  const documentRef = stage.ownerDocument;
  const windowRef = documentRef.defaultView;
  const setTimer = clock?.setTimeout || ((handler, delay) => windowRef.setTimeout(handler, delay));
  const clearTimer = clock?.clearTimeout || (timer => windowRef?.clearTimeout(timer));
  const requestFrame = clock?.requestAnimationFrame || (handler => windowRef?.requestAnimationFrame(handler));
  const cancelFrame = clock?.cancelAnimationFrame || (frame => windowRef?.cancelAnimationFrame(frame));
  let fullscreenUiTimer = null;
  let resizeFrame = null;
  let wasFullscreen = false;
  let pointerActivityGuard = () => false;

  function active() {
    return documentRef.fullscreenElement === stage;
  }

  async function lockLandscape() {
    try {
      await windowRef?.screen?.orientation?.lock?.('landscape');
    } catch {
      // Orientation locking is best-effort and commonly unavailable outside Android fullscreen.
    }
  }

  function unlockOrientation() {
    try {
      windowRef?.screen?.orientation?.unlock?.();
    } catch {
      // The browser may expose orientation information without allowing explicit unlocks.
    }
  }

  function controlsKeepUiOpen() {
    const focused = documentRef.activeElement;
    const controlFocused = focused && focused !== video && focused !== stage && stage.contains(focused) && focused.matches(':focus-visible');
    return (ui ? ui.controlsOpen() : !subtitleMenu.hidden) || controlFocused;
  }

  async function request(action, message) {
    try {
      await action();
      return true;
    } catch (error) {
      state?.set('fullscreen', message, { error: true });
      console.error('[hexo-sil-video] fullscreen operation failed', error);
      return false;
    }
  }

  function clearUiTimer() {
    if (fullscreenUiTimer !== null) clearTimer(fullscreenUiTimer);
    fullscreenUiTimer = null;
  }

  function scheduleUiHide() {
    clearUiTimer();
    delete stage.dataset.silVideoUiHidden;
    if (!active() || video.paused || video.ended || controlsKeepUiOpen()) return;
    fullscreenUiTimer = setTimer(() => {
      fullscreenUiTimer = null;
      if (active() && !video.paused && !video.ended && !controlsKeepUiOpen()) stage.dataset.silVideoUiHidden = 'true';
    }, FULLSCREEN_UI_HIDE_DELAY);
  }

  function showUi() {
    delete stage.dataset.silVideoUiHidden;
    scheduleUiHide();
  }

  function syncPlayback() {
    if (!video.paused && !video.ended) scheduleUiHide();
    else {
      clearUiTimer();
      delete stage.dataset.silVideoUiHidden;
    }
  }

  function sync() {
    const isActive = active();
    player.dataset.silVideoFullscreen = isActive ? 'true' : 'false';
    fullscreen.setAttribute('aria-label', isActive ? '退出全屏' : '进入全屏');
    if (isActive) {
      state?.clear('fullscreen');
      wasFullscreen = true;
      focusWithoutScroll(stage);
      lockLandscape();
      scheduleUiHide();
    } else {
      clearUiTimer();
      delete stage.dataset.silVideoUiHidden;
      if (wasFullscreen) {
        wasFullscreen = false;
        unlockOrientation();
        focusWithoutScroll(player);
      }
      state?.clear('fullscreen');
    }
    if (resizeFrame !== null) cancelFrame(resizeFrame);
    resizeFrame = requestFrame(() => {
      resizeFrame = null;
      resizeSubtitles().catch(error => console.error('[hexo-sil-video] subtitle resize failed', error));
    }) ?? null;
  }

  async function toggle() {
    return active()
      ? request(() => documentRef.exitFullscreen(), '无法退出全屏。')
      : request(() => stage.requestFullscreen(), '无法进入全屏。');
  }

  function handlePointerActivity(event) {
    if (!pointerActivityGuard(event)) showUi();
  }

  scope.listen(fullscreen, 'click', () => { void toggle(); });
  scope.listen(stage, 'pointermove', handlePointerActivity);
  scope.listen(stage, 'pointerdown', handlePointerActivity);
  scope.listen(stage, 'focusin', showUi);
  scope.listen(documentRef, 'fullscreenchange', sync);
  sync();

  return {
    active,
    setPointerActivityGuard(value) { pointerActivityGuard = value; },
    showUi,
    syncPlayback,
    toggle,
    destroy() {
      clearUiTimer();
      if (resizeFrame !== null) cancelFrame(resizeFrame);
      resizeFrame = null;
      if (active()) unlockOrientation();
      scope.destroy();
    }
  };
}
