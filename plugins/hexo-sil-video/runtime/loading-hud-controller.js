import { createMediaTransferMeter } from './media-transfer-meter.js';

const SAMPLE_INTERVAL = 500;
const SPEED_WINDOW = 2000;

function formatSpeed(bytesPerSecond) {
  const value = Math.max(0, Number(bytesPerSecond) || 0);
  if (value < 1024) return `${Math.round(value)}B/s`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)}KB/s`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB/s`;
}

export function createLoadingHudController({ video, loading, loadingSpeed, clock, sourceSize = null, readDownloadedBytes }) {
  const readBytes = readDownloadedBytes || createMediaTransferMeter({ video, sourceSize }).readBytes;
  let timer = null;
  let samples = [];

  function resetSamples() {
    samples = [];
  }

  function recordSample(now, bytes) {
    const previous = samples[samples.length - 1];
    if (previous && bytes < previous.bytes) resetSamples();
    samples.push({ at: now, bytes });
    const cutoff = now - SPEED_WINDOW;
    while (samples.length > 2 && samples[1].at <= cutoff) samples.shift();
    if (samples.length < 2) return;
    const baseline = samples[0];
    if (now > baseline.at) loadingSpeed.textContent = formatSpeed((bytes - baseline.bytes) * 1000 / (now - baseline.at));
  }

  function sample() {
    if (timer === null) return;
    const now = clock.now();
    const bytes = readBytes();
    if (!(Number.isFinite(bytes) && bytes >= 0)) {
      resetSamples();
      loadingSpeed.textContent = '--KB/s';
    } else recordSample(now, bytes);
    timer = clock.setTimeout(sample, SAMPLE_INTERVAL);
  }

  function show() {
    if (video.paused || video.ended) return;
    if (timer === null) {
      resetSamples();
      loadingSpeed.textContent = '--KB/s';
      loading.hidden = false;
      timer = clock.setTimeout(sample, 0);
    }
  }

  function hide() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    resetSamples();
    loading.hidden = true;
  }

  return { show, hide, destroy: hide };
}
