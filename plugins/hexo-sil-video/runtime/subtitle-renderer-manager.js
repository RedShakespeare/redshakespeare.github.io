import { createCleanupError } from './shared.js';

export function createSubtitleRendererManager({
  video,
  model,
  rendererFactory = null,
  diagnostics = null,
  isCurrent = () => true
}) {
  let renderer = null;
  let candidateRenderer = null;
  let renderQueue = Promise.resolve();
  let renderError = null;
  let destroyed = false;
  const destroyedRenderers = new WeakSet();
  const candidateCancellations = new WeakMap();

  function enqueue(task) {
    const pending = renderQueue.then(task, task);
    renderQueue = pending.catch(error => {
      if (destroyed) renderError = error;
    });
    return pending;
  }

  async function destroyRenderer(candidate) {
    if (!candidate || destroyedRenderers.has(candidate)) return;
    destroyedRenderers.add(candidate);
    try {
      await candidate.destroy?.();
    } catch (error) {
      diagnostics?.report('subtitle.destroy', error);
      throw error;
    }
  }

  async function cancelCandidate() {
    const candidate = candidateRenderer;
    if (!candidate) return;
    candidateRenderer = null;
    const cancellation = candidateCancellations.get(candidate);
    const cleanup = destroyRenderer(candidate);
    if (cancellation) cleanup.then(cancellation.resolve, cancellation.reject);
    await cleanup;
  }

  async function applyTrack({ runtime, content, oldContent, token }) {
    if (renderer) {
      const activeRenderer = renderer;
      await activeRenderer.ready;
      try {
        await activeRenderer.renderer.setTrack(content);
        if (!isCurrent(token)) {
          if (oldContent) await activeRenderer.renderer.setTrack(oldContent);
          else await activeRenderer.renderer.freeTrack();
          return null;
        }
        return activeRenderer;
      } catch (error) {
        if (oldContent) {
          try {
            await activeRenderer.renderer.setTrack(oldContent);
          } catch (rollbackError) {
            if (renderer === activeRenderer) renderer = null;
            try { await destroyRenderer(activeRenderer); } catch (destroyError) { error.destroyError = destroyError; }
            throw Object.assign(error, { rollbackError });
          }
        } else {
          if (renderer === activeRenderer) renderer = null;
          try { await destroyRenderer(activeRenderer); } catch (destroyError) { error.destroyError = destroyError; }
        }
        throw error;
      }
    }

    const candidate = (rendererFactory || runtime.createSubtitleRenderer)({
      video,
      content,
      runtime: model.runtime,
      fonts: model.fonts,
      fallbackFont: model.fallbackFont
    });
    candidateRenderer = candidate;
    let resolveCancellation;
    let rejectCancellation;
    candidateCancellations.set(candidate, {
      promise: new Promise((resolve, reject) => {
        resolveCancellation = resolve;
        rejectCancellation = reject;
      }),
      resolve: resolveCancellation,
      reject: rejectCancellation
    });
    try {
      await Promise.race([candidate.ready, candidateCancellations.get(candidate).promise]);
      if (candidateRenderer !== candidate || !isCurrent(token)) {
        await destroyRenderer(candidate);
        candidateCancellations.delete(candidate);
        return null;
      }
      renderer = candidate;
      candidateRenderer = null;
      candidateCancellations.delete(candidate);
      return candidate;
    } catch (error) {
      if (candidateRenderer === candidate) candidateRenderer = null;
      candidateCancellations.delete(candidate);
      await destroyRenderer(candidate);
      throw error;
    }
  }

  async function freeTrack() {
    if (!renderer) return;
    await renderer.ready;
    await renderer.renderer.freeTrack();
  }

  return {
    enqueue,
    cancelCandidate,
    applyTrack,
    freeTrack,
    async resize() {
      if (!destroyed && renderer) await renderer.resize(true);
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      const errors = [];
      try { await cancelCandidate(); } catch (error) { errors.push(error); }
      try { await renderQueue; } catch (error) { errors.push(error); }
      if (renderError) { errors.push(renderError); renderError = null; }
      if (renderer) {
        const current = renderer;
        renderer = null;
        try { await destroyRenderer(current); } catch (error) { errors.push(error); }
      }
      if (errors.length) {
        if (errors.length === 1) throw errors[0];
        throw createCleanupError('Subtitle renderer cleanup failed.', errors);
      }
    }
  };
}
