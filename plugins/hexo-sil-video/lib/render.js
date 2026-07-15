'use strict';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function createRenderer({ playerStart, playerEnd }) {
  function icon(name, paths) {
    return `<svg class="sil-video-player__icon sil-video-player__icon--${name}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  }

  function renderVideoPlayer(video) {
    const type = video.type ? ` type="${escapeHtml(video.type)}"` : '';
    const poster = video.poster ? ` poster="${escapeHtml(video.poster)}"` : '';
    const model = Buffer.from(JSON.stringify({
      subtitles: video.subtitles,
      fonts: video.fonts,
      fallbackFont: video.fallbackFont,
      runtime: video.runtime
    }), 'utf8').toString('base64');
    const subtitleDownloads = video.subtitles.map(track => `<a href="${escapeHtml(track.url)}" target="_blank" rel="noopener" download>下载${escapeHtml(track.label)}字幕</a>`).join('');
    const playIcon = icon('play', '<path d="M8 5v14l11-7z"/>') + icon('pause', '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>') + icon('replay', '<path d="M12 5a7 7 0 1 1-6.3 4H3l4-4 4 4H7.8A5 5 0 1 0 12 7z"/>');
    const speaker = '<path d="M3 10v4h4l5 4V6L7 10z"/>';
    const volumeIcon = icon('volume-low', `${speaker}<path d="M14.5 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>`) +
      icon('volume-medium', `${speaker}<path d="M14.5 9.5a3.5 3.5 0 0 1 0 5m2-7a6.5 6.5 0 0 1 0 9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>`) +
      icon('volume-high', `${speaker}<path d="M14.5 9.5a3.5 3.5 0 0 1 0 5m2-7a6.5 6.5 0 0 1 0 9m2-11a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>`) +
      icon('muted', `${speaker}<path d="m14 9 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"/>`);
    const repeatIcon = icon('once', '<path d="M4 11h12.2l-3.6-3.6L14 6l6 6-6 6-1.4-1.4 3.6-3.6H4z"/>') +
      icon('repeat', '<path d="M7 7h10l-2.5-2.5L16 3l5 5-5 5-1.5-1.5L17 9H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5zm10 8H7l2.5 2.5L8 19l-5-5 5-5 1.5 1.5L7 13h10a3 3 0 0 0 3-3V9h2v1a5 5 0 0 1-5 5z"/>');
    const feedbackIcon = icon('feedback-volume', `${speaker}<path d="M14.5 9.5a3.5 3.5 0 0 1 0 5m2-7a6.5 6.5 0 0 1 0 9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>`);
    const brightnessIcon = icon('feedback-brightness', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>');
    const feedbackPlayIcon = icon('feedback-play', '<path d="M8 5v14l11-7z"/>');
    const feedbackPauseIcon = icon('feedback-pause', '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>');
    const subtitleButtonState = video.subtitles.length === 0 ? ' disabled' : ' aria-expanded="false"';
    return `${playerStart}
<aside class="sil-video-player" data-sil-video-player data-sil-video-model="${model}" tabindex="0" aria-label="视频播放器" style="--sil-video-aspect-ratio:${escapeHtml(video.aspectRatio)}">
  <div class="sil-video-player__stage" data-sil-video-stage tabindex="-1">
    <header class="sil-video-player__header" data-sil-video-controls data-sil-video-fallback-status hidden><span class="sil-video-player__title">${escapeHtml(video.title)}</span><span class="sil-video-player__status" data-sil-video-status role="status" aria-live="polite"></span></header>
    <div class="sil-video-player__viewport" data-sil-video-viewport>
      <div class="sil-video-player__media-layer" data-sil-video-media-layer style="--sil-video-brightness:1"><video class="sil-video-player__video" controls preload="${escapeHtml(video.preload)}"${poster}><source src="${escapeHtml(video.source)}"${type}>你的浏览器不支持 HTML5 视频播放。</video></div>
      <div class="sil-video-player__feedback" data-sil-video-controls data-sil-video-feedback role="status" aria-live="polite" aria-atomic="true" hidden>${feedbackIcon}${brightnessIcon}${feedbackPlayIcon}${feedbackPauseIcon}<span data-sil-video-feedback-text></span></div>
    </div>
    <div class="sil-video-player__progress-row" data-sil-video-controls hidden>
      <span class="sil-video-player__time" data-sil-video-current>0:00</span>
      <input class="sil-video-player__range sil-video-player__progress" data-sil-video-progress type="range" min="0" max="100" step="0.1" value="0" aria-label="播放进度" aria-valuetext="0:00/--:--">
      <span class="sil-video-player__time" data-sil-video-duration>--:--</span>
    </div>
    <div class="sil-video-player__toolbar" data-sil-video-controls role="group" aria-label="视频控制" hidden>
      <button class="sil-video-player__button" data-sil-video-action="play" type="button" aria-label="播放" aria-pressed="false">${playIcon}</button>
      <div class="sil-video-player__volume-control">
        <button class="sil-video-player__button" data-sil-video-action="mute" type="button" aria-label="静音" aria-pressed="false">${volumeIcon}</button>
        <div class="sil-video-player__volume-popover"><input class="sil-video-player__range sil-video-player__volume" data-sil-video-volume type="range" min="0" max="1" step="0.05" value="1" aria-label="音量" aria-valuetext="100%" orient="vertical"></div>
      </div>
      <button class="sil-video-player__button sil-video-player__rate" data-sil-video-action="rate" type="button" aria-label="播放速度 1 倍">1×</button>
      <button class="sil-video-player__button" data-sil-video-action="repeat" type="button" aria-label="播放一次" aria-pressed="false">${repeatIcon}</button>
      <div class="sil-video-player__subtitle-control">
        <button class="sil-video-player__button" data-sil-video-action="subtitles" type="button" aria-label="字幕"${subtitleButtonState}>${icon('subtitles', '<path d="M3 5h18v14H3zm2 2v10h14V7zm1 6h5v2H6zm7 0h5v2h-5zM6 9h8v2H6z"/>')}</button>
        <div class="sil-video-player__subtitle-menu" data-sil-video-subtitle-menu hidden></div>
      </div>
      <span class="sil-video-player__toolbar-spacer"></span>
      <a class="sil-video-player__button" href="${escapeHtml(video.source)}" target="_blank" rel="noopener" aria-label="下载视频" title="下载视频">${icon('download', '<path d="M11 3h2v10.2l3.6-3.6L18 11l-6 6-6-6 1.4-1.4 3.6 3.6zM5 19h14v2H5z"/>')}</a>
      <button class="sil-video-player__button" data-sil-video-action="fullscreen" type="button" aria-label="进入全屏">${icon('fullscreen', '<path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/>')}</button>
    </div>
  </div>
  <div class="sil-video-player__subtitle-downloads" data-sil-video-subtitle-downloads>${subtitleDownloads}</div>
</aside>
${playerEnd}`;
  }

  return { renderVideoPlayer };
}

function parseVideoTagArgs(args) {
  const allowed = new Set(['file', 'url', 'title', 'poster']);
  const values = {};
  for (const argument of args) {
    const separator = String(argument).indexOf('=');
    if (separator <= 0) throw new Error('Video tag arguments must use key=value syntax.');
    const key = String(argument).slice(0, separator).trim();
    if (!allowed.has(key)) throw new Error(`Video tag does not support \`${key}\`.`);
    if (Object.prototype.hasOwnProperty.call(values, key)) throw new Error(`Video tag defines \`${key}\` more than once.`);
    values[key] = String(argument).slice(separator + 1).trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2');
  }
  return values;
}

function mergeVideo(defaults, overrides) {
  const result = { ...(isObject(defaults) ? defaults : {}), ...overrides };
  if (Object.prototype.hasOwnProperty.call(overrides, 'file')) {
    delete result.url;
    delete result.subtitles;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'url')) {
    delete result.file;
    delete result.subtitles;
  }
  return result;
}

module.exports = { createRenderer, mergeVideo, parseVideoTagArgs };
