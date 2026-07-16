import { createListenerScope } from './shared.js';

export function createKeyboardController({ player, video, stage, viewport, progress, media, fullscreen }) {
  const scope = createListenerScope();
  const commands = new Map([
    ['space', () => media.togglePlay(true)],
    ['enter', () => fullscreen.toggle()],
    ['arrowup', () => media.adjustVolume(0.05)],
    ['arrowdown', () => media.adjustVolume(-0.05)],
    ['arrowleft', () => media.seek(-5)],
    ['arrowright', () => media.seek(5)],
    ['m', () => media.toggleMute()]
  ]);

  function normaliseKey(event) {
    const key = event.key.toLowerCase();
    return event.key === ' ' || key === 'spacebar' ? 'space' : key;
  }

  function handleKeydown(event) {
    if (fullscreen.active()) fullscreen.showUi();
    const key = normaliseKey(event);
    const space = key === 'space';
    const surfaceTarget = event.target === player || event.target === stage || event.target === video || event.target === viewport;
    if (!surfaceTarget && !(space && event.target === progress)) return;
    if (key === 'escape') {
      if (fullscreen.active()) void fullscreen.toggle();
      return;
    }
    const command = commands.get(key);
    if (!command) return;
    event.preventDefault();
    void command();
  }

  scope.listen(player, 'keydown', handleKeydown);
  return { async destroy() { scope.destroy(); } };
}
