import { createListenerScope } from './shared.js';

let menuSequence = 0;

export function createSubtitleMenu({ player, button, menu, tracks, onSelect, showFullscreenUi, ui }) {
  const scope = createListenerScope();
  const documentRef = player.ownerDocument;
  let selectedIndex = -1;
  let focusedIndex = -1;

  menuSequence += 1;
  menu.id = `sil-video-subtitle-menu-${menuSequence}`;
  menu.setAttribute('role', 'menu');
  button.disabled = false;
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-controls', menu.id);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-pressed', 'false');

  function options() {
    return Array.from(menu.querySelectorAll('[data-sil-video-track]'));
  }

  function focusOption(index) {
    focusedIndex = index;
    for (const option of options()) option.tabIndex = Number(option.dataset.silVideoTrack) === focusedIndex ? 0 : -1;
    menu.querySelector(`[data-sil-video-track="${focusedIndex}"]`)?.focus();
  }

  function setOpen(open, returnFocus = true) {
    menu.hidden = !open;
    ui.setSubtitleMenuOpen(open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    showFullscreenUi();
    if (open) queueMicrotask(() => focusOption(selectedIndex));
    else if (returnFocus) {
      button.focus();
      queueMicrotask(() => { if (menu.hidden) button.focus(); });
    }
  }

  function sync(index) {
    selectedIndex = index;
    for (const option of options()) {
      option.setAttribute('aria-checked', Number(option.dataset.silVideoTrack) === selectedIndex ? 'true' : 'false');
      option.tabIndex = Number(option.dataset.silVideoTrack) === focusedIndex ? 0 : -1;
    }
    button.setAttribute('aria-pressed', selectedIndex >= 0 ? 'true' : 'false');
  }

  const choices = [{ label: '关闭字幕', index: -1 }, ...tracks.map((track, index) => ({ label: track.label, index, lang: track.srclang }))];
  menu.replaceChildren();
  for (const choice of choices) {
    const option = documentRef.createElement('button');
    option.type = 'button';
    option.className = 'sil-video-player__subtitle-option';
    option.dataset.silVideoTrack = String(choice.index);
    option.setAttribute('role', 'menuitemradio');
    option.tabIndex = choice.index === -1 ? 0 : -1;
    option.setAttribute('aria-checked', choice.index === -1 ? 'true' : 'false');
    if (choice.lang) option.lang = choice.lang;
    option.textContent = choice.label;
    scope.listen(option, 'click', () => onSelect(choice.index));
    menu.append(option);
  }

  scope.listen(button, 'click', () => setOpen(menu.hidden));
  scope.listen(menu, 'keydown', event => {
    const items = options();
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false, false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const current = Math.max(0, items.findIndex(option => Number(option.dataset.silVideoTrack) === focusedIndex));
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      focusOption(Number(items[next].dataset.silVideoTrack));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(focusedIndex);
    }
  });
  scope.listen(documentRef, 'pointerdown', event => {
    if (!menu.hidden && !menu.contains(event.target) && event.target !== button) setOpen(false, false);
  });

  return {
    setOpen,
    sync,
    destroy() {
      scope.destroy();
      menu.replaceChildren();
      menu.hidden = true;
      ui.setSubtitleMenuOpen(false);
    }
  };
}
