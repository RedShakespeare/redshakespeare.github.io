'use strict';

function icon(name, paths) {
  return `<svg class="sil-video-player__icon sil-video-player__icon--${name}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

function createVideoIcons() {
  const speaker = '<path d="M3 10v4h4l5 4V6L7 10z"/>';
  return {
    icon,
    playIcon: icon('play', '<path d="M8 5v14l11-7z"/>') + icon('pause', '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>') + icon('replay', '<path d="M12 5a7 7 0 1 1-6.3 4H3l4-4 4 4H7.8A5 5 0 1 0 12 7z"/>'),
    volumeIcon: icon('volume-low', `${speaker}<path d="M14.5 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>`) +
      icon('volume-medium', `${speaker}<path d="M14.5 9.5a3.5 3.5 0 0 1 0 5m2-7a6.5 6.5 0 0 1 0 9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>`) +
      icon('volume-high', `${speaker}<path d="M14.5 9.5a3.5 3.5 0 0 1 0 5m2-7a6.5 6.5 0 0 1 0 9m2-11a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>`) +
      icon('muted', `${speaker}<path d="m14 9 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"/>`),
    feedbackIcon: icon('feedback-volume', `${speaker}<path d="M14.5 9.5a3.5 3.5 0 0 1 0 5m2-7a6.5 6.5 0 0 1 0 9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>`),
    brightnessIcon: icon('feedback-brightness', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>'),
    feedbackPlayIcon: icon('feedback-play', '<path d="M8 5v14l11-7z"/>'),
    feedbackPauseIcon: icon('feedback-pause', '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>')
  };
}

module.exports = { createVideoIcons };
