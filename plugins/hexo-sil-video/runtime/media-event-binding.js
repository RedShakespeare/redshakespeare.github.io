import { createListenerScope } from './shared.js';

export function bindMediaEvents({ video, progress, duration, projection, setStatus, onPlayInteraction, loadingHud }) {
  const scope = createListenerScope();
  scope.listen(video, 'loadstart', () => {
    projection.mediaError(false);
    loadingHud.hide();
    progress.style.removeProperty('--sil-video-range-buffered');
    duration.textContent = '--:--';
    setStatus('正在加载视频…', false, 'loading');
  });
  scope.listen(video, 'emptied', () => {
    loadingHud.hide();
    progress.style.removeProperty('--sil-video-range-buffered');
  });
  scope.listen(video, 'loadedmetadata', () => { projection.duration(); setStatus(); });
  scope.listen(video, 'durationchange', projection.duration);
  scope.listen(video, 'progress', projection.buffered);
  scope.listen(video, 'canplay', projection.buffered);
  scope.listen(video, 'canplaythrough', projection.buffered);
  scope.listen(video, 'suspend', projection.buffered);
  scope.listen(video, 'timeupdate', projection.time);
  scope.listen(video, 'play', () => { onPlayInteraction(); projection.playing(); });
  scope.listen(video, 'playing', () => { loadingHud.hide(); projection.playing(); });
  scope.listen(video, 'waiting', loadingHud.show);
  scope.listen(video, 'stalled', loadingHud.show);
  scope.listen(video, 'canplay', loadingHud.hide);
  scope.listen(video, 'pause', () => { loadingHud.hide(); projection.playing(); });
  scope.listen(video, 'ended', () => { loadingHud.hide(); projection.playing(); });
  scope.listen(video, 'volumechange', projection.volume);
  scope.listen(video, 'error', () => {
    loadingHud.hide();
    projection.mediaError(true);
    setStatus('视频加载失败，请使用下载链接。', true);
  });
  return scope;
}
