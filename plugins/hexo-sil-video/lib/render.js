'use strict';

const { MODEL_VERSION, PLAYER_ACTIONS } = require('./player-contract');
const { createVideoIcons } = require('./icons');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function createRenderer({ playerStart, playerEnd }) {

  function renderFeedback(icons) {
    return `<div class="sil-video-player__feedback" data-sil-video-controls data-sil-video-feedback role="status" aria-live="polite" aria-atomic="true" hidden>${icons.feedbackIcon}${icons.brightnessIcon}${icons.feedbackPlayIcon}${icons.feedbackPauseIcon}<span data-sil-video-feedback-text></span></div>`;
  }

  function renderProgress() {
    return `<div class="sil-video-player__progress-row" data-sil-video-controls hidden>
      <span class="sil-video-player__time" data-sil-video-current>0:00</span>
      <input class="sil-video-player__range sil-video-player__progress" data-sil-video-progress type="range" min="0" max="100" step="0.1" value="0" aria-label="播放进度" aria-valuetext="0:00/--:--">
      <span class="sil-video-player__time" data-sil-video-duration>--:--</span>
    </div>`;
  }

  function renderSubtitleControl(video, icons) {
    const state = video.subtitles.length === 0 ? ' disabled' : ' aria-expanded="false"';
    return `<div class="sil-video-player__subtitle-control">
        <button class="sil-video-player__button" data-sil-video-action="${PLAYER_ACTIONS.subtitles}" type="button" aria-label="字幕"${state}>${icons.icon('subtitles', '<path d="M3 5h18v14H3zm2 2v10h14V7zm1 6h5v2H6zm7 0h5v2h-5zM6 9h8v2H6z"/>')}</button>
        <div class="sil-video-player__subtitle-menu" data-sil-video-subtitle-menu hidden></div>
      </div>`;
  }

  function renderToolbar(video, icons) {
    return `<div class="sil-video-player__toolbar" data-sil-video-controls role="group" aria-label="视频控制" hidden>
      <button class="sil-video-player__button" data-sil-video-action="${PLAYER_ACTIONS.play}" type="button" aria-label="播放" aria-pressed="false">${icons.playIcon}</button>
      <div class="sil-video-player__volume-control">
      <button class="sil-video-player__button" data-sil-video-action="${PLAYER_ACTIONS.mute}" type="button" aria-label="静音" aria-pressed="false">${icons.volumeIcon}</button>
        <div class="sil-video-player__volume-popover"><input class="sil-video-player__range sil-video-player__volume" data-sil-video-volume type="range" min="0" max="1" step="0.05" value="1" aria-label="音量" aria-valuetext="100%" orient="vertical"></div>
      </div>
      <button class="sil-video-player__button sil-video-player__rate" data-sil-video-action="${PLAYER_ACTIONS.rate}" type="button" aria-label="播放速度 1 倍">1×</button>
      ${renderSubtitleControl(video, icons)}
      <span class="sil-video-player__toolbar-spacer"></span>
      <a class="sil-video-player__button" href="${escapeHtml(video.source)}" target="_blank" rel="noopener" aria-label="下载视频" title="下载视频">${icons.icon('download', '<path d="M11 3h2v10.2l3.6-3.6L18 11l-6 6-6-6 1.4-1.4 3.6 3.6zM5 19h14v2H5z"/>')}</a>
      <button class="sil-video-player__button" data-sil-video-action="${PLAYER_ACTIONS.fullscreen}" type="button" aria-label="进入全屏">${icons.icon('fullscreen', '<path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/>')}</button>
    </div>`;
  }

  function renderDownloads(video) {
    return video.subtitles.map(track => `<a href="${escapeHtml(track.url)}" target="_blank" rel="noopener" download>下载${escapeHtml(track.label)}字幕</a>`).join('');
  }

  function renderVideoPlayer(video) {
    const type = video.type ? ` type="${escapeHtml(video.type)}"` : '';
    const poster = video.poster ? ` poster="${escapeHtml(video.poster)}"` : '';
    const model = Buffer.from(JSON.stringify({
      version: MODEL_VERSION,
      subtitles: video.subtitles,
      fonts: video.fonts,
      fallbackFont: video.fallbackFont,
      runtime: video.runtime
    }), 'utf8').toString('base64');
    const icons = createVideoIcons();
    return `${playerStart}
<aside class="sil-video-player" data-sil-video-player data-sil-video-model="${model}" tabindex="0" aria-label="视频播放器" style="--sil-video-aspect-ratio:${escapeHtml(video.aspectRatio)}">
  <div class="sil-video-player__stage" data-sil-video-stage tabindex="-1">
    <header class="sil-video-player__header" data-sil-video-controls data-sil-video-fallback-status hidden><span class="sil-video-player__title">${escapeHtml(video.title)}</span><span class="sil-video-player__status" data-sil-video-status role="status" aria-live="polite"></span></header>
    <div class="sil-video-player__viewport" data-sil-video-viewport>
      <div class="sil-video-player__media-layer" data-sil-video-media-layer style="--sil-video-brightness:1"><video class="sil-video-player__video" controls preload="${escapeHtml(video.preload)}"${poster}><source src="${escapeHtml(video.source)}"${type}>你的浏览器不支持 HTML5 视频播放。</video></div>
      ${renderFeedback(icons)}
    </div>
    ${renderProgress()}
    ${renderToolbar(video, icons)}
  </div>
  <div class="sil-video-player__subtitle-downloads" data-sil-video-subtitle-downloads>${renderDownloads(video)}</div>
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
