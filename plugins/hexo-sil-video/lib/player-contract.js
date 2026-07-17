'use strict';

const MODEL_VERSION = 3;
const PLAYER_ACTIONS = Object.freeze({
  play: 'play',
  mute: 'mute',
  rate: 'rate',
  subtitles: 'subtitles',
  fullscreen: 'fullscreen'
});
const PLAYER_VIEW_SELECTORS = Object.freeze({
  video: '.sil-video-player__video',
  stage: '[data-sil-video-stage]',
  viewport: '[data-sil-video-viewport]',
  mediaLayer: '[data-sil-video-media-layer]',
  feedback: '[data-sil-video-feedback]',
  feedbackText: '[data-sil-video-feedback-text]',
  loading: '[data-sil-video-loading]',
  loadingSpeed: '[data-sil-video-loading-speed]',
  progress: '[data-sil-video-progress]',
  volume: '[data-sil-video-volume]',
  current: '[data-sil-video-current]',
  duration: '[data-sil-video-duration]',
  status: '[data-sil-video-status]',
  play: `[data-sil-video-action="${PLAYER_ACTIONS.play}"]`,
  reloadIcon: '.sil-video-player__icon--reload',
  mute: `[data-sil-video-action="${PLAYER_ACTIONS.mute}"]`,
  rate: `[data-sil-video-action="${PLAYER_ACTIONS.rate}"]`,
  subtitles: `[data-sil-video-action="${PLAYER_ACTIONS.subtitles}"]`,
  subtitleMenu: '[data-sil-video-subtitle-menu]',
  fullscreen: `[data-sil-video-action="${PLAYER_ACTIONS.fullscreen}"]`,
  volumeControl: '.sil-video-player__volume-control'
});

module.exports = { MODEL_VERSION, PLAYER_ACTIONS, PLAYER_VIEW_SELECTORS };
