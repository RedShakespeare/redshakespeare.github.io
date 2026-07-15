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
const failures = new WeakMap();
const dirtyPlayers = new Set();
const diagnostics = createDiagnostics();
let runtimeDestroyed = false;
let refreshScheduled = false;

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

function recordFailure(player, source, scope, error, message = error.message) {
  const previous = failures.get(player);
  if (previous && previous.source === source) return;
  failures.set(player, { source, scope, message });
  showFallbackError(player, message);
  diagnostics.report(scope, error);
}

function initialise(player) {
  if (instances.has(player) || destroying.has(player) || player.dataset.silVideoReady === 'true') return;
  const source = player.dataset.silVideoModel || '';
  const previousFailure = failures.get(player);
  if (previousFailure && previousFailure.source === source) return;
  if (previousFailure) failures.delete(player);
  let refs;
  try {
    refs = createPlayerView(player);
  } catch (error) {
    recordFailure(player, source, 'view', error);
    return;
  }

  let model;
  try {
    model = parseModel(player);
  } catch (error) {
    recordFailure(player, source, 'model', error);
    return;
  }

  const controllers = [];
  let subtitleController = null;
  let interactionController = null;
  const state = createStateCoordinator({
    player,
    status: refs.status
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
    failures.delete(player);
    instance.refreshTheme();
  } catch (error) {
    for (const controller of controllers.reverse()) Promise.resolve(controller.destroy()).catch(destroyError => {
      diagnostics.report('destroy', destroyError);
    });
    refs.video.controls = true;
    state.destroy();
    ui.destroy();
    recordFailure(player, source, 'initialise', error, `播放器初始化失败：${error.message}`);
  }
}

function refreshPlayer(player) {
  if (!player?.matches?.(selector)) return;
  initialise(player);
  instances.get(player)?.refreshTheme();
}

function playersWithin(root) {
  if (!root) return [];
  const players = root.matches?.(selector) ? [root] : [];
  if (root.querySelectorAll) players.push(...root.querySelectorAll(selector));
  return players;
}

function flushDirtyPlayers() {
  refreshScheduled = false;
  if (runtimeDestroyed) {
    dirtyPlayers.clear();
    return;
  }
  const pending = Array.from(dirtyPlayers);
  dirtyPlayers.clear();
  pending.forEach(refreshPlayer);
}

function schedulePlayers(players) {
  for (const player of players) dirtyPlayers.add(player);
  if (refreshScheduled || dirtyPlayers.size === 0) return;
  refreshScheduled = true;
  queueMicrotask(flushDirtyPlayers);
}

function refresh(root = document) {
  playersWithin(root).forEach(player => {
    initialise(player);
    instances.get(player)?.refreshTheme();
  });
}

function refreshThemes() {
  for (const instance of instances.values()) instance.refreshTheme();
}

function handleInside(event) {
  const root = event?.detail?.root;
  if (root?.querySelectorAll || root?.matches) schedulePlayers(playersWithin(root));
  else refresh();
}

function destroyRemoved(node) {
  if (!(node instanceof Element)) return;
  const players = node.matches(selector) ? [node] : Array.from(node.querySelectorAll(selector));
  for (const player of players) instances.get(player)?.destroy();
}

function observeMutations(records) {
  const added = [];
  for (const record of records) {
    for (const node of record.removedNodes) destroyRemoved(node);
    for (const node of record.addedNodes) {
      if (node instanceof Element) added.push(...playersWithin(node));
    }
  }
  schedulePlayers(added);
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
      dirtyPlayers.clear();
      window.removeEventListener('resize', refreshThemes);
      document.removeEventListener('inside', handleInside);
      document.removeEventListener('inside:theme', refreshThemes);
      const pending = Array.from(instances.values(), instance => instance.destroy());
      await Promise.allSettled(pending);
      delete window.__hexoSilVideoRefresh;
      delete window.__hexoSilVideoRuntime;
    }
  };
  window.__hexoSilVideoRuntime = runtime;
  window.__hexoSilVideoRefresh = refresh;
  window.addEventListener('resize', refreshThemes);
  document.addEventListener('inside', handleInside);
  document.addEventListener('inside:theme', refreshThemes);
  observer.observe(document.body, { childList: true, subtree: true });
  refresh();
}
