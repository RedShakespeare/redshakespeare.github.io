import {
  clamp,
  rates
} from './shared.js';
import { bindMediaEvents } from './media-event-binding.js';
import { createMediaProjection } from './media-projection.js';

export function createMediaController({
  player,
  video,
  progress,
  volume,
  current,
  duration,
  play,
  mute,
  rate,
  onPlaybackStateChange = () => {},
  onPlayInteraction = () => {},
  feedbackController,
  services
}) {
  const { state, diagnostics } = services;
  let lastVolume = video.volume || 0.8;

  function setStatus(message = '', error = false, level = error ? 'error' : 'info') {
    state.set('media', message, { error, level });
  }

  function showPlaybackFeedback(action) {
    feedbackController.showPlayback(action);
  }

  function showVolumeFeedback() {
    feedbackController.showVolume();
  }

  function showProgressFeedback(position = video.currentTime) {
    feedbackController.showProgress(position);
  }

  function setBrightness(value, announce = true) {
    feedbackController.setBrightness(value, announce);
  }

  const projection = createMediaProjection({ player, video, progress, volume, current, duration, play, mute, onPlaybackStateChange });
  let playToken = 0;
  let destroyed = false;

  async function togglePlay(showPlayback = false) {
    if (video.paused || video.ended) {
      const token = ++playToken;
      if (video.ended) video.currentTime = 0;
      try {
        await video.play();
        if (destroyed || token !== playToken) return;
        setStatus();
        if (showPlayback) showPlaybackFeedback('play');
      } catch (error) {
        if (destroyed || token !== playToken) return;
        diagnostics.report('media.play', error);
        setStatus('视频播放失败，请使用下载链接。', true);
      }
    } else {
      playToken += 1;
      video.pause();
      if (showPlayback) showPlaybackFeedback('pause');
    }
  }

  function finishVolumeUpdate() {
    if (video.volume > 0) lastVolume = video.volume;
    projection.volume();
    showVolumeFeedback();
  }

  function toggleMute() {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = Math.max(0.05, lastVolume || 0.8);
    } else {
      lastVolume = video.volume;
      video.muted = true;
    }
    finishVolumeUpdate();
  }

  function adjustVolume(delta) {
    if (delta > 0 && video.muted) video.muted = false;
    video.volume = clamp(video.volume + delta, 0, 1);
    video.muted = video.volume === 0;
    finishVolumeUpdate();
  }

  function setVolume(value) {
    video.muted = false;
    video.volume = clamp(value, 0, 1);
    finishVolumeUpdate();
  }

  function setGestureVolume(value) {
    video.volume = clamp(value, 0, 1);
    video.muted = video.volume === 0;
    finishVolumeUpdate();
  }

  function seek(delta) {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = clamp(video.currentTime + delta, 0, video.duration);
    projection.time();
    showProgressFeedback();
  }

  function setCurrentTime(value) {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = clamp(value, 0, video.duration);
    projection.time();
    showProgressFeedback();
  }

  function cycleRate() {
    const index = rates.findIndex(value => Math.abs(value - video.playbackRate) < 0.001);
    video.playbackRate = rates[(index + 1) % rates.length];
    rate.textContent = `${video.playbackRate}×`;
    rate.setAttribute('aria-label', `播放速度 ${video.playbackRate} 倍`);
  }

  const scope = bindMediaEvents({ video, progress, duration, projection, setStatus, onPlayInteraction });
  projection.playing();
  projection.time();
  projection.duration();
  projection.volume();

  return {
    adjustVolume,
    cycleRate,
    getBrightness: feedbackController.getBrightness,
    seek,
    setBrightness,
    setCurrentTime,
    setGestureVolume,
    setVolume,
    showProgressFeedback,
    toggleMute,
    togglePlay,
    async destroy() {
      destroyed = true;
      playToken += 1;
      scope.destroy();
    }
  };
}
