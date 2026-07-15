export const VIEW_FIELDS = Object.freeze([
  'player', 'video', 'stage', 'viewport', 'mediaLayer', 'feedback', 'feedbackText',
  'progress', 'volume', 'current', 'duration', 'status', 'play', 'mute', 'rate',
  'repeat', 'subtitles', 'subtitleMenu', 'fullscreen', 'volumeControl'
]);

export function createPlayerView(player) {
  const refs = {
    player,
    video: player.querySelector('.sil-video-player__video'),
    stage: player.querySelector('[data-sil-video-stage]'),
    viewport: player.querySelector('[data-sil-video-viewport]'),
    mediaLayer: player.querySelector('[data-sil-video-media-layer]'),
    feedback: player.querySelector('[data-sil-video-feedback]'),
    feedbackText: player.querySelector('[data-sil-video-feedback-text]'),
    progress: player.querySelector('[data-sil-video-progress]'),
    volume: player.querySelector('[data-sil-video-volume]'),
    current: player.querySelector('[data-sil-video-current]'),
    duration: player.querySelector('[data-sil-video-duration]'),
    status: player.querySelector('[data-sil-video-status]'),
    play: player.querySelector('[data-sil-video-action="play"]'),
    mute: player.querySelector('[data-sil-video-action="mute"]'),
    rate: player.querySelector('[data-sil-video-action="rate"]'),
    repeat: player.querySelector('[data-sil-video-action="repeat"]'),
    subtitles: player.querySelector('[data-sil-video-action="subtitles"]'),
    subtitleMenu: player.querySelector('[data-sil-video-subtitle-menu]'),
    fullscreen: player.querySelector('[data-sil-video-action="fullscreen"]'),
    volumeControl: player.querySelector('.sil-video-player__volume-control')
  };
  const missing = VIEW_FIELDS.filter(field => !refs[field]);
  if (missing.length) {
    const error = new Error(`播放器视图结构缺失：${missing.join('、')}`);
    error.code = 'SIL_VIDEO_VIEW_MISSING';
    error.fields = missing;
    throw error;
  }
  return Object.freeze(refs);
}
