import { createKeyboardController } from './keyboard-controller.js';
import { createPointerController } from './pointer-controller.js';
import { appendCleanupError, createCleanupError, createListenerScope } from './shared.js';
import { createVolumeOverlayController } from './volume-overlay-controller.js';

export function createInteractionController({ controls, surfaces, media, fullscreen, volume, mute, volumeControl, services }) {
  const refs = { ...surfaces, ...controls, media, fullscreen, volume, mute, volumeControl, services };
  const scope = createListenerScope();
  const pointerController = createPointerController(refs);
  const controllers = [
    pointerController,
    createKeyboardController(refs),
    createVolumeOverlayController(refs)
  ];

  scope.listen(refs.play, 'click', () => { void refs.media.togglePlay(); });
  scope.listen(refs.progress, 'input', () => refs.media.setCurrentTime(Number(refs.progress.value)));
  scope.listen(refs.rate, 'click', refs.media.cycleRate);
  scope.listen(refs.repeat, 'click', refs.media.toggleRepeat);

  return {
    pendingHiddenTouchTap(event) { return pointerController.pendingHiddenTouchTap(event); },
    async destroy() {
      const errors = [];
      try { scope.destroy(); } catch (error) { appendCleanupError(errors, error); }
      for (const controller of controllers.reverse()) {
        try { await controller.destroy(); } catch (error) { appendCleanupError(errors, error); }
      }
      if (errors.length) throw createCleanupError('Interaction controller cleanup failed.', errors);
    }
  };
}
