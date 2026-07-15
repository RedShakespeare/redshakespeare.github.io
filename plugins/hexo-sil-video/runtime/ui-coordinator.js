export function createUiCoordinator({ player } = {}) {
  const state = { volumeOpen: false, subtitleMenuOpen: false };

  function project() {
    if (!player) return;
    player.dataset.silVideoVolumeOpen = state.volumeOpen ? 'true' : 'false';
  }

  return {
    setVolumeOpen(open) { state.volumeOpen = Boolean(open); project(); },
    setSubtitleMenuOpen(open) { state.subtitleMenuOpen = Boolean(open); },
    controlsOpen() { return state.volumeOpen || state.subtitleMenuOpen; },
    volumeOpen() { return state.volumeOpen; },
    subtitleMenuOpen() { return state.subtitleMenuOpen; },
    destroy() {
      state.volumeOpen = false;
      state.subtitleMenuOpen = false;
      if (player) delete player.dataset.silVideoVolumeOpen;
    }
  };
}
