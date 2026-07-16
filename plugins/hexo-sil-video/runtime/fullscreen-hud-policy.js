import { FULLSCREEN_UI_HIDE_DELAY } from './shared.js';

export function createFullscreenHudPolicy({ stage, video, documentRef, ui, clock, active }) {
  const { setTimeout: setTimer, clearTimeout: clearTimer } = clock;
  let timer = null;
  let hidden = false;

  function controlsKeepOpen() {
    const focused = documentRef.activeElement;
    const controlFocused = focused && focused !== video && focused !== stage && stage.contains(focused) && focused.matches(':focus-visible');
    return ui.controlsOpen() || controlFocused;
  }

  function project(value) {
    hidden = Boolean(value);
    if (hidden) stage.dataset.silVideoUiHidden = 'true';
    else delete stage.dataset.silVideoUiHidden;
  }

  function clear() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function schedule() {
    clear();
    project(false);
    if (!active() || video.paused || video.ended || controlsKeepOpen()) return;
    timer = setTimer(() => {
      timer = null;
      if (active() && !video.paused && !video.ended && !controlsKeepOpen()) project(true);
    }, FULLSCREEN_UI_HIDE_DELAY);
  }

  function show() {
    project(false);
    schedule();
  }

  function syncPlayback() {
    if (!video.paused && !video.ended) schedule();
    else { clear(); project(false); }
  }

  return { clear, hidden: () => hidden, project, schedule, show, syncPlayback };
}
