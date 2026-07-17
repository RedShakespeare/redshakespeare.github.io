import { createListenerScope } from './shared.js';

export function bindMediaEvents({ video, progress, duration, projection, setStatus, mediaErrorMessage, onMediaError, onPlayInteraction, loadingHud }) {
  const scope = createListenerScope();

  function reportMediaError(event) {
    loadingHud.hide();
    const target = event?.target;
    onMediaError(true, {
      source: target?.src || video.currentSrc || video.querySelector('source')?.src || '',
      errorCode: video.error?.code || null,
      networkState: video.networkState
    });
    setStatus(mediaErrorMessage(), true);
  }

  scope.listen(video, 'loadstart', () => {
    onMediaError(false);
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
  scope.listen(video, 'canplay', () => { projection.buffered(); loadingHud.hide(); });
  scope.listen(video, 'canplaythrough', projection.buffered);
  scope.listen(video, 'suspend', projection.buffered);
  scope.listen(video, 'timeupdate', projection.time);
  scope.listen(video, 'play', () => { onPlayInteraction(); projection.playing(); });
  scope.listen(video, 'playing', () => { loadingHud.hide(); projection.playing(); });
  scope.listen(video, 'waiting', loadingHud.show);
  scope.listen(video, 'stalled', loadingHud.show);
  scope.listen(video, 'pause', () => { loadingHud.hide(); projection.playing(); });
  scope.listen(video, 'ended', () => { loadingHud.hide(); projection.playing(); });
  scope.listen(video, 'volumechange', projection.volume);
  scope.listen(video, 'error', reportMediaError);
  video.querySelectorAll('source').forEach(source => scope.listen(source, 'error', reportMediaError));
  if (video.error || video.networkState === 3) reportMediaError({ target: video });
  return scope;
}
