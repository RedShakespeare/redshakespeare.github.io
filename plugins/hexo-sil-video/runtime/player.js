import { createFullscreenController } from './fullscreen-controller.js';
import { createFeedbackController } from './feedback-controller.js';
import { createInteractionController } from './interaction-controller.js';
import { createMediaController } from './media-controller.js';
import { isDarkTheme, selector } from './shared.js';
import { createSubtitleController } from './subtitle-controller.js';
import { createStateCoordinator } from './state-coordinator.js';
import { createPlayerView } from './view.js';
import { createUiCoordinator } from './ui-coordinator.js';
import { createDiagnostics } from './diagnostics.js';
import contract from '../lib/player-contract.js';

const instances = new Map();
const destroying = new WeakMap();
const diagnostics = createDiagnostics();
let runtimeDestroyed = false;

function parseModel(player) {
  const source = player.dataset.silVideoModel;
  if (!source) throw new Error('播放器配置缺失。');
  const bytes = Uint8Array.from(atob(source), character => character.charCodeAt(0));
  const model = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (model.version !== contract.MODEL_VERSION || !Array.isArray(model.subtitles) || !model.runtime?.subtitles) {
    throw new Error('播放器配置版本不受支持。');
  }
  return model;
}

function showFallbackError(player, message) {
  player.dataset.silVideoError = 'true';
  const header = player.querySelector('[data-sil-video-fallback-status]');
  const status = player.querySelector('[data-sil-video-status]');
  if (header) header.hidden = false;
  if (status) status.textContent = message;
}

function initialise(player) {
  if (instances.has(player) || destroying.has(player) || player.dataset.silVideoReady === 'true') return;
  let refs;
  try {
    refs = createPlayerView(player);
  } catch (error) {
    showFallbackError(player, error.message);
    diagnostics.report('view', error);
    return;
  }

  let model;
  try {
    model = parseModel(player);
  } catch (error) {
    showFallbackError(player, error.message);
    diagnostics.report('model', error);
    return;
  }

  const controllers = [];
  let subtitleController = null;
  let interactionController = null;
  const state = createStateCoordinator({
    player,
    status: refs.status,
    fallback: player.querySelector('[data-sil-video-fallback-status]')
  });
  const ui = createUiCoordinator({ player });
  try {
    const feedbackController = createFeedbackController(refs);
    controllers.push(feedbackController);
    const fullscreenController = createFullscreenController({
      player,
      video: refs.video,
      stage: refs.stage,
      fullscreen: refs.fullscreen,
      resizeSubtitles: async () => subtitleController?.resize(),
      state,
      ui,
      diagnostics
    });
    controllers.push(fullscreenController);

    const mediaController = createMediaController({
      ...refs,
      onPlaybackStateChange: fullscreenController.syncPlayback,
      onPlayInteraction: () => subtitleController?.activatePending(),
      state,
      feedbackController,
      diagnostics
    });
    controllers.push(mediaController);

    const tracks = Array.isArray(model.subtitles) ? model.subtitles : [];
    if (tracks.length > 0) {
      subtitleController = createSubtitleController({
        player,
        video: refs.video,
        button: refs.subtitles,
        menu: refs.subtitleMenu,
        model,
        setStatus: mediaController.setStatus,
        showFullscreenUi: fullscreenController.showUi,
        state,
        ui,
        diagnostics
      });
      controllers.push(subtitleController);
    } else {
      refs.subtitles.disabled = true;
      refs.subtitles.removeAttribute('aria-haspopup');
      refs.subtitles.removeAttribute('aria-controls');
      refs.subtitles.removeAttribute('aria-expanded');
      refs.subtitles.removeAttribute('aria-pressed');
      refs.subtitleMenu.replaceChildren();
      refs.subtitleMenu.hidden = true;
    }

    interactionController = createInteractionController({
      ...refs,
      media: mediaController,
      fullscreen: fullscreenController,
      state,
      ui
    });
    controllers.push(interactionController);
    fullscreenController.setPointerActivityGuard(event => interactionController.pendingHiddenTouchTap(event));

    refs.video.controls = false;
    player.dataset.silVideoReady = 'true';
    player.dataset.silVideoEnhanced = 'true';
    player.querySelectorAll('[data-sil-video-controls]').forEach(control => { control.hidden = false; });

    let destroyed = false;
    const instance = {
      refreshTheme() { player.dataset.silVideoTheme = isDarkTheme() ? 'dark' : 'light'; },
      destroy() {
        if (destroyed) return destroying.get(player) || Promise.resolve();
        destroyed = true;
        const pending = Promise.allSettled(controllers.reverse().map(controller => {
          try { return controller.destroy(); } catch (error) { return Promise.reject(error); }
        }));
        pending.then(results => results.filter(result => result.status === 'rejected').forEach(result => {
          diagnostics.report('destroy', result.reason);
        }));
        refs.video.controls = true;
        delete player.dataset.silVideoReady;
        delete player.dataset.silVideoEnhanced;
        instances.delete(player);
        destroying.set(player, pending);
        pending.finally(() => {
          state.destroy();
          ui.destroy();
          if (destroying.get(player) !== pending) return;
          destroying.delete(player);
          if (!runtimeDestroyed && player.isConnected) initialise(player);
        });
        return pending;
      }
    };
    instances.set(player, instance);
    instance.refreshTheme();
  } catch (error) {
    for (const controller of controllers.reverse()) Promise.resolve(controller.destroy()).catch(destroyError => {
      diagnostics.report('destroy', destroyError);
    });
    refs.video.controls = true;
    state.destroy();
    ui.destroy();
    showFallbackError(player, `播放器初始化失败：${error.message}`);
  }
}

function refresh() {
  document.querySelectorAll(selector).forEach(player => {
    initialise(player);
    instances.get(player)?.refreshTheme();
  });
}

function destroyRemoved(node) {
  if (!(node instanceof Element)) return;
  const players = node.matches(selector) ? [node] : Array.from(node.querySelectorAll(selector));
  for (const player of players) instances.get(player)?.destroy();
}

function observeMutations(records) {
  let added = false;
  for (const record of records) {
    for (const node of record.removedNodes) destroyRemoved(node);
    if (Array.from(record.addedNodes).some(node => node instanceof Element && (node.matches(selector) || node.querySelector(selector)))) added = true;
  }
  if (added) refresh();
}

if (window.__hexoSilVideoRuntime) {
  window.__hexoSilVideoRuntime.refresh();
} else {
  const observer = new MutationObserver(observeMutations);
  const runtime = {
    refresh,
    async destroy() {
      runtimeDestroyed = true;
      observer.disconnect();
      window.removeEventListener('resize', refresh);
      document.removeEventListener('inside', refresh);
      document.removeEventListener('inside:theme', refresh);
      const pending = Array.from(instances.values(), instance => instance.destroy());
      await Promise.allSettled(pending);
      delete window.__hexoSilVideoRefresh;
      delete window.__hexoSilVideoRuntime;
    }
  };
  window.__hexoSilVideoRuntime = runtime;
  window.__hexoSilVideoRefresh = refresh;
  window.addEventListener('resize', refresh);
  document.addEventListener('inside', refresh);
  document.addEventListener('inside:theme', refresh);
  observer.observe(document.body, { childList: true, subtree: true });
  refresh();
}
