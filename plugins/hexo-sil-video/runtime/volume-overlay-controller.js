import { VOLUME_CLOSE_DELAY, createListenerScope } from './shared.js';
import { resolveRuntimeServices } from './runtime-services.js';

export function createVolumeOverlayController({ player, volume, mute, volumeControl, media, fullscreen, services }) {
  services = resolveRuntimeServices(services, { windowRef: player.ownerDocument.defaultView });
  const scope = createListenerScope();
  const documentRef = player.ownerDocument;
  const { ui, clock } = services;
  const { setTimeout: setTimer, clearTimeout: clearTimer } = clock;
  let closeTimer = null;
  let open = false;

  function setOpen(value) {
    if (closeTimer !== null) clearTimer(closeTimer);
    closeTimer = null;
    open = Boolean(value);
    if (ui) ui.setVolumeOpen(open);
    else player.dataset.silVideoVolumeOpen = open ? 'true' : 'false';
    fullscreen.showUi();
  }

  function scheduleClose() {
    if (closeTimer !== null) clearTimer(closeTimer);
    closeTimer = setTimer(() => {
      closeTimer = null;
      const focused = documentRef.activeElement;
      const keyboardFocused = focused && volumeControl.contains(focused) && focused.matches(':focus-visible');
      if (!keyboardFocused) setOpen(false);
    }, VOLUME_CLOSE_DELAY);
  }

  scope.listen(mute, 'click', event => {
    if (event.pointerType === 'touch') setOpen(!ui.volumeOpen());
    media.toggleMute();
  });
  scope.listen(volumeControl, 'pointerenter', () => setOpen(true));
  scope.listen(volumeControl, 'pointerleave', event => { if (event.pointerType !== 'touch') scheduleClose(); });
  scope.listen(volumeControl, 'focusin', () => setOpen(true));
  scope.listen(volumeControl, 'focusout', event => { if (!volumeControl.contains(event.relatedTarget)) scheduleClose(); });
  scope.listen(volume, 'input', () => {
    setOpen(true);
    media.setVolume(Number(volume.value));
  });
  scope.listen(documentRef, 'pointerdown', event => {
    if (ui.volumeOpen() && !volumeControl.contains(event.target)) setOpen(false);
  });

  return {
    async destroy() {
      if (closeTimer !== null) clearTimer(closeTimer);
      scope.destroy();
    }
  };
}
