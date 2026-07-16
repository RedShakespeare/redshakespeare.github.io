import { createListenerScope, focusWithoutScroll } from './shared.js';
import { createOrientationController } from './orientation-controller.js';
import { createFullscreenStateWaiter } from './fullscreen-state-waiter.js';
import { createFullscreenActionQueue } from './fullscreen-action-queue.js';
import { createFullscreenHudPolicy } from './fullscreen-hud-policy.js';

const FULLSCREEN_CHANGE_TIMEOUT = 2000;

export function createFullscreenController({
  player,
  video,
  stage,
  fullscreen,
  resizeSubtitles = () => Promise.resolve(),
  services
}) {
  const scope = createListenerScope();
  const documentRef = stage.ownerDocument;
  const windowRef = documentRef.defaultView;
  const orientation = createOrientationController(windowRef);
  const { state, ui, diagnostics, clock } = services;
  const { requestAnimationFrame: requestFrame, cancelAnimationFrame: cancelFrame } = clock;
  const stateWaiter = createFullscreenStateWaiter({
    documentRef,
    clock,
    isActive: () => documentRef.fullscreenElement === stage,
    timeout: FULLSCREEN_CHANGE_TIMEOUT
  });
  let resizeFrame = null;
  let wasFullscreen = false;
  let pointerActivityGuard = () => false;
  let destroying = false;
  let destroyed = false;

  function active() {
    return documentRef.fullscreenElement === stage;
  }

  const hud = createFullscreenHudPolicy({ stage, video, documentRef, ui, clock, active });
  const actions = createFullscreenActionQueue();

  async function request(action, message, target) {
    try {
      await action();
      if (!await stateWaiter.waitFor(target)) {
        if (destroying || destroyed) return false;
        const error = new Error(`全屏状态变更超时：${target ? '进入' : '退出'}`);
        error.code = 'SIL_VIDEO_FULLSCREEN_TIMEOUT';
        state.set('fullscreen', message, { error: true });
        diagnostics.report('fullscreen', error);
        return false;
      }
      return true;
    } catch (error) {
      state.set('fullscreen', message, { error: true });
      diagnostics.report('fullscreen', error);
      return false;
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
      void orientation.lockLandscape();
      hud.schedule();
    } else {
      hud.clear();
      hud.project(false);
      if (wasFullscreen) {
        wasFullscreen = false;
        orientation.unlock();
        focusWithoutScroll(player);
      }
      state.clear('fullscreen');
    }
    if (resizeFrame !== null) cancelFrame(resizeFrame);
    resizeFrame = requestFrame(() => {
      resizeFrame = null;
      resizeSubtitles().catch(error => diagnostics.report('subtitle.resize', error));
    }) ?? null;
  }

  function toggle() {
    if (destroyed || destroying) return Promise.resolve(false);
    return actions.enqueue(async () => {
      if (destroyed) return false;
      const target = !active();
      return target
        ? request(() => stage.requestFullscreen(), '无法进入全屏。', true)
        : request(() => documentRef.exitFullscreen(), '无法退出全屏。', false);
    });
  }

  function handlePointerActivity(event) {
    if (!pointerActivityGuard(event)) hud.show();
  }

  scope.listen(fullscreen, 'click', () => { void toggle(); });
  scope.listen(stage, 'pointermove', handlePointerActivity);
  scope.listen(stage, 'pointerdown', handlePointerActivity);
  scope.listen(stage, 'focusin', hud.show);
  scope.listen(documentRef, 'fullscreenchange', sync);
  sync();

  return {
    active,
    uiHidden: hud.hidden,
    setPointerActivityGuard(value) { pointerActivityGuard = value; },
    showUi: hud.show,
    syncPlayback: hud.syncPlayback,
    toggle,
    async destroy() {
      if (destroyed) return;
      destroying = true;
      stateWaiter.cancelAll();
      await actions.wait();
      destroyed = true;
      hud.clear();
      hud.project(false);
      if (resizeFrame !== null) cancelFrame(resizeFrame);
      resizeFrame = null;
      if (active()) orientation.unlock();
      scope.destroy();
    }
  };
}
