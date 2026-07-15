import {
  FEEDBACK_HIDE_DELAY,
  PLAYBACK_FEEDBACK_HIDE_DELAY,
  clamp,
  createListenerScope,
  formatTime,
  rates,
  setBufferedRanges,
  setRangeFill,
  volumeLevel
} from './shared.js';

export function createMediaController({
  player,
  video,
  mediaLayer,
  feedback,
  feedbackText,
  progress,
  volume,
  current,
  duration,
  status,
  play,
  mute,
  rate,
  repeat,
  onPlaybackStateChange = () => {},
  onPlayInteraction = () => {}
}) {
  const scope = createListenerScope();
  const windowRef = video.ownerDocument.defaultView;
  let feedbackTimer = null;
  let lastVolume = video.volume || 0.8;
  let brightness = 1;

  function setStatus(message = '', error = false) {
    status.textContent = message;
    if (error) player.dataset.silVideoError = 'true';
    else delete player.dataset.silVideoError;
  }

  function showFeedback(kind, message, delay = FEEDBACK_HIDE_DELAY, label = '') {
    if (feedbackTimer !== null) windowRef?.clearTimeout(feedbackTimer);
    feedbackTimer = null;
    feedback.dataset.silVideoFeedbackKind = kind;
    feedback.dataset.silVideoFeedbackVisible = 'true';
    feedbackText.textContent = message;
    if (label) feedback.setAttribute('aria-label', label);
    else feedback.removeAttribute('aria-label');
    feedbackTimer = windowRef.setTimeout(() => {
      feedbackTimer = null;
      delete feedback.dataset.silVideoFeedbackVisible;
    }, delay);
  }

  function showPlaybackFeedback(action) {
    const playing = action === 'play';
    showFeedback(`playback-${action}`, '', PLAYBACK_FEEDBACK_HIDE_DELAY, playing ? '播放' : '暂停');
  }

  function showVolumeFeedback() {
    const effectiveVolume = video.muted ? 0 : video.volume;
    showFeedback('volume', `${Math.round(effectiveVolume * 100)}%`);
  }

  function showProgressFeedback(position = video.currentTime) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    showFeedback('progress', `${formatTime(position)}/${formatTime(video.duration)}`);
  }

  function setBrightness(value, announce = true) {
    brightness = clamp(value, 0, 2);
    mediaLayer.style.setProperty('--sil-video-brightness', String(brightness));
    if (announce) showFeedback('brightness', `${Math.round(brightness * 100)}%`);
  }

  function syncPlaying() {
    const playing = !video.paused && !video.ended;
    player.dataset.silVideoPlaying = playing ? 'true' : 'false';
    player.dataset.silVideoEnded = video.ended ? 'true' : 'false';
    play.setAttribute('aria-label', video.ended ? '重播' : playing ? '暂停' : '播放');
    play.setAttribute('aria-pressed', playing ? 'true' : 'false');
    onPlaybackStateChange();
  }

  function syncTime() {
    const durationKnown = Number.isFinite(video.duration) && video.duration > 0;
    const maximum = durationKnown ? video.duration : 100;
    const position = Number.isFinite(video.currentTime) ? Math.min(video.currentTime, maximum) : 0;
    const totalText = durationKnown ? formatTime(video.duration) : '--:--';
    progress.max = String(maximum);
    progress.value = String(position);
    current.textContent = formatTime(position);
    progress.setAttribute('aria-valuetext', `${formatTime(position)}/${totalText}`);
    setRangeFill(progress, position, durationKnown ? video.duration : 0);
  }

  function syncBuffered() {
    const maximum = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    setBufferedRanges(progress, video, maximum);
  }

  function syncDuration() {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      duration.textContent = '--:--';
      syncTime();
      syncBuffered();
      return;
    }
    progress.max = String(video.duration);
    duration.textContent = formatTime(video.duration);
    syncTime();
    syncBuffered();
  }

  function syncVolume() {
    const muted = video.muted || video.volume === 0;
    const level = volumeLevel(video.volume, muted);
    player.dataset.silVideoMuted = muted ? 'true' : 'false';
    player.dataset.silVideoVolumeLevel = level;
    mute.setAttribute('aria-label', muted ? '取消静音' : '静音');
    mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
    volume.value = String(video.muted ? 0 : video.volume);
    volume.setAttribute('aria-valuetext', `${Math.round(Number(volume.value) * 100)}%`);
    setRangeFill(volume, Number(volume.value), 1);
  }

  function syncRepeat() {
    repeat.setAttribute('aria-pressed', video.loop ? 'true' : 'false');
    repeat.setAttribute('aria-label', video.loop ? '循环播放' : '播放一次');
    player.dataset.silVideoLoop = video.loop ? 'true' : 'false';
  }

  async function togglePlay(showPlayback = false) {
    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0;
      try {
        await video.play();
        setStatus();
        if (showPlayback) showPlaybackFeedback('play');
      } catch {
        setStatus('视频播放失败，请使用下载链接。', true);
      }
    } else {
      video.pause();
      if (showPlayback) showPlaybackFeedback('pause');
    }
  }

  function toggleMute() {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = Math.max(0.05, lastVolume || 0.8);
    } else {
      lastVolume = video.volume;
      video.muted = true;
    }
    syncVolume();
    showVolumeFeedback();
  }

  function adjustVolume(delta) {
    if (delta > 0 && video.muted) video.muted = false;
    video.volume = clamp(video.volume + delta, 0, 1);
    if (video.volume > 0) lastVolume = video.volume;
    video.muted = video.volume === 0;
    syncVolume();
    showVolumeFeedback();
  }

  function setVolume(value) {
    video.muted = false;
    video.volume = clamp(value, 0, 1);
    if (video.volume > 0) lastVolume = video.volume;
    syncVolume();
    showVolumeFeedback();
  }

  function setGestureVolume(value) {
    video.volume = clamp(value, 0, 1);
    video.muted = video.volume === 0;
    if (video.volume > 0) lastVolume = video.volume;
    syncVolume();
    showVolumeFeedback();
  }

  function seek(delta) {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = clamp(video.currentTime + delta, 0, video.duration);
    syncTime();
    showProgressFeedback();
  }

  function setCurrentTime(value) {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = clamp(value, 0, video.duration);
    syncTime();
    showProgressFeedback();
  }

  function cycleRate() {
    const index = rates.findIndex(value => Math.abs(value - video.playbackRate) < 0.001);
    video.playbackRate = rates[(index + 1) % rates.length];
    rate.textContent = `${video.playbackRate}×`;
    rate.setAttribute('aria-label', `播放速度 ${video.playbackRate} 倍`);
  }

  function toggleRepeat() {
    video.loop = !video.loop;
    syncRepeat();
  }

  scope.listen(video, 'loadstart', () => {
    progress.style.removeProperty('--sil-video-range-buffered');
    duration.textContent = '--:--';
    setStatus('正在加载视频…');
  });
  scope.listen(video, 'emptied', () => progress.style.removeProperty('--sil-video-range-buffered'));
  scope.listen(video, 'loadedmetadata', () => { syncDuration(); setStatus(); });
  scope.listen(video, 'durationchange', syncDuration);
  scope.listen(video, 'progress', syncBuffered);
  scope.listen(video, 'canplay', syncBuffered);
  scope.listen(video, 'canplaythrough', syncBuffered);
  scope.listen(video, 'suspend', syncBuffered);
  scope.listen(video, 'timeupdate', syncTime);
  scope.listen(video, 'play', () => { onPlayInteraction(); syncPlaying(); });
  scope.listen(video, 'pause', syncPlaying);
  scope.listen(video, 'ended', syncPlaying);
  scope.listen(video, 'volumechange', syncVolume);
  scope.listen(video, 'error', () => setStatus('视频加载失败，请使用下载链接。', true));

  syncPlaying();
  syncTime();
  syncDuration();
  syncVolume();
  setBrightness(1, false);
  syncRepeat();

  return {
    adjustVolume,
    cycleRate,
    getBrightness: () => brightness,
    seek,
    setBrightness,
    setCurrentTime,
    setGestureVolume,
    setStatus,
    setVolume,
    showProgressFeedback,
    toggleMute,
    togglePlay,
    toggleRepeat,
    destroy() {
      if (feedbackTimer !== null) windowRef?.clearTimeout(feedbackTimer);
      scope.destroy();
    }
  };
}
