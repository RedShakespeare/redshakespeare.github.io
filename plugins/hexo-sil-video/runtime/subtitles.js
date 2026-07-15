import JASSUB from 'jassub';
import subsrt from 'subsrt';

export async function loadSubtitleText(track, signal) {
  const response = await fetch(track.url, { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error(`字幕请求返回 ${response.status}`);
  const bytes = await response.arrayBuffer();
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  return track.format === 'srt' ? subsrt.convert(source, { from: 'srt', to: 'ass' }) : source;
}

export function createSubtitleRenderer({ video, content, runtime, fonts, fallbackFont }) {
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
