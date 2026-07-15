import {
  FULLSCREEN_UI_HIDE_DELAY,
  createListenerScope,
  focusWithoutScroll
} from './shared.js';
import { createStateCoordinator } from './state-coordinator.js';

const FULLSCREEN_CHANGE_TIMEOUT = 2000;

export function createFullscreenController({
  player,
  video,
  stage,
  fullscreen,
  resizeSubtitles = () => Promise.resolve(),
  state: suppliedState = null,
  ui = null,
  clock = null,
  diagnostics = null
}) {
  const scope = createListenerScope();
  const documentRef = stage.ownerDocument;
  const windowRef = documentRef.defaultView;
  const state = suppliedState || createStateCoordinator({ player });
  const setTimer = clock?.setTimeout || ((handler, delay) => windowRef.setTimeout(handler, delay));
  const clearTimer = clock?.clearTimeout || (timer => windowRef?.clearTimeout(timer));
  const requestFrame = clock?.requestAnimationFrame || (handler => windowRef?.requestAnimationFrame(handler));
  const cancelFrame = clock?.cancelAnimationFrame || (frame => windowRef?.cancelAnimationFrame(frame));
  let fullscreenUiTimer = null;
  let resizeFrame = null;
  let wasFullscreen = false;
  let hidden = false;
  let pointerActivityGuard = () => false;
  let actionQueue = null;
  let destroying = false;
  let destroyed = false;
  const stateWaiters = new Set();

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
    return Boolean(ui?.controlsOpen()) || controlFocused;
  }

  function projectUiHidden(value) {
    hidden = Boolean(value);
    if (hidden) stage.dataset.silVideoUiHidden = 'true';
    else delete stage.dataset.silVideoUiHidden;
  }

  function waitForState(target) {
    if (active() === target) return Promise.resolve(true);
    return new Promise(resolve => {
      let timer = null;
      const finish = value => {
        if (timer !== null) clearTimer(timer);
        documentRef.removeEventListener('fullscreenchange', onChange);
        stateWaiters.delete(waiter);
        resolve(value);
      };
      const onChange = () => {
        if (active() === target) finish(true);
      };
      const waiter = { cancel: () => finish(false) };
      stateWaiters.add(waiter);
      documentRef.addEventListener('fullscreenchange', onChange);
      timer = setTimer(() => finish(false), FULLSCREEN_CHANGE_TIMEOUT);
    });
  }

  async function request(action, message, target) {
    try {
      await action();
      if (!await waitForState(target)) {
        if (destroying || destroyed) return false;
        const error = new Error(`全屏状态变更超时：${target ? '进入' : '退出'}`);
        error.code = 'SIL_VIDEO_FULLSCREEN_TIMEOUT';
        state.set('fullscreen', message, { error: true });
        diagnostics?.report('fullscreen', error);
        return false;
      }
      return true;
    } catch (error) {
      state.set('fullscreen', message, { error: true });
      diagnostics?.report('fullscreen', error);
      return false;
    }
  }

  function clearUiTimer() {
    if (fullscreenUiTimer !== null) clearTimer(fullscreenUiTimer);
    fullscreenUiTimer = null;
  }

  function scheduleUiHide() {
    clearUiTimer();
    projectUiHidden(false);
    if (!active() || video.paused || video.ended || controlsKeepUiOpen()) return;
    fullscreenUiTimer = setTimer(() => {
      fullscreenUiTimer = null;
      if (active() && !video.paused && !video.ended && !controlsKeepUiOpen()) projectUiHidden(true);
    }, FULLSCREEN_UI_HIDE_DELAY);
  }

  function showUi() {
    projectUiHidden(false);
    scheduleUiHide();
  }

  function syncPlayback() {
    if (!video.paused && !video.ended) scheduleUiHide();
    else {
      clearUiTimer();
      projectUiHidden(false);
    }
  }

  function sync() {
    const isActive = active();
    player.dataset.silVideoFullscreen = isActive ? 'true' : 'false';
    fullscreen.setAttribute('aria-label', isActive ? '退出全屏' : '进入全屏');
    if (isActive) {
      state.clear('fullscreen');
      wasFullscreen = true;
      focusWithoutScroll(stage);
      lockLandscape();
      scheduleUiHide();
    } else {
      clearUiTimer();
      projectUiHidden(false);
      if (wasFullscreen) {
        wasFullscreen = false;
        unlockOrientation();
        focusWithoutScroll(player);
      }
      state.clear('fullscreen');
    }
    if (resizeFrame !== null) cancelFrame(resizeFrame);
    resizeFrame = requestFrame(() => {
      resizeFrame = null;
      resizeSubtitles().catch(error => diagnostics?.report('subtitle.resize', error));
    }) ?? null;
  }

  function enqueueAction(action) {
    let result;
    if (actionQueue) result = actionQueue.then(action, action);
    else {
      try { result = Promise.resolve(action()); } catch (error) { result = Promise.reject(error); }
    }
    actionQueue = result.catch(() => {});
    return result;
  }

  function toggle() {
    if (destroyed || destroying) return Promise.resolve(false);
    return enqueueAction(async () => {
      if (destroyed) return false;
      const target = !active();
      return target
        ? request(() => stage.requestFullscreen(), '无法进入全屏。', true)
        : request(() => documentRef.exitFullscreen(), '无法退出全屏。', false);
    });
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
    uiHidden: () => hidden,
    setPointerActivityGuard(value) { pointerActivityGuard = value; },
    showUi,
    syncPlayback,
    toggle,
    async destroy() {
      if (destroyed) return;
      destroying = true;
      stateWaiters.forEach(waiter => waiter.cancel());
      if (actionQueue) await actionQueue;
      destroyed = true;
      clearUiTimer();
      projectUiHidden(false);
      if (resizeFrame !== null) cancelFrame(resizeFrame);
      resizeFrame = null;
      if (active()) unlockOrientation();
      scope.destroy();
    }
  };
}
