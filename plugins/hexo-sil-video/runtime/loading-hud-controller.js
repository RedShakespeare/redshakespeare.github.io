const SAMPLE_INTERVAL = 500;

function formatSpeed(bytesPerSecond) {
  const value = Math.max(0, Number(bytesPerSecond) || 0);
  if (value < 1024) return `${Math.round(value)}B/s`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)}KB/s`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB/s`;
}

function createDownloadedBytesReader(video) {
  return () => {
    const direct = Number(video.bytesReceived ?? video.webkitBytesReceived);
    if (Number.isFinite(direct) && direct >= 0) return direct;
    const performanceRef = video.ownerDocument?.defaultView?.performance;
    if (!performanceRef?.getEntriesByName) return null;
    try {
      const entries = performanceRef.getEntriesByName(video.currentSrc || video.src || '');
      if (entries.length === 0) return null;
      return entries.reduce((total, entry) => {
        const bytes = Number(entry?.transferSize || entry?.encodedBodySize || entry?.decodedBodySize);
        return total + (Number.isFinite(bytes) && bytes >= 0 ? bytes : 0);
      }, 0);
    } catch {
      return null;
    }
  };
}

export function createLoadingHudController({ video, loading, loadingSpeed, clock, readDownloadedBytes = createDownloadedBytesReader(video) }) {
  let timer = null;
  let lastBytes = null;
  let lastSampleAt = null;
  function sample() {
    if (timer === null) return;
    const now = clock.now();
    const bytes = readDownloadedBytes();
    if (bytes !== null && lastBytes !== null && lastSampleAt !== null && now > lastSampleAt && bytes >= lastBytes) {
      loadingSpeed.textContent = formatSpeed((bytes - lastBytes) * 1000 / (now - lastSampleAt));
    }
    if (bytes !== null) {
      lastBytes = bytes;
      lastSampleAt = now;
    }
    timer = clock.setTimeout(sample, SAMPLE_INTERVAL);
  }

  function show() {
    if (video.paused || video.ended) return;
    if (timer === null) {
      lastBytes = null;
      lastSampleAt = null;
      loadingSpeed.textContent = '0KB/s';
      loading.hidden = false;
      timer = clock.setTimeout(sample, 0);
    }
  }

  function hide() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    lastBytes = null;
    lastSampleAt = null;
    loading.hidden = true;
  }

  return { show, hide, destroy: hide };
}
