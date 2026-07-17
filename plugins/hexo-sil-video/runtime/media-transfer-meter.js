function nativeBytesReader(video) {
  const field = ['bytesReceived', 'webkitBytesReceived']
    .find(name => Number.isFinite(Number(video[name])) && Number(video[name]) >= 0);
  return field ? () => Number(video[field]) : null;
}

function performanceBytesReader(video) {
  return () => {
    const performanceRef = video.ownerDocument?.defaultView?.performance;
    if (!performanceRef?.getEntriesByName) return null;
    try {
      const entries = performanceRef.getEntriesByName(video.currentSrc || video.src || '');
      let measured = false;
      const total = entries.reduce((sum, entry) => {
        const bytes = Number(entry?.transferSize || entry?.encodedBodySize || entry?.decodedBodySize);
        if (!(Number.isFinite(bytes) && bytes > 0)) return sum;
        measured = true;
        return sum + bytes;
      }, 0);
      return measured ? total : null;
    } catch {
      return null;
    }
  };
}

function bufferedRanges(video, duration) {
  const ranges = [];
  try {
    for (let index = 0; index < video.buffered.length; index += 1) {
      const start = Math.max(0, Math.min(duration, Number(video.buffered.start(index))));
      const end = Math.max(start, Math.min(duration, Number(video.buffered.end(index))));
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) ranges.push([start, end]);
    }
  } catch {
    return null;
  }
  return ranges;
}

function rangesDuration(ranges) {
  return ranges.reduce((total, [start, end]) => total + end - start, 0);
}

function addedDuration(current, previous) {
  let total = 0;
  let previousIndex = 0;
  for (const [start, end] of current) {
    let cursor = start;
    while (previousIndex < previous.length && previous[previousIndex][1] <= cursor) previousIndex += 1;
    let index = previousIndex;
    while (index < previous.length && previous[index][0] < end) {
      if (previous[index][0] > cursor) total += Math.min(end, previous[index][0]) - cursor;
      cursor = Math.max(cursor, previous[index][1]);
      if (cursor >= end) break;
      index += 1;
    }
    if (cursor < end) total += end - cursor;
    previousIndex = index;
  }
  return total;
}

function bufferedBytesReader(video, sourceSize) {
  let duration = null;
  let previous = null;
  let transferred = 0;
  return () => {
    const nextDuration = Number(video.duration);
    if (!(Number.isFinite(nextDuration) && nextDuration > 0)) return null;
    const current = bufferedRanges(video, nextDuration);
    if (current === null) return null;
    if (duration !== nextDuration || previous === null) {
      transferred = sourceSize * rangesDuration(current) / nextDuration;
      duration = nextDuration;
    } else {
      transferred += sourceSize * addedDuration(current, previous) / nextDuration;
    }
    previous = current;
    return transferred;
  };
}

export function createMediaTransferMeter({ video, sourceSize }) {
  const native = nativeBytesReader(video);
  const size = Number(sourceSize);
  const fallback = Number.isFinite(size) && size > 0
    ? bufferedBytesReader(video, size)
    : performanceBytesReader(video);
  return { readBytes: native || fallback };
}
