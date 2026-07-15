import { VOLUME_CLOSE_DELAY, createListenerScope } from './shared.js';

export function createVolumeOverlayController({ player, volume, mute, volumeControl, media, fullscreen, ui = null, clock = null }) {
  const scope = createListenerScope();
  const documentRef = player.ownerDocument;
  const windowRef = documentRef.defaultView;
  const setTimer = clock?.setTimeout || ((handler, delay) => windowRef.setTimeout(handler, delay));
  const clearTimer = clock?.clearTimeout || (value => windowRef?.clearTimeout(value));
  let closeTimer = null;

  function setOpen(open) {
    if (closeTimer !== null) clearTimer(closeTimer);
    closeTimer = null;
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
    if (event.pointerType === 'touch') setOpen(ui ? !ui.volumeOpen() : player.dataset.silVideoVolumeOpen !== 'true');
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
    if ((ui ? ui.volumeOpen() : player.dataset.silVideoVolumeOpen === 'true') && !volumeControl.contains(event.target)) setOpen(false);
  });

  return {
    destroy() {
      if (closeTimer !== null) clearTimer(closeTimer);
      scope.destroy();
    }
  };
}
