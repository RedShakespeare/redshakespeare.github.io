import { createKeyboardController } from './keyboard-controller.js';
import { createPointerController } from './pointer-controller.js';
import { createCleanupError, createListenerScope } from './shared.js';
import { createVolumeOverlayController } from './volume-overlay-controller.js';

export function createInteractionController(refs) {
  const scope = createListenerScope();
  const controllers = [
    createPointerController(refs),
    createKeyboardController(refs),
    createVolumeOverlayController(refs)
  ];

  scope.listen(refs.play, 'click', () => { void refs.media.togglePlay(); });
  scope.listen(refs.progress, 'input', () => refs.media.setCurrentTime(Number(refs.progress.value)));
  scope.listen(refs.rate, 'click', refs.media.cycleRate);
  scope.listen(refs.repeat, 'click', refs.media.toggleRepeat);

  return {
    pendingHiddenTouchTap(event) { return controllers[0].pendingHiddenTouchTap(event); },
    async destroy() {
      const errors = [];
      try { scope.destroy(); } catch (error) { errors.push(error); }
      for (const controller of controllers.reverse()) {
        try { await controller.destroy(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw createCleanupError('Interaction controller cleanup failed.', errors);
    }
  };
}
