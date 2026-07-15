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
  resizeSubtitles = () => Promise.resolve()
}) {
  const scope = createListenerScope();
  const documentRef = stage.ownerDocument;
  const windowRef = documentRef.defaultView;
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
    return player.dataset.silVideoVolumeOpen === 'true' || !subtitleMenu.hidden || controlFocused;
  }

  function clearUiTimer() {
    if (fullscreenUiTimer !== null) windowRef?.clearTimeout(fullscreenUiTimer);
    fullscreenUiTimer = null;
  }

  function scheduleUiHide() {
    clearUiTimer();
    delete stage.dataset.silVideoUiHidden;
    if (!active() || video.paused || video.ended || controlsKeepUiOpen()) return;
    fullscreenUiTimer = windowRef.setTimeout(() => {
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
    }
    if (resizeFrame !== null) windowRef?.cancelAnimationFrame(resizeFrame);
    resizeFrame = windowRef?.requestAnimationFrame(() => {
      resizeFrame = null;
      resizeSubtitles().catch(() => {});
    }) ?? null;
  }

  async function toggle() {
    if (active()) await documentRef.exitFullscreen();
    else await stage.requestFullscreen();
  }

  function handlePointerActivity(event) {
    if (!pointerActivityGuard(event)) showUi();
  }

  scope.listen(fullscreen, 'click', toggle);
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
      if (resizeFrame !== null) windowRef?.cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
      if (active()) unlockOrientation();
      scope.destroy();
    }
  };
}
