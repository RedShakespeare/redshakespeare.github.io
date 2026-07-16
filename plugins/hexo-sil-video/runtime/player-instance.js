import { createFullscreenController } from './fullscreen-controller.js';
import { createFeedbackController } from './feedback-controller.js';
import { createInteractionController } from './interaction-controller.js';
import { createMediaController } from './media-controller.js';
import { isDarkTheme } from './shared.js';
import { createSubtitleController } from './subtitle-controller.js';
import { createPlayerView } from './view.js';
import { assertRuntimeServices, createRuntimeServices } from './runtime-services.js';
import { destroyControllersInReverse } from './controller-lifecycle.js';
import contract from '../lib/player-contract.js';

function parseModel(player) {
  const source = player.dataset.silVideoModel;
  if (!source) throw new Error('播放器配置缺失。');
  const bytes = Uint8Array.from(atob(source), character => character.charCodeAt(0));
  const model = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const routes = ['subtitles', 'worker', 'wasm', 'modernWasm', 'defaultFont'];
  const validRoutes = routes.every(name => typeof model.runtime?.[name] === 'string' && model.runtime[name]);
  const validFonts = model.fonts && typeof model.fonts === 'object' && !Array.isArray(model.fonts)
    && Object.values(model.fonts).every(value => typeof value === 'string' && value);
  if (model.version !== contract.MODEL_VERSION || !Array.isArray(model.subtitles) || !validRoutes || !validFonts || typeof model.fallbackFont !== 'string') {
    throw new Error('播放器配置版本不受支持。');
  }
  return model;
}

function createPlayerInstance({ player, services }) {
  const refs = createPlayerView(player);
  const initialControls = Array.from(player.querySelectorAll('[data-sil-video-controls]'), control => ({ control, hidden: control.hidden }));
  const initialNativeControls = refs.video.controls;
  const model = parseModel(player);
  services = services
    ? assertRuntimeServices(services)
    : createRuntimeServices({ player, status: refs.status, windowRef: player.ownerDocument.defaultView });
  const { state, ui, diagnostics } = services;
  const controllers = [];
  let destroyPromise = null;
  const subtitleBinding = {
    controller: null,
    resize() { return this.controller ? this.controller.resize() : Promise.resolve(); },
    activatePending() { this.controller?.activatePending(); }
  };

  function addController(controller) {
    controllers.push(controller);
    return controller;
  }

  function disableSubtitles() {
    refs.subtitles.disabled = true;
    refs.subtitles.removeAttribute('aria-haspopup');
    refs.subtitles.removeAttribute('aria-controls');
    refs.subtitles.removeAttribute('aria-expanded');
    refs.subtitles.removeAttribute('aria-pressed');
    refs.subtitleMenu.replaceChildren();
    refs.subtitleMenu.hidden = true;
  }

  function mount() {
    const feedbackController = addController(createFeedbackController({
      video: refs.video,
      mediaLayer: refs.mediaLayer,
      feedback: refs.feedback,
      feedbackText: refs.feedbackText,
      services
    }));
    const fullscreenController = addController(createFullscreenController({
      player,
      video: refs.video,
      stage: refs.stage,
      fullscreen: refs.fullscreen,
      resizeSubtitles: () => subtitleBinding.resize(),
      services
    }));

    const mediaController = addController(createMediaController({
      player,
      video: refs.video,
      progress: refs.progress,
      volume: refs.volume,
      current: refs.current,
      duration: refs.duration,
      play: refs.play,
      mute: refs.mute,
      rate: refs.rate,
      repeat: refs.repeat,
      onPlaybackStateChange: fullscreenController.syncPlayback,
      onPlayInteraction: () => subtitleBinding.activatePending(),
      feedbackController,
      services
    }));

    if (model.subtitles.length > 0) {
      subtitleBinding.controller = addController(createSubtitleController({
        player,
        video: refs.video,
        button: refs.subtitles,
        menu: refs.subtitleMenu,
        model,
        showFullscreenUi: fullscreenController.showUi,
        services
      }));
    } else {
      disableSubtitles();
    }

    const interactionController = addController(createInteractionController({
      controls: { play: refs.play, progress: refs.progress, rate: refs.rate, repeat: refs.repeat },
      surfaces: { player, stage: refs.stage, viewport: refs.viewport, video: refs.video },
      volume: refs.volume,
      mute: refs.mute,
      volumeControl: refs.volumeControl,
      media: mediaController,
      fullscreen: fullscreenController,
      services
    }));
    fullscreenController.setPointerActivityGuard(event => interactionController.pendingHiddenTouchTap(event));

    refs.video.controls = false;
    player.dataset.silVideoReady = 'true';
    player.dataset.silVideoEnhanced = 'true';
    player.querySelectorAll('[data-sil-video-controls]').forEach(control => { control.hidden = false; });
  }

  async function destroy() {
    if (destroyPromise) return destroyPromise;
    destroyPromise = (async () => {
      await destroyControllersInReverse(controllers, diagnostics);
      refs.video.controls = initialNativeControls;
      for (const { control, hidden } of initialControls) control.hidden = hidden;
      refs.mediaLayer.style.removeProperty('--sil-video-brightness');
      for (const key of ['silVideoPlaying', 'silVideoEnded', 'silVideoMuted', 'silVideoVolumeLevel', 'silVideoLoop', 'silVideoTheme']) delete player.dataset[key];
      delete player.dataset.silVideoReady;
      delete player.dataset.silVideoEnhanced;
      state.destroy();
      ui.destroy();
    })();
    return destroyPromise;
  }

  return {
    mount,
    destroy,
    refreshTheme(theme) { player.dataset.silVideoTheme = theme || (isDarkTheme() ? 'dark' : 'light'); }
  };
}

export { createPlayerInstance };
