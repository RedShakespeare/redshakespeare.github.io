import JASSUB from 'jassub';
import subsrt from 'subsrt';

export const MAX_SUBTITLE_BYTES = 4 * 1024 * 1024;

async function readLimitedResponse(response) {
  if (!response.body?.getReader) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_SUBTITLE_BYTES) throw new Error('字幕文件超过 4 MiB 限制。');
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_SUBTITLE_BYTES) {
        await reader.cancel();
        throw new Error('字幕文件超过 4 MiB 限制。');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

export async function loadSubtitleText(track, signal) {
  const response = await fetch(track.url, { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error(`字幕请求返回 ${response.status}`);
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_SUBTITLE_BYTES) throw new Error('字幕文件超过 4 MiB 限制。');
  const bytes = await readLimitedResponse(response);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  return track.format === 'srt' ? subsrt.convert(source, { from: 'srt', to: 'ass' }) : source;
}

export function createSubtitleRenderer({ video, content, runtime, fonts, fallbackFont }) {
  const canvasSupported = typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined' || !canvasSupported) {
    const error = new Error('当前浏览器不支持高级字幕渲染。');
    error.code = 'SIL_VIDEO_SUBTITLE_CAPABILITY';
    throw error;
  }
  const availableFonts = { 'liberation sans': runtime.defaultFont, ...(fonts || {}) };
  return new JASSUB({
    video,
    subContent: content,
    workerUrl: runtime.worker,
    wasmUrl: runtime.wasm,
    modernWasmUrl: runtime.modernWasm,
    availableFonts,
    defaultFont: fallbackFont || 'liberation sans',
    queryFonts: false
  });
}
