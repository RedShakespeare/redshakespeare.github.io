import { normaliseError } from './shared.js';

export async function applyActiveRendererTrack({ renderer, content, oldContent, isCurrent, token, clear, destroy }) {
  await renderer.ready;
  try {
    await renderer.renderer.setTrack(content);
    if (!isCurrent(token)) {
      if (oldContent) await renderer.renderer.setTrack(oldContent);
      else await renderer.renderer.freeTrack();
      return null;
    }
    return renderer;
  } catch (error) {
    error = normaliseError(error);
    if (oldContent) {
      try {
        await renderer.renderer.setTrack(oldContent);
      } catch (rollbackError) {
        clear(renderer);
        try { await destroy(renderer); } catch (destroyError) { error.destroyError = destroyError; }
        throw Object.assign(error, { rollbackError });
      }
    } else {
      clear(renderer);
      try { await destroy(renderer); } catch (destroyError) { error.destroyError = destroyError; }
    }
    throw error;
  }
}
