import { createListenerScope } from './shared.js';

let menuSequence = 0;

export function createSubtitleController({
  player,
  video,
  button,
  menu,
  model,
  setStatus,
  showFullscreenUi
}) {
  const tracks = Array.isArray(model.subtitles) ? model.subtitles : [];
  const scope = createListenerScope();
  let renderer = null;
  let abortController = null;
  let requestToken = 0;
  let selectedIndex = -1;
  let pendingIndex = tracks.findIndex(track => track.default);
  let modulePromise = null;
  let destroyed = false;

  menuSequence += 1;
  menu.id = `sil-video-subtitle-menu-${menuSequence}`;
  menu.setAttribute('role', 'menu');
  button.disabled = false;
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-controls', menu.id);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-pressed', 'false');

  function setMenuOpen(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    showFullscreenUi();
  }

  function syncButtons() {
    menu.querySelectorAll('[data-sil-video-track]').forEach(option => {
      option.setAttribute('aria-checked', Number(option.dataset.silVideoTrack) === selectedIndex ? 'true' : 'false');
    });
    button.setAttribute('aria-pressed', selectedIndex >= 0 ? 'true' : 'false');
  }

  function loadModule() {
    if (!modulePromise) modulePromise = import(model.runtime.subtitles);
    return modulePromise;
  }

  async function select(index) {
    const token = ++requestToken;
    pendingIndex = -1;
    abortController?.abort();
    abortController = new AbortController();
    setMenuOpen(false);
    if (index < 0) {
      selectedIndex = -1;
      syncButtons();
      if (renderer) {
        try {
          await renderer.ready;
          await renderer.renderer.freeTrack();
        } catch {
          // Renderer creation failures are reported by the selection that created it.
        }
      }
      setStatus();
      return;
    }
    const track = tracks[index];
    if (!track) return;
    setStatus(`正在加载${track.label}字幕…`);
    try {
      const subtitleRuntime = await loadModule();
      if (destroyed || token !== requestToken) return;
      const content = await subtitleRuntime.loadSubtitleText(track, abortController.signal);
      if (destroyed || token !== requestToken) return;
      if (renderer) {
        await renderer.ready;
        await renderer.renderer.setTrack(content);
      } else {
        renderer = subtitleRuntime.createSubtitleRenderer({
          video,
          content,
          runtime: model.runtime,
          fonts: model.fonts,
          fallbackFont: model.fallbackFont
        });
        await renderer.ready;
      }
      if (destroyed || token !== requestToken) return;
      selectedIndex = index;
      syncButtons();
      setStatus();
    } catch (error) {
      if (error.name === 'AbortError' || destroyed || token !== requestToken) return;
      selectedIndex = -1;
      syncButtons();
      setStatus(`字幕加载失败：${error.message}`, true);
    }
  }

  function activatePending() {
    if (pendingIndex < 0) return;
    const index = pendingIndex;
    pendingIndex = -1;
    select(index);
  }

  function buildMenu() {
    menu.replaceChildren();
    const choices = [{ label: '关闭字幕', index: -1 }, ...tracks.map((track, index) => ({ label: track.label, index, lang: track.srclang }))];
    for (const choice of choices) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'sil-video-player__subtitle-option';
      option.dataset.silVideoTrack = String(choice.index);
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', choice.index === -1 ? 'true' : 'false');
      if (choice.lang) option.lang = choice.lang;
      option.textContent = choice.label;
      scope.listen(option, 'click', () => select(choice.index));
      menu.append(option);
    }
  }

  scope.listen(button, 'click', () => setMenuOpen(menu.hidden));
  scope.listen(menu, 'keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setMenuOpen(false);
  });
  if (pendingIndex >= 0) {
    scope.listen(player, 'focusin', activatePending);
    scope.listen(player, 'keydown', activatePending);
    scope.listen(player, 'pointerdown', activatePending);
    scope.listen(player, 'wheel', activatePending);
  }
  buildMenu();

  return {
    activatePending,
    async resize() {
      if (renderer) await renderer.resize(true);
    },
    select,
    async destroy() {
      destroyed = true;
      requestToken += 1;
      abortController?.abort();
      scope.destroy();
      if (renderer) {
        try { await renderer.destroy(); } catch { /* The page is already being discarded. */ }
      }
    }
  };
}
