import {
  GESTURE_CLICK_SUPPRESS_DELAY,
  TOUCH_CLICK_FALLBACK_DELAY,
  TOUCH_DOUBLE_SEEK_SECONDS,
  TOUCH_GESTURE_THRESHOLD,
  TOUCH_SEEK_SECONDS,
  VIEWPORT_CLICK_DELAY,
  VOLUME_CLOSE_DELAY,
  WHEEL_PIXEL_STEP,
  WHEEL_RESET_DELAY,
  clamp,
  createListenerScope,
  focusWithoutScroll
} from './shared.js';

export function createInteractionController({
  player,
  video,
  stage,
  viewport,
  progress,
  volume,
  play,
  mute,
  rate,
  repeat,
  volumeControl,
  media,
  fullscreen
}) {
  const scope = createListenerScope();
  const documentRef = player.ownerDocument;
  const windowRef = documentRef.defaultView;
  let volumeCloseTimer = null;
  let viewportClickTimer = null;
  let viewportClickTouch = false;
  let viewportClickWakeOnly = false;
  let recentTouchTap = null;
  let wheelResetTimer = null;
  let wheelPixelDelta = 0;
  let gesture = null;
  let suppressViewportClickUntil = 0;

  function shortcutSurfaceFocused() {
    const focused = documentRef.activeElement;
    return focused === player || focused === stage || focused === video || focused === viewport;
  }

  function clearViewportClickTimer() {
    if (viewportClickTimer !== null) windowRef?.clearTimeout(viewportClickTimer);
    viewportClickTimer = null;
    viewportClickTouch = false;
    viewportClickWakeOnly = false;
  }

  function takeTouchTap(event) {
    const recent = recentTouchTap && Date.now() - recentTouchTap.time <= TOUCH_CLICK_FALLBACK_DELAY ? recentTouchTap : null;
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
    if (Date.now() < suppressViewportClickUntil) return;
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
        fullscreen.toggle();
      }
      return;
    }
    viewportClickTouch = Boolean(touchTap);
    viewportClickWakeOnly = Boolean(touchTap?.uiWasHidden && fullscreen.active());
    if (!viewportClickWakeOnly) focusWithoutScroll(stage);
    viewportClickTimer = windowRef.setTimeout(() => {
      const wakeOnly = viewportClickWakeOnly;
      viewportClickTimer = null;
      viewportClickTouch = false;
      viewportClickWakeOnly = false;
      if (wakeOnly) {
        focusWithoutScroll(stage);
        fullscreen.showUi();
      } else {
        media.togglePlay(true);
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
      uiWasHidden: fullscreen.active() && stage.dataset.silVideoUiHidden === 'true',
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
      suppressViewportClickUntil = Date.now() + GESTURE_CLICK_SUPPRESS_DELAY;
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
      recentTouchTap = { time: Date.now(), x: event.clientX, uiWasHidden: completed.uiWasHidden };
      return;
    }
    suppressViewportClickUntil = Date.now() + GESTURE_CLICK_SUPPRESS_DELAY;
    if (commit && completed.mode === 'progress' && Number.isFinite(video.duration) && video.duration > 0) {
      media.setCurrentTime(completed.targetTime);
    }
  }

  function clearWheelResetTimer() {
    if (wheelResetTimer !== null) windowRef?.clearTimeout(wheelResetTimer);
    wheelResetTimer = null;
  }

  function scheduleWheelReset() {
    clearWheelResetTimer();
    wheelResetTimer = windowRef.setTimeout(() => {
      wheelResetTimer = null;
      wheelPixelDelta = 0;
    }, WHEEL_RESET_DELAY);
  }

  function handleWheel(event) {
    if (!shortcutSurfaceFocused() || Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY === 0) return;
    event.preventDefault();
    let steps = 0;
    if (event.deltaMode === 0) {
      wheelPixelDelta += event.deltaY;
      steps = Math.trunc(wheelPixelDelta / WHEEL_PIXEL_STEP);
      wheelPixelDelta -= steps * WHEEL_PIXEL_STEP;
      scheduleWheelReset();
    } else {
      clearWheelResetTimer();
      wheelPixelDelta = 0;
      steps = Math.sign(event.deltaY);
    }
    if (steps !== 0) media.adjustVolume(-steps * 0.05);
  }

  function setVolumeOpen(open) {
    if (volumeCloseTimer !== null) windowRef?.clearTimeout(volumeCloseTimer);
    volumeCloseTimer = null;
    player.dataset.silVideoVolumeOpen = open ? 'true' : 'false';
    fullscreen.showUi();
  }

  function scheduleVolumeClose() {
    if (volumeCloseTimer !== null) windowRef?.clearTimeout(volumeCloseTimer);
    volumeCloseTimer = windowRef.setTimeout(() => {
      volumeCloseTimer = null;
      const focused = documentRef.activeElement;
      const keyboardFocused = focused && volumeControl.contains(focused) && focused.matches(':focus-visible');
      if (!keyboardFocused) setVolumeOpen(false);
    }, VOLUME_CLOSE_DELAY);
  }

  function handleKeydown(event) {
    if (fullscreen.active()) fullscreen.showUi();
    const shortcutTarget = event.target === player || event.target === stage || event.target === video || event.target === viewport;
    if (!shortcutTarget) return;
    const key = event.key.toLowerCase();
    if (event.key === ' ' || key === 'spacebar') {
      event.preventDefault();
      media.togglePlay();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!fullscreen.active()) fullscreen.toggle();
    } else if (event.key === 'Escape') {
      if (fullscreen.active()) documentRef.exitFullscreen();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      media.adjustVolume(0.05);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      media.adjustVolume(-0.05);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      media.seek(-5);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      media.seek(5);
    } else if (key === 'm') {
      event.preventDefault();
      media.toggleMute();
    }
  }

  scope.listen(play, 'click', () => media.togglePlay());
  scope.listen(viewport, 'click', handleViewportClick);
  scope.listen(viewport, 'dblclick', event => event.preventDefault());
  scope.listen(viewport, 'pointerdown', startGesture);
  scope.listen(viewport, 'pointermove', moveGesture);
  scope.listen(viewport, 'pointerup', event => finishGesture(event, true));
  scope.listen(viewport, 'pointercancel', event => finishGesture(event, false));
  scope.listen(viewport, 'lostpointercapture', event => finishGesture(event, false));
  scope.listen(viewport, 'wheel', handleWheel, { passive: false });
  scope.listen(mute, 'click', event => {
    if (event.pointerType === 'touch') setVolumeOpen(player.dataset.silVideoVolumeOpen !== 'true');
    media.toggleMute();
  });
  scope.listen(volumeControl, 'pointerenter', () => setVolumeOpen(true));
  scope.listen(volumeControl, 'pointerleave', event => { if (event.pointerType !== 'touch') scheduleVolumeClose(); });
  scope.listen(volumeControl, 'focusin', () => setVolumeOpen(true));
  scope.listen(volumeControl, 'focusout', event => { if (!volumeControl.contains(event.relatedTarget)) scheduleVolumeClose(); });
  scope.listen(volume, 'input', () => {
    setVolumeOpen(true);
    media.setVolume(Number(volume.value));
  });
  scope.listen(progress, 'input', () => media.setCurrentTime(Number(progress.value)));
  scope.listen(rate, 'click', media.cycleRate);
  scope.listen(repeat, 'click', media.toggleRepeat);
  scope.listen(documentRef, 'pointerdown', event => {
    if (player.dataset.silVideoVolumeOpen === 'true' && !volumeControl.contains(event.target)) setVolumeOpen(false);
  });
  scope.listen(player, 'keydown', handleKeydown);

  return {
    pendingHiddenTouchTap(event) {
      return pointerIsPrimaryTouch(event) && gesture && gesture.pointerId === event.pointerId && gesture.uiWasHidden && !gesture.mode;
    },
    destroy() {
      if (volumeCloseTimer !== null) windowRef?.clearTimeout(volumeCloseTimer);
      clearViewportClickTimer();
      clearWheelResetTimer();
      scope.destroy();
    }
  };
}
