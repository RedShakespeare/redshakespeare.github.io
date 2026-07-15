import { createFullscreenController } from './fullscreen-controller.js';
import { createFeedbackController } from './feedback-controller.js';
import { createInteractionController } from './interaction-controller.js';
import { createMediaController } from './media-controller.js';
import { isDarkTheme } from './shared.js';
import { createSubtitleController } from './subtitle-controller.js';
import { createPlayerView } from './view.js';
import { createRuntimeServices } from './runtime-services.js';
import contract from '../lib/player-contract.js';

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

function createPlayerInstance({ player, services }) {
  const refs = createPlayerView(player);
  const model = parseModel(player);
  services ||= createRuntimeServices({ player, status: refs.status, windowRef: player.ownerDocument.defaultView });
  const { state, ui, diagnostics } = services;
  const controllers = [];
  let destroyed = false;
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
    addController(createFeedbackController({ ...refs, services }));
    const fullscreenController = addController(createFullscreenController({
      player,
      video: refs.video,
      stage: refs.stage,
      fullscreen: refs.fullscreen,
      resizeSubtitles: () => subtitleBinding.resize(),
      services
    }));

    const mediaController = addController(createMediaController({
      ...refs,
      onPlaybackStateChange: fullscreenController.syncPlayback,
      onPlayInteraction: () => subtitleBinding.activatePending(),
      feedbackController: controllers[0],
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
    destroyed = true;
    destroyPromise = (async () => {
      const pending = [];
      for (const controller of controllers.slice().reverse()) {
        try { pending.push(Promise.resolve(controller.destroy())); } catch (error) { pending.push(Promise.reject(error)); }
      }
      const results = await Promise.allSettled(pending);
      results.filter(result => result.status === 'rejected').forEach(result => diagnostics.report('destroy', result.reason));
      refs.video.controls = true;
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
    refreshTheme() { player.dataset.silVideoTheme = isDarkTheme() ? 'dark' : 'light'; }
  };
}

export { createPlayerInstance };
