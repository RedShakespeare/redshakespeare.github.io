import { WHEEL_PIXEL_STEP, WHEEL_RESET_DELAY } from './shared.js';

export function createWheelVolumeController({ player, video, stage, viewport, media, services }) {
  const documentRef = player.ownerDocument;
  const { setTimeout: setTimer, clearTimeout: clearTimer } = services.clock;
  let resetTimer = null;
  let pixelDelta = 0;

  function shortcutSurfaceFocused() {
    const focused = documentRef.activeElement;
    return focused === player || focused === stage || focused === video || focused === viewport;
  }

  function clearResetTimer() {
    if (resetTimer !== null) clearTimer(resetTimer);
    resetTimer = null;
  }

  function handle(event) {
    if (!shortcutSurfaceFocused() || Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY === 0) return;
    event.preventDefault();
    let steps;
    if (event.deltaMode === 0) {
      pixelDelta += event.deltaY;
      steps = Math.trunc(pixelDelta / WHEEL_PIXEL_STEP);
      pixelDelta -= steps * WHEEL_PIXEL_STEP;
      clearResetTimer();
      resetTimer = setTimer(() => {
        resetTimer = null;
        pixelDelta = 0;
      }, WHEEL_RESET_DELAY);
    } else {
      clearResetTimer();
      pixelDelta = 0;
      steps = Math.sign(event.deltaY);
    }
    if (steps !== 0) media.adjustVolume(-steps * 0.05);
  }

  return {
    handle,
    destroy() {
      clearResetTimer();
      pixelDelta = 0;
    }
  };
}
