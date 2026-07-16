import { formatTime, setBufferedRanges, setRangeFill, volumeLevel } from './shared.js';

export function createMediaProjection({ player, video, progress, volume, current, duration, play, mute, repeat, onPlaybackStateChange }) {
  function playing() {
    const active = !video.paused && !video.ended;
    player.dataset.silVideoPlaying = active ? 'true' : 'false';
    player.dataset.silVideoEnded = video.ended ? 'true' : 'false';
    play.setAttribute('aria-label', video.ended ? '重播' : active ? '暂停' : '播放');
    play.setAttribute('aria-pressed', active ? 'true' : 'false');
    onPlaybackStateChange();
  }

  function time() {
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

  function buffered() {
    const maximum = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    setBufferedRanges(progress, video, maximum);
  }

  function mediaDuration() {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      duration.textContent = '--:--';
      time();
      buffered();
      return;
    }
    progress.max = String(video.duration);
    duration.textContent = formatTime(video.duration);
    time();
    buffered();
  }

  function mediaVolume() {
    const muted = video.muted || video.volume === 0;
    player.dataset.silVideoMuted = muted ? 'true' : 'false';
    player.dataset.silVideoVolumeLevel = volumeLevel(video.volume, muted);
    mute.setAttribute('aria-label', muted ? '取消静音' : '静音');
    mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
    volume.value = String(video.muted ? 0 : video.volume);
    volume.setAttribute('aria-valuetext', `${Math.round(Number(volume.value) * 100)}%`);
    setRangeFill(volume, Number(volume.value), 1);
  }

  function repeatMode() {
    repeat.setAttribute('aria-pressed', video.loop ? 'true' : 'false');
    repeat.setAttribute('aria-label', video.loop ? '循环播放' : '播放一次');
    player.dataset.silVideoLoop = video.loop ? 'true' : 'false';
  }

  return { playing, time, buffered, duration: mediaDuration, volume: mediaVolume, repeat: repeatMode };
}
