import { createListenerScope } from './shared.js';

export function createKeyboardController({ player, video, stage, viewport, progress, media, fullscreen }) {
  const scope = createListenerScope();

  function handleKeydown(event) {
    if (fullscreen.active()) fullscreen.showUi();
    const key = event.key.toLowerCase();
    const space = event.key === ' ' || key === 'spacebar';
    const surfaceTarget = event.target === player || event.target === stage || event.target === video || event.target === viewport;
    if (!surfaceTarget && !(space && event.target === progress)) return;
    if (space) {
      event.preventDefault();
      void media.togglePlay(true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void fullscreen.toggle();
    } else if (event.key === 'Escape') {
      if (fullscreen.active()) void fullscreen.toggle();
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

  scope.listen(player, 'keydown', handleKeydown);
  return { async destroy() { scope.destroy(); } };
}
