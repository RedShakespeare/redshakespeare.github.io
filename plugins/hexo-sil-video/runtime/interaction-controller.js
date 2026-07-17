import { createKeyboardController } from './keyboard-controller.js';
import { createPointerController } from './pointer-controller.js';
import { appendCleanupError, createCleanupError, createListenerScope } from './shared.js';
import { createVolumeOverlayController } from './volume-overlay-controller.js';

export function createInteractionController({ controls, surfaces, media, fullscreen, volume, mute, volumeControl, services }) {
  const { play, progress, rate } = controls;
  const { player, stage, viewport, video } = surfaces;
  const scope = createListenerScope();
  const pointerController = createPointerController({ player, video, stage, viewport, media, fullscreen, services });
  const controllers = [
    pointerController,
    createKeyboardController({ player, video, stage, viewport, progress, media, fullscreen }),
    createVolumeOverlayController({ player, volume, mute, volumeControl, media, fullscreen, services })
  ];

  scope.listen(play, 'click', () => { void media.togglePlay(); });
  scope.listen(progress, 'input', () => media.setCurrentTime(Number(progress.value)));
  scope.listen(rate, 'click', media.cycleRate);

  return {
    pendingHiddenTouchTap(event) { return pointerController.pendingHiddenTouchTap(event); },
    async destroy() {
      const errors = [];
      try { scope.destroy(); } catch (error) { appendCleanupError(errors, error); }
      for (let index = controllers.length - 1; index >= 0; index -= 1) {
        try { await controllers[index].destroy(); } catch (error) { appendCleanupError(errors, error); }
      }
      if (errors.length) throw createCleanupError('Interaction controller cleanup failed.', errors);
    }
  };
}
