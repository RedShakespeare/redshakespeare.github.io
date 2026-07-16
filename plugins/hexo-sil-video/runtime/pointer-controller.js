import {
  GESTURE_CLICK_SUPPRESS_DELAY,
  TOUCH_CLICK_FALLBACK_DELAY,
  TOUCH_DOUBLE_SEEK_SECONDS,
  TOUCH_GESTURE_THRESHOLD,
  TOUCH_SEEK_SECONDS,
  VIEWPORT_CLICK_DELAY,
  clamp,
  createListenerScope,
  focusWithoutScroll
} from './shared.js';
import { resolveRuntimeServices } from './runtime-services.js';
import { createWheelVolumeController } from './wheel-volume-controller.js';

export function createPointerController({ player, video, stage, viewport, media, fullscreen, services }) {
  services = resolveRuntimeServices(services, { windowRef: player.ownerDocument.defaultView });
  const scope = createListenerScope();
  const { now, setTimeout: setTimer, clearTimeout: clearTimer } = services.clock;
  const wheelController = createWheelVolumeController({ player, video, stage, viewport, media, services });
  let viewportClickTimer = null;
  let viewportClickTouch = false;
  let viewportClickWakeOnly = false;
  let recentTouchTap = null;
  let gesture = null;
  let suppressViewportClickUntil = 0;

  function clearViewportClickTimer() {
    if (viewportClickTimer !== null) clearTimer(viewportClickTimer);
    viewportClickTimer = null;
    viewportClickTouch = false;
    viewportClickWakeOnly = false;
  }

  function takeTouchTap(event) {
    const recent = recentTouchTap && now() - recentTouchTap.time <= TOUCH_CLICK_FALLBACK_DELAY ? recentTouchTap : null;
    if (!recent) recentTouchTap = null;
    const touch = event.pointerType === 'touch' || Boolean(recent);
    if (!touch) return null;
    recentTouchTap = null;
    return {
      x: Number.isFinite(event.clientX) ? event.clientX : recent?.x || 0,
      uiWasHidden: recent?.uiWasHidden || false
    };
  }

  function handleViewportClick(event) {
    if (now() < suppressViewportClickUntil) return;
    const touchTap = takeTouchTap(event);
    if (viewportClickTimer !== null) {
      const doubleTouch = viewportClickTouch && Boolean(touchTap);
      clearViewportClickTimer();
      if (doubleTouch) {
        if (!touchTap.uiWasHidden) focusWithoutScroll(stage);
        const bounds = viewport.getBoundingClientRect();
        media.seek(touchTap.x - bounds.left < bounds.width / 2 ? -TOUCH_DOUBLE_SEEK_SECONDS : TOUCH_DOUBLE_SEEK_SECONDS);
      } else {
        focusWithoutScroll(stage);
        void fullscreen.toggle();
      }
      return;
    }
    viewportClickTouch = Boolean(touchTap);
    viewportClickWakeOnly = Boolean(touchTap?.uiWasHidden && fullscreen.active());
    if (!viewportClickWakeOnly) focusWithoutScroll(stage);
    viewportClickTimer = setTimer(() => {
      const wakeOnly = viewportClickWakeOnly;
      viewportClickTimer = null;
      viewportClickTouch = false;
      viewportClickWakeOnly = false;
      if (wakeOnly) {
        focusWithoutScroll(stage);
        fullscreen.showUi();
      } else {
        void media.togglePlay(true);
      }
    }, VIEWPORT_CLICK_DELAY);
  }

  function pointerIsPrimaryTouch(event) {
    return event.pointerType === 'touch' && event.isPrimary !== false;
  }

  function startGesture(event) {
    if (!pointerIsPrimaryTouch(event)) {
      recentTouchTap = null;
      return;
    }
    if (gesture) return;
    recentTouchTap = null;
    const bounds = viewport.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    gesture = {
      pointerId: event.pointerId,
      bounds,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      targetTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      startVolume: video.muted ? 0 : video.volume,
      startBrightness: media.getBrightness(),
      uiWasHidden: fullscreen.active() && fullscreen.uiHidden(),
      mode: ''
    };
    try { viewport.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
  }

  function moveGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId || !pointerIsPrimaryTouch(event)) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.mode) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < TOUCH_GESTURE_THRESHOLD) return;
      gesture.mode = Math.abs(deltaX) >= Math.abs(deltaY)
        ? 'progress'
        : gesture.startX - gesture.bounds.left < gesture.bounds.width / 2 ? 'brightness' : 'volume';
      clearViewportClickTimer();
      suppressViewportClickUntil = now() + GESTURE_CLICK_SUPPRESS_DELAY;
    }
    if (event.cancelable) event.preventDefault();
    if (gesture.mode === 'progress') {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      gesture.targetTime = clamp(gesture.startTime + deltaX / gesture.bounds.width * TOUCH_SEEK_SECONDS, 0, video.duration);
      media.showProgressFeedback(gesture.targetTime);
    } else if (gesture.mode === 'brightness') {
      media.setBrightness(gesture.startBrightness - deltaY / gesture.bounds.height * 2);
    } else if (gesture.mode === 'volume') {
      media.setGestureVolume(gesture.startVolume - deltaY / gesture.bounds.height);
    }
  }

  function finishGesture(event, commit) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const completed = gesture;
    gesture = null;
    try { viewport.releasePointerCapture(completed.pointerId); } catch { /* Pointer capture may already be lost. */ }
    if (!completed.mode) {
      recentTouchTap = { time: now(), x: event.clientX, uiWasHidden: completed.uiWasHidden };
      return;
    }
    suppressViewportClickUntil = now() + GESTURE_CLICK_SUPPRESS_DELAY;
    if (commit && completed.mode === 'progress' && Number.isFinite(video.duration) && video.duration > 0) {
      media.setCurrentTime(completed.targetTime);
    }
  }

  scope.listen(viewport, 'click', handleViewportClick);
  scope.listen(viewport, 'dblclick', event => event.preventDefault());
  scope.listen(viewport, 'pointerdown', startGesture);
  scope.listen(viewport, 'pointermove', moveGesture);
  scope.listen(viewport, 'pointerup', event => finishGesture(event, true));
  scope.listen(viewport, 'pointercancel', event => finishGesture(event, false));
  scope.listen(viewport, 'lostpointercapture', event => finishGesture(event, false));
  scope.listen(viewport, 'wheel', wheelController.handle, { passive: false });

  return {
    pendingHiddenTouchTap(event) {
      return pointerIsPrimaryTouch(event) && gesture && gesture.pointerId === event.pointerId && gesture.uiWasHidden && !gesture.mode;
    },
    async destroy() {
      clearViewportClickTimer();
      wheelController.destroy();
      scope.destroy();
    }
  };
}
