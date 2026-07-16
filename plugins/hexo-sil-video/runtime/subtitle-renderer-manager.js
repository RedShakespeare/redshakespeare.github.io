import { createCleanupError } from './shared.js';
import { applyActiveRendererTrack } from './subtitle-active-renderer-transaction.js';
import { createCandidateRendererLifecycle } from './subtitle-candidate-renderer-lifecycle.js';

export function createSubtitleRendererManager({
  video,
  model,
  rendererFactory = null,
  diagnostics,
  isCurrent = () => true
}) {
  let renderer = null;
  let renderQueue = Promise.resolve();
  let renderError = null;
  let destroyed = false;
  const destroyedRenderers = new WeakSet();

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
      diagnostics.report('subtitle.destroy', error);
      throw error;
    }
  }

  const candidates = createCandidateRendererLifecycle({
    createRenderer: args => args.factory(args.options),
    destroyRenderer,
    isCurrent
  });

  async function applyTrack({ runtime, content, oldContent, token }) {
    if (renderer) {
      return applyActiveRendererTrack({
        renderer,
        content,
        oldContent,
        isCurrent,
        token,
        clear: active => { if (renderer === active) renderer = null; },
        destroy: destroyRenderer
      });
    }

    const candidate = await candidates.create({
      factory: rendererFactory || runtime.createSubtitleRenderer,
      options: {
        video,
        content,
        runtime: model.runtime,
        fonts: model.fonts,
        fallbackFont: model.fallbackFont
      }
    }, token);
    if (candidate) renderer = candidate;
    return candidate;
  }

  async function freeTrack() {
    if (!renderer) return;
    await renderer.ready;
    await renderer.renderer.freeTrack();
  }

  async function loadTrack(args) {
    await candidates.cancel();
    return enqueue(async () => {
      if (!isCurrent(args.token)) return null;
      return applyTrack(args);
    });
  }

  async function disableTrack(token) {
    await candidates.cancel();
    return enqueue(async () => {
      if (!isCurrent(token)) return false;
      await freeTrack();
      return true;
    });
  }

  return {
    loadTrack,
    disableTrack,
    async resize() {
      if (!destroyed && renderer) await renderer.resize(true);
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      const errors = [];
      try { await candidates.cancel(); } catch (error) { errors.push(error); }
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
