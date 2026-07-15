import {
  FEEDBACK_HIDE_DELAY,
  PLAYBACK_FEEDBACK_HIDE_DELAY,
  clamp,
  formatTime
} from './shared.js';

export function createFeedbackController({ video, mediaLayer, feedback, feedbackText, clock = null }) {
  const windowRef = video.ownerDocument.defaultView;
  const setTimer = clock?.setTimeout || ((handler, delay) => windowRef.setTimeout(handler, delay));
  const clearTimer = clock?.clearTimeout || (value => windowRef?.clearTimeout(value));
  let timer = null;
  let brightness = 1;

  function show(kind, message, delay = FEEDBACK_HIDE_DELAY, label = '') {
    if (timer !== null) clearTimer(timer);
    timer = null;
    feedback.dataset.silVideoFeedbackKind = kind;
    feedback.dataset.silVideoFeedbackVisible = 'true';
    feedbackText.textContent = message;
    if (label) feedback.setAttribute('aria-label', label);
    else feedback.removeAttribute('aria-label');
    timer = setTimer(() => {
      timer = null;
      delete feedback.dataset.silVideoFeedbackVisible;
    }, delay);
  }

  function setBrightness(value, announce = true) {
    brightness = clamp(value, 0, 2);
    mediaLayer.style.setProperty('--sil-video-brightness', String(brightness));
    if (announce) show('brightness', `${Math.round(brightness * 100)}%`);
  }

  setBrightness(1, false);
  return {
    getBrightness: () => brightness,
    setBrightness,
    showPlayback(action) {
      show(`playback-${action}`, '', PLAYBACK_FEEDBACK_HIDE_DELAY, action === 'play' ? '播放' : '暂停');
    },
    showProgress(position = video.currentTime) {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      show('progress', `${formatTime(position)}/${formatTime(video.duration)}`);
    },
    showVolume() {
      const effectiveVolume = video.muted ? 0 : video.volume;
      show('volume', `${Math.round(effectiveVolume * 100)}%`);
    },
    destroy() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    }
  };
}
