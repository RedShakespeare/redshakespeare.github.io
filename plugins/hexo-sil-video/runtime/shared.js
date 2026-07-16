import { FULLSCREEN_UI_HIDE_DELAY, VOLUME_CLOSE_DELAY, volumeLevel } from './state-coordinator.js';

export { FULLSCREEN_UI_HIDE_DELAY, VOLUME_CLOSE_DELAY, volumeLevel };

export const selector = '.sil-video-player[data-sil-video-player]';
export const rates = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
export const VIEWPORT_CLICK_DELAY = 300;
export const FEEDBACK_HIDE_DELAY = 900;
export const PLAYBACK_FEEDBACK_HIDE_DELAY = 600;
export const TOUCH_GESTURE_THRESHOLD = 12;
export const TOUCH_SEEK_SECONDS = 60;
export const TOUCH_DOUBLE_SEEK_SECONDS = 15;
export const TOUCH_CLICK_FALLBACK_DELAY = 750;
export const GESTURE_CLICK_SUPPRESS_DELAY = 500;
export const WHEEL_PIXEL_STEP = 100;
export const WHEEL_RESET_DELAY = 250;

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remaining}` : `${minutes}:${remaining}`;
}

function luminance(value) {
  const hex = String(value || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  const rgb = String(value || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  let channels;
  if (hex) {
    const source = hex[1].length === 3 ? hex[1].split('').map(part => part + part).join('') : hex[1];
    channels = [0, 2, 4].map(offset => Number.parseInt(source.slice(offset, offset + 2), 16));
  } else if (rgb) {
    channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return channels ? (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255 : 1;
}

export function isDarkTheme() {
  const target = document.body || document.documentElement;
  return luminance(getComputedStyle(target).backgroundColor) < 0.5;
}

export function setRangeFill(input, value, maximum) {
  const percent = maximum > 0 ? clamp(value / maximum * 100, 0, 100) : 0;
  input.style.setProperty('--sil-video-range-fill', `${percent}%`);
}

export function setBufferedRanges(input, media, maximum) {
  if (!(maximum > 0) || !media.buffered || media.buffered.length === 0) {
    input.style.removeProperty('--sil-video-range-buffered');
    return;
  }
  const ranges = [];
  try {
    for (let index = 0; index < media.buffered.length; index += 1) {
      const start = clamp(media.buffered.start(index) / maximum * 100, 0, 100);
      const end = clamp(media.buffered.end(index) / maximum * 100, start, 100);
      if (end <= start) continue;
      const previous = ranges[ranges.length - 1];
      if (previous && start <= previous[1] + 0.001) previous[1] = Math.max(previous[1], end);
      else ranges.push([start, end]);
    }
  } catch {
    input.style.removeProperty('--sil-video-range-buffered');
    return;
  }
  if (ranges.length === 0) {
    input.style.removeProperty('--sil-video-range-buffered');
    return;
  }
  const stops = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Number(range[0].toFixed(3));
    const end = Number(range[1].toFixed(3));
    stops.push(
      `var(--sil-video-rail) ${cursor}%`,
      `var(--sil-video-rail) ${start}%`,
      `var(--sil-video-buffered) ${start}%`,
      `var(--sil-video-buffered) ${end}%`
    );
    cursor = end;
  }
  stops.push(`var(--sil-video-rail) ${cursor}%`, 'var(--sil-video-rail) 100%');
  input.style.setProperty('--sil-video-range-buffered', `linear-gradient(to right,${stops.join(',')})`);
}

export function createListenerScope() {
  const cleanups = [];
  return {
    listen(target, event, handler, options) {
      target.addEventListener(event, handler, options);
      cleanups.push(() => target.removeEventListener(event, handler, options));
    },
    destroy() {
      const errors = [];
      for (const cleanup of cleanups.splice(0)) {
        try { cleanup(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw createCleanupError('Listener scope cleanup failed.', errors);
    }
  };
}

export function createCleanupError(message, errors) {
  const error = new Error(message);
  error.name = 'CleanupError';
  error.errors = errors;
  return error;
}

export function appendCleanupError(errors, error) {
  if (error?.name === 'CleanupError' && Array.isArray(error.errors)) errors.push(...error.errors);
  else errors.push(error);
}

export function errorMessage(error, fallback = '未知错误') {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

export function focusWithoutScroll(target) {
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}
