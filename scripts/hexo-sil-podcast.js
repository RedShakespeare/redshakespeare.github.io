'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const PLAYER_START = '<!-- podcast-player:start -->';
const PLAYER_END = '<!-- podcast-player:end -->';
const EPISODE_TYPES = new Set(['full', 'trailer', 'bonus']);
const DURATION_PATTERN = /^(?:\d{1,3}:)?[0-5]\d:[0-5]\d$/;
const AUDIO_MIME_TYPES = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.m4b', 'audio/mp4'],
  ['.mp4', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.ogg', 'audio/ogg'],
  ['.opus', 'audio/opus'],
  ['.wav', 'audio/wav'],
  ['.wave', 'audio/wav'],
  ['.flac', 'audio/flac'],
  ['.aif', 'audio/aiff'],
  ['.aiff', 'audio/aiff'],
  ['.webm', 'audio/webm']
]);

let musicMetadata;
const localMetadataCache = new Map();

const PLAYER_STYLE = `
<style>
.podcast-player {
  --podcast-surface: #fff;
  --podcast-ink: #8064a2;
  --podcast-rail: #eee8f5;
  --podcast-border: #d9cee8;
  --podcast-hover: #f5f1fa;
  --podcast-focus: #8064a2;
  margin: 1.5rem 0;
  padding: 1rem;
  border: 1px solid var(--podcast-border);
  border-left: 3px solid var(--podcast-ink);
  border-radius: 8px;
  background: var(--podcast-surface);
  color: var(--podcast-ink);
  color-scheme: light;
  line-height: 1.6;
}
.podcast-player[data-podcast-theme="dark"] {
  --podcast-surface: #000;
  --podcast-ink: var(--inside-accent-color, #673ab7);
  --podcast-rail: var(--inside-accent-color-02, rgba(103, 58, 183, .2));
  --podcast-border: var(--inside-accent-color-04, rgba(103, 58, 183, .4));
  --podcast-hover: var(--inside-accent-color-01, rgba(103, 58, 183, .1));
  --podcast-focus: var(--inside-accent-color, #673ab7);
  color-scheme: dark;
}
.podcast-player__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: .25rem 1rem;
}
.podcast-player__meta {
  color: var(--podcast-ink);
  font-size: .85rem;
  opacity: .85;
}
.podcast-player__status {
  display: none;
  align-items: center;
  min-height: 1.36rem;
  color: var(--podcast-ink);
  font-size: .8rem;
}
.podcast-player[data-podcast-loading="true"] .podcast-player__status,
.podcast-player[data-podcast-error="true"] .podcast-player__status {
  display: inline-flex;
}
.podcast-player__status-icon {
  display: none;
  width: 1rem;
  height: 1rem;
  margin-right: .4rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 2;
}
.podcast-player[data-podcast-loading="true"] .podcast-player__status-icon {
  display: block;
  animation: podcast-player-spin .8s linear infinite;
}
@keyframes podcast-player-spin {
  to { transform: rotate(360deg); }
}
.podcast-player__audio {
  display: block;
  width: 100%;
  min-height: 2.5rem;
  margin: .75rem 0;
  accent-color: var(--podcast-ink);
}
.podcast-player[data-podcast-enhanced="true"] .podcast-player__audio {
  display: none;
}
.podcast-player__controls {
  display: none;
  grid-template-columns: auto auto minmax(4rem, 1fr) auto;
  align-items: center;
  gap: .5rem;
  margin: .4rem 0 .2rem;
}
.podcast-player[data-podcast-enhanced="true"] .podcast-player__controls {
  display: grid;
}
.podcast-player__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: .5rem .45rem 0;
}
.podcast-player__volume-control {
  display: none;
  min-width: 8rem;
  max-width: 10rem;
  flex: 0 1 10rem;
  align-items: center;
  gap: .55rem;
  margin-right: .65rem;
}
.podcast-player[data-podcast-enhanced="true"] .podcast-player__volume-control {
  display: flex;
}
.podcast-player__volume {
  min-width: 4.75rem;
}
.podcast-player__volume-button {
  flex: 0 0 2.25rem;
  aspect-ratio: 1;
  border-radius: 50%;
}
.podcast-player__button {
  display: inline-grid;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--podcast-border);
  border-radius: 50%;
  place-items: center;
  background: transparent;
  color: var(--podcast-ink);
  cursor: pointer;
  transition: background-color .15s ease-in-out, border-color .15s ease-in-out, color .15s ease-in-out;
}
.podcast-player__button:hover {
  border-color: var(--podcast-ink);
  background: var(--podcast-hover);
}
.podcast-player__button:focus-visible,
.podcast-player__range:focus-visible,
.podcast-player__download:focus-visible {
  outline: 2px solid var(--podcast-focus);
  outline-offset: 2px;
}
.podcast-player__icon {
  width: 1rem;
  height: 1rem;
  fill: currentColor;
}
.podcast-player__icon--pause,
.podcast-player__icon--muted {
  display: none;
}
.podcast-player[data-podcast-playing="true"] .podcast-player__icon--play,
.podcast-player[data-podcast-muted="true"] .podcast-player__icon--volume {
  display: none;
}
.podcast-player[data-podcast-playing="true"] .podcast-player__icon--pause,
.podcast-player[data-podcast-muted="true"] .podcast-player__icon--muted {
  display: block;
}
.podcast-player__time {
  min-width: 2.9rem;
  color: var(--podcast-ink);
  font-size: .8rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.podcast-player__range {
  width: 100%;
  height: 1.75rem;
  margin: 0;
  border-radius: 8px;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
}
.podcast-player__progress {
  width: auto;
  min-width: 0;
  margin-right: .2rem;
}
.podcast-player__range::-webkit-slider-runnable-track {
  height: .3rem;
  border-radius: 99px;
  background: linear-gradient(to right, var(--podcast-ink) 0 var(--podcast-range-fill, 0%), var(--podcast-rail) var(--podcast-range-fill, 0%) 100%);
}
.podcast-player__range::-webkit-slider-thumb {
  width: .85rem;
  height: .85rem;
  margin-top: -.275rem;
  border: 2px solid var(--podcast-surface);
  border-radius: 50%;
  appearance: none;
  -webkit-appearance: none;
  background: var(--podcast-ink);
}
.podcast-player__range::-moz-range-track {
  height: .3rem;
  border-radius: 99px;
  background: var(--podcast-rail);
}
.podcast-player__range::-moz-range-progress {
  height: .3rem;
  border-radius: 99px;
  background: var(--podcast-ink);
}
.podcast-player__range::-moz-range-thumb {
  width: .65rem;
  height: .65rem;
  border: 2px solid var(--podcast-surface);
  border-radius: 50%;
  background: var(--podcast-ink);
}
.podcast-player__download {
  display: inline-block;
  padding: .2rem .45rem;
  border-radius: 3px;
  color: var(--podcast-ink);
  font-size: .85rem;
  transition: background-color .15s ease-in-out, color .15s ease-in-out;
}
.podcast-player__download:hover {
  background: var(--podcast-hover);
}
@media screen and (max-width: 675px) {
  .podcast-player { padding: .75rem; }
}
@media screen and (max-width: 500px) {
  .podcast-player__controls {
    grid-template-columns: auto auto minmax(3rem, 1fr) auto;
    gap: .4rem;
  }
  .podcast-player__footer {
    gap: .7rem;
    padding-inline: .2rem;
  }
  .podcast-player__volume-control {
    min-width: 6.5rem;
    max-width: 8rem;
    gap: .4rem;
    margin-right: .3rem;
  }
  .podcast-player__volume { min-width: 3.75rem; }
  .podcast-player__time { min-width: 2.5rem; }
}
</style>`;

const PLAYER_SCRIPT = `
<script>
(() => {
  'use strict';

  const PLAYER_SELECTOR = '.podcast-player[data-podcast-player]';
  let refreshScheduled = false;

  function formatTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = String(seconds % 60).padStart(2, '0');
    return hours ? hours + ':' + String(minutes).padStart(2, '0') + ':' + remaining : minutes + ':' + remaining;
  }

  function luminance(value) {
    const hex = String(value || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    const rgb = String(value || '').match(/rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/i);
    let channels;
    if (hex) {
      const source = hex[1].length === 3 ? hex[1].split('').map(part => part + part).join('') : hex[1];
      channels = [0, 2, 4].map(offset => Number.parseInt(source.slice(offset, offset + 2), 16));
    } else if (rgb) {
      channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    }
    if (!channels) return 1;
    return (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255;
  }

  function isDarkTheme() {
    const style = getComputedStyle(document.documentElement);
    const card = style.getPropertyValue('--inside-card-background') || style.getPropertyValue('--inside-background');
    return luminance(card) < 0.5;
  }

  function setRangeFill(input, value, maximum) {
    const percent = maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
    input.style.setProperty('--podcast-range-fill', percent + '%');
  }

  function initialisePlayer(player) {
    if (player.dataset.podcastReady === 'true') return;

    const audio = player.querySelector('.podcast-player__audio');
    const playButton = player.querySelector('[data-podcast-action="play"]');
    const muteButton = player.querySelector('[data-podcast-action="mute"]');
    const progress = player.querySelector('.podcast-player__progress');
    const volume = player.querySelector('.podcast-player__volume');
    const current = player.querySelector('.podcast-player__current');
    const duration = player.querySelector('.podcast-player__duration');
    const status = player.querySelector('.podcast-player__status');
    const statusText = player.querySelector('.podcast-player__status-text');
    if (!audio || !playButton || !muteButton || !progress || !volume || !current || !duration || !status || !statusText) return;

    player.dataset.podcastReady = 'true';
    player.dataset.podcastEnhanced = 'true';

    function syncPlaying() {
      const playing = !audio.paused && !audio.ended;
      player.dataset.podcastPlaying = playing ? 'true' : 'false';
      playButton.setAttribute('aria-label', playing ? '暂停' : '播放');
      playButton.setAttribute('aria-pressed', playing ? 'true' : 'false');
    }

    function showLoading() {
      delete player.dataset.podcastError;
      player.dataset.podcastLoading = 'true';
      statusText.textContent = '';
      status.setAttribute('aria-label', '正在加载音频');
    }

    function clearStatus() {
      delete player.dataset.podcastLoading;
      delete player.dataset.podcastError;
      statusText.textContent = '';
      status.removeAttribute('aria-label');
    }

    function syncDuration() {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      progress.max = String(audio.duration);
      duration.textContent = formatTime(audio.duration);
      syncTime();
      clearStatus();
    }

    function syncTime() {
      const maximum = Number(progress.max);
      const position = Number.isFinite(audio.currentTime) ? Math.min(audio.currentTime, maximum || audio.currentTime) : 0;
      progress.value = String(position);
      current.textContent = formatTime(position);
      progress.setAttribute('aria-valuetext', formatTime(position));
      setRangeFill(progress, position, maximum);
    }

    function syncVolume() {
      const muted = audio.muted || audio.volume === 0;
      player.dataset.podcastMuted = muted ? 'true' : 'false';
      muteButton.setAttribute('aria-label', muted ? '取消静音' : '静音');
      muteButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
      volume.value = String(audio.volume);
      setRangeFill(volume, audio.volume, 1);
    }

    function showError() {
      delete player.dataset.podcastLoading;
      player.dataset.podcastError = 'true';
      statusText.textContent = '音频加载失败，请尝试下载音频。';
      status.setAttribute('aria-label', statusText.textContent);
    }

    playButton.addEventListener('click', () => {
      if (audio.paused || audio.ended) {
        if (audio.ended) audio.currentTime = 0;
        audio.play().catch(showError);
      } else {
        audio.pause();
      }
    });

    muteButton.addEventListener('click', () => {
      if (audio.muted || audio.volume === 0) {
        audio.muted = false;
        audio.volume = Number(player.dataset.podcastLastVolume || .8);
      } else {
        player.dataset.podcastLastVolume = String(audio.volume || .8);
        audio.muted = true;
      }
    });

    progress.addEventListener('input', () => {
      const position = Number(progress.value);
      if (Number.isFinite(position) && Number.isFinite(audio.duration)) audio.currentTime = position;
      current.textContent = formatTime(position);
      progress.setAttribute('aria-valuetext', formatTime(position));
      setRangeFill(progress, position, Number(progress.max));
    });

    volume.addEventListener('input', () => {
      audio.muted = false;
      audio.volume = Number(volume.value);
    });

    audio.addEventListener('loadstart', showLoading);
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('canplay', clearStatus);
    audio.addEventListener('timeupdate', syncTime);
    audio.addEventListener('play', () => {
      syncPlaying();
      clearStatus();
    });
    audio.addEventListener('pause', syncPlaying);
    audio.addEventListener('ended', syncPlaying);
    audio.addEventListener('volumechange', syncVolume);
    audio.addEventListener('error', showError);

    syncPlaying();
    syncTime();
    syncVolume();
    if (audio.readyState >= 1) syncDuration();
    else showLoading();
  }

  function refreshPlayers() {
    refreshScheduled = false;
    const theme = isDarkTheme() ? 'dark' : 'light';
    document.querySelectorAll(PLAYER_SELECTOR).forEach(player => {
      player.dataset.podcastTheme = theme;
      initialisePlayer(player);
    });
  }

  function scheduleRefresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    (window.requestAnimationFrame || window.setTimeout)(refreshPlayers);
  }

  document.addEventListener('inside', scheduleRefresh);
  document.addEventListener('inside:theme', scheduleRefresh);
  new MutationObserver(scheduleRefresh).observe(document.body, { childList: true, subtree: true });
  scheduleRefresh();
})();
</script>`;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function podcastError(post, message) {
  const identifier = post.source || post.path || post.title || 'unknown post';
  return new Error(`Podcast metadata error in ${identifier}: ${message}`);
}

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value) {
  return `<![CDATA[${String(value == null ? '' : value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function stripHtml(value) {
  return String(value == null ? '' : value)
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function removePlayerMarkup(value) {
  return String(value == null ? '' : value)
    .replace(new RegExp(`${PLAYER_START}[\\s\\S]*?${PLAYER_END}\\s*`, 'g'), '');
}

function toAbsoluteUrl(value, siteUrl, message) {
  try {
    return new URL(String(value), siteUrl).href;
  } catch {
    throw new Error(message || `Invalid URL: ${value}`);
  }
}

function normaliseRelativeDirectory(value, fallback, field) {
  const directory = String(value == null ? fallback : value).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = directory.split('/');
  if (!directory || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Podcast configuration error: ${field} must be a non-empty relative directory.`);
  }
  return directory;
}

function toPodcastConfig(siteConfig = {}) {
  const raw = isObject(siteConfig.podcast) ? siteConfig.podcast : {};
  const category = isObject(raw.category) ? raw.category : {};
  const media = isObject(raw.media) ? raw.media : {};
  const feedPath = String(raw.path || 'podcast.xml').replace(/^\/+/, '');

  if (!feedPath || feedPath.includes('..')) throw new Error('Podcast configuration error: path must be a site-relative file path.');

  return {
    dryRun: raw.dry_run === undefined ? true : raw.dry_run === true,
    path: feedPath,
    title: String(raw.title || siteConfig.title || ''),
    description: String(raw.description || siteConfig.description || ''),
    author: String(raw.author || siteConfig.author || ''),
    email: String(raw.email || siteConfig.email || ''),
    language: String(raw.language || 'zh-CN'),
    link: String(raw.link || '/'),
    image: String(raw.image || 'favicon.png'),
    category: {
      text: String(category.text || ''),
      subcategory: String(category.subcategory || '')
    },
    explicit: raw.explicit === true,
    limit: raw.limit == null ? 0 : Number(raw.limit),
    media: {
      sourceDir: normaliseRelativeDirectory(media.source_dir, 'source/files', 'media.source_dir'),
      publicPath: normaliseRelativeDirectory(media.public_path, 'files', 'media.public_path'),
      url: String(media.url || '')
    }
  };
}

function validateFeedConfig(config) {
  for (const field of ['title', 'description', 'author', 'email', 'language', 'image']) {
    if (!config[field]) throw new Error(`Podcast configuration error: ${field} is required when dry_run is false.`);
  }
  if (!/^\S+@\S+\.\S+$/.test(config.email)) {
    throw new Error('Podcast configuration error: email must be a valid public contact address.');
  }
  if (!Number.isSafeInteger(config.limit) || config.limit < 0) {
    throw new Error('Podcast configuration error: limit must be a non-negative integer.');
  }
}

function hasPodcastMetadata(post) {
  return post && post.podcast !== undefined && post.podcast !== false;
}

function validateEpisodeFields(post, data, audio, type, length, duration, siteUrl, defaultExplicit, playerAudio) {
  const episode = data.episode == null ? null : Number(data.episode);
  if (episode !== null && (!Number.isSafeInteger(episode) || episode <= 0)) {
    throw podcastError(post, '`podcast.episode` must be a positive integer.');
  }

  const season = data.season == null ? null : Number(data.season);
  if (season !== null && (!Number.isSafeInteger(season) || season <= 0)) {
    throw podcastError(post, '`podcast.season` must be a positive integer.');
  }

  const episodeType = String(data.episode_type || 'full').toLowerCase();
  if (!EPISODE_TYPES.has(episodeType)) {
    throw podcastError(post, '`podcast.episode_type` must be full, trailer, or bonus.');
  }

  const guid = String(data.guid || audio);
  if (!guid) throw podcastError(post, '`podcast.guid` must not be empty.');

  let image = '';
  if (data.image) {
    image = toAbsoluteUrl(data.image, siteUrl, '`podcast.image` must be a valid URL.');
  }

  return {
    title: String(post.title || ''),
    audio,
    playerAudio,
    type,
    length,
    duration,
    episode,
    season,
    episodeType,
    explicit: data.explicit === undefined ? defaultExplicit : data.explicit === true,
    summary: String(data.summary || ''),
    guid,
    image
  };
}

function normaliseRemoteEpisode(post, siteUrl, defaultExplicit) {
  const data = post.podcast;
  const audio = String(data.audio || '');
  if (!audio) throw podcastError(post, '`podcast.audio` is required.');
  if (/[^\x21-\x7E]/.test(audio)) throw podcastError(post, '`podcast.audio` must use an ASCII URL.');

  let audioUrl;
  try {
    audioUrl = new URL(audio);
  } catch {
    throw podcastError(post, '`podcast.audio` must be an absolute HTTPS URL.');
  }
  if (audioUrl.protocol !== 'https:') throw podcastError(post, '`podcast.audio` must use HTTPS.');

  const type = String(data.type || '');
  if (!/^audio\/[a-z0-9.+-]+$/i.test(type)) throw podcastError(post, '`podcast.type` must be an audio MIME type.');

  const length = Number(data.length);
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw podcastError(post, '`podcast.length` must be a positive integer byte count.');
  }

  const duration = String(data.duration || '');
  if (!DURATION_PATTERN.test(duration)) {
    throw podcastError(post, '`podcast.duration` must be MM:SS or HH:MM:SS.');
  }

  return validateEpisodeFields(post, data, audioUrl.href, type, length, duration, siteUrl, defaultExplicit, audioUrl.href);
}

function normaliseLocalFile(post, value) {
  const file = String(value || '').trim();
  if (!file) throw podcastError(post, '`podcast.file` must be a non-empty relative path.');
  if (/[^\x21-\x7E]/.test(file)) throw podcastError(post, '`podcast.file` must use an ASCII path.');
  if (file.includes('\\') || file.startsWith('/') || file.includes('?') || file.includes('#')) {
    throw podcastError(post, '`podcast.file` must be a plain relative path below podcast.media.source_dir.');
  }
  const segments = file.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw podcastError(post, '`podcast.file` must not contain empty, dot, or parent path segments.');
  }
  return file;
}

function localRuntime(runtime = {}) {
  const config = runtime.media || {};
  return {
    baseDir: runtime.baseDir || process.cwd(),
    root: runtime.root || '/',
    media: {
      sourceDir: normaliseRelativeDirectory(config.sourceDir, 'source/files', 'media.source_dir'),
      publicPath: normaliseRelativeDirectory(config.publicPath, 'files', 'media.public_path'),
      url: String(config.url || '')
    }
  };
}

function localPublicPath(root, publicPath, file) {
  const prefix = String(root || '/').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return `/${[prefix, publicPath, file].filter(Boolean).join('/')}`;
}

function localAudioUrl(post, file, url) {
  if (!url || /[^\x21-\x7E]/.test(url)) {
    throw podcastError(post, '`podcast.media.url` must be an absolute HTTPS URL when `podcast.file` is used.');
  }
  let base;
  try {
    base = new URL(url.endsWith('/') ? url : `${url}/`);
  } catch {
    throw podcastError(post, '`podcast.media.url` must be an absolute HTTPS URL when `podcast.file` is used.');
  }
  if (base.protocol !== 'https:') {
    throw podcastError(post, '`podcast.media.url` must use HTTPS when `podcast.file` is used.');
  }
  return new URL(file, base).href;
}

function getMusicMetadata() {
  // Hexo evaluates local scripts in a VM context without a dynamic-import
  // callback. music-metadata exposes a CommonJS-compatible entry point here.
  if (!musicMetadata) musicMetadata = require('music-metadata');
  return musicMetadata;
}

async function readLocalMetadata(post, localPath, stat) {
  const key = `${localPath}:${stat.size}:${stat.mtimeMs}`;
  let entry = localMetadataCache.get(key);
  if (!entry) {
    entry = Promise.resolve().then(() => getMusicMetadata().parseFile(localPath, { duration: true }));
    localMetadataCache.set(key, entry);
  }

  let metadata;
  try {
    metadata = await entry;
  } catch (error) {
    localMetadataCache.delete(key);
    throw podcastError(post, `could not read local audio metadata: ${error.message}`);
  }

  const duration = Number(metadata && metadata.format && metadata.format.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw podcastError(post, 'could not determine a positive duration from the local audio file.');
  }
  return duration;
}

function formatDuration(seconds) {
  const total = Math.max(1, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  const pad = value => String(value).padStart(2, '0');
  return hours ? `${pad(hours)}:${pad(minutes)}:${pad(remaining)}` : `${pad(minutes)}:${pad(remaining)}`;
}

async function normaliseLocalEpisode(post, siteUrl, defaultExplicit, runtime) {
  const data = post.podcast;
  const legacyFields = ['audio', 'type', 'length', 'duration'].filter(field => Object.prototype.hasOwnProperty.call(data, field));
  if (legacyFields.length) {
    throw podcastError(post, '`podcast.file` cannot be combined with legacy fields: ' + legacyFields.join(', ') + '.');
  }

  const file = normaliseLocalFile(post, data.file);
  const options = localRuntime(runtime);
  const sourceRoot = path.resolve(options.baseDir, options.media.sourceDir);
  const localPath = path.resolve(sourceRoot, file);
  if (!localPath.startsWith(`${sourceRoot}${path.sep}`)) {
    throw podcastError(post, '`podcast.file` must resolve below podcast.media.source_dir.');
  }

  let stat;
  try {
    stat = await fs.lstat(localPath);
  } catch (error) {
    throw podcastError(post, `local audio file does not exist: ${file} (${error.code || error.message}).`);
  }
  if (!stat.isFile()) throw podcastError(post, `local audio path is not a regular file: ${file}.`);
  if (!Number.isSafeInteger(stat.size) || stat.size <= 0) {
    throw podcastError(post, `local audio file must have a positive byte size: ${file}.`);
  }

  const type = AUDIO_MIME_TYPES.get(path.extname(file).toLowerCase());
  if (!type) {
    throw podcastError(post, '`podcast.file` has an unsupported audio extension. Supported extensions: ' + Array.from(AUDIO_MIME_TYPES.keys()).join(', ') + '.');
  }

  const duration = formatDuration(await readLocalMetadata(post, localPath, stat));
  const audio = localAudioUrl(post, file, options.media.url);
  const playerAudio = localPublicPath(options.root, options.media.publicPath, file);
  return validateEpisodeFields(post, data, audio, type, stat.size, duration, siteUrl, defaultExplicit, playerAudio);
}

async function normaliseEpisode(post, siteUrl, defaultExplicit, runtime) {
  if (!isObject(post.podcast)) throw podcastError(post, '`podcast` must be a mapping.');
  if (Object.prototype.hasOwnProperty.call(post.podcast, 'file')) {
    return normaliseLocalEpisode(post, siteUrl, defaultExplicit, runtime);
  }
  return normaliseRemoteEpisode(post, siteUrl, defaultExplicit);
}

function renderPlayer(episode) {
  const metadata = String(episode.title || '');
  const playerAudio = episode.playerAudio || episode.audio;

  return `${PLAYER_START}
<aside class="podcast-player" data-podcast-player aria-label="播客播放器">
  <div class="podcast-player__header">
    <span class="podcast-player__status" role="status" aria-live="polite"><svg class="podcast-player__status-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg><span class="podcast-player__status-text"></span></span>
    <span class="podcast-player__meta">${escapeXml(metadata)}</span>
  </div>
  <audio class="podcast-player__audio" controls preload="metadata">
    <source src="${escapeXml(playerAudio)}" type="${escapeXml(episode.type)}">
    你的浏览器不支持 HTML5 音频播放。
  </audio>
  <div class="podcast-player__controls" role="group" aria-label="音频控制">
    <button class="podcast-player__button" type="button" data-podcast-action="play" aria-label="播放" aria-pressed="false">
      <svg class="podcast-player__icon podcast-player__icon--play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
      <svg class="podcast-player__icon podcast-player__icon--pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>
    </button>
    <span class="podcast-player__time podcast-player__current" aria-live="off">0:00</span>
    <input class="podcast-player__range podcast-player__progress" type="range" min="0" max="100" step="0.1" value="0" aria-label="播放进度" aria-valuetext="0:00">
    <span class="podcast-player__time podcast-player__duration">${escapeXml(episode.duration)}</span>
  </div>
  <div class="podcast-player__footer">
    <a class="podcast-player__download" href="${escapeXml(playerAudio)}" target="_blank" rel="noopener">下载音频</a>
    <div class="podcast-player__volume-control" role="group" aria-label="音量控制">
      <button class="podcast-player__button podcast-player__volume-button" type="button" data-podcast-action="mute" aria-label="静音" aria-pressed="false">
        <svg class="podcast-player__icon podcast-player__icon--volume" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h4l5 4V6L7 10zm12.5 2a3.5 3.5 0 0 0-2-3.15v6.29A3.5 3.5 0 0 0 15.5 12zm-2-8.2v2.06a6.5 6.5 0 0 1 0 12.28v2.06a8.5 8.5 0 0 0 0-16.4z"/></svg>
        <svg class="podcast-player__icon podcast-player__icon--muted" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h4l5 4V6L7 10zm10.9 2 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1-2.1-2.1z"/></svg>
      </button>
      <input class="podcast-player__range podcast-player__volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="音量">
    </div>
  </div>
</aside>
${PLAYER_END}`;
}

function formatRfc2822(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid publication date: ${value}`);
  return date.toUTCString().replace('GMT', '+0000');
}

async function getPublishedEpisodes(posts, siteUrl, defaultExplicit, now = new Date(), runtime) {
  const source = Array.isArray(posts) ? posts : posts.toArray();
  const postsToPublish = source
    .filter(post => hasPodcastMetadata(post))
    .filter(post => post.draft !== true && post.published !== false)
    .filter(post => {
      const date = new Date(post.date);
      return !Number.isNaN(date.getTime()) && date <= now;
    });
  const entries = await Promise.all(postsToPublish.map(async post => ({
    post,
    episode: await normaliseEpisode(post, siteUrl, defaultExplicit, runtime)
  })));
  return entries.sort((a, b) => new Date(b.post.date) - new Date(a.post.date));
}

function assertUniqueEpisodes(entries) {
  const audioUrls = new Set();
  const guids = new Set();
  for (const { post, episode } of entries) {
    if (audioUrls.has(episode.audio)) throw podcastError(post, `duplicate podcast.audio URL: ${episode.audio}`);
    if (guids.has(episode.guid)) throw podcastError(post, `duplicate podcast.guid: ${episode.guid}`);
    audioUrls.add(episode.audio);
    guids.add(episode.guid);
  }
}

function postUrl(post, siteUrl) {
  const value = post.permalink || post.path || '';
  return toAbsoluteUrl(value, siteUrl, 'Podcast post must have a valid permalink.');
}

function buildItem(post, episode, siteUrl) {
  const articleUrl = postUrl(post, siteUrl);
  const showNotes = removePlayerMarkup(post.content || '');
  const description = stripHtml(episode.summary || post.excerpt || showNotes || post.title);
  const lines = [
    '  <item>',
    `    <title>${escapeXml(post.title || '')}</title>`,
    `    <link>${escapeXml(articleUrl)}</link>`,
    `    <guid isPermaLink="false">${escapeXml(episode.guid)}</guid>`,
    `    <pubDate>${formatRfc2822(post.date)}</pubDate>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <content:encoded>${cdata(showNotes || description)}</content:encoded>`,
    `    <enclosure url="${escapeXml(episode.audio)}" length="${episode.length}" type="${escapeXml(episode.type)}"/>`,
    `    <itunes:duration>${escapeXml(episode.duration)}</itunes:duration>`,
    `    <itunes:episodeType>${escapeXml(episode.episodeType)}</itunes:episodeType>`,
    `    <itunes:explicit>${episode.explicit ? 'yes' : 'no'}</itunes:explicit>`
  ];

  if (episode.season !== null) lines.push(`    <itunes:season>${episode.season}</itunes:season>`);
  if (episode.episode !== null) lines.push(`    <itunes:episode>${episode.episode}</itunes:episode>`);
  if (episode.image) lines.push(`    <itunes:image href="${escapeXml(episode.image)}"/>`);

  lines.push('  </item>');
  return lines.join('\n');
}

async function buildFeed(posts, config, siteUrl, now = new Date(), runtime) {
  validateFeedConfig(config);
  const entries = await getPublishedEpisodes(posts, siteUrl, config.explicit, now, runtime);
  assertUniqueEpisodes(entries);

  const limited = config.limit > 0 ? entries.slice(0, config.limit) : entries;
  const channelUrl = toAbsoluteUrl(config.link, siteUrl, 'Podcast configuration error: link must be a valid URL.');
  const imageUrl = toAbsoluteUrl(config.image, siteUrl, 'Podcast configuration error: image must be a valid URL.');
  const feedUrl = toAbsoluteUrl(config.path, siteUrl, 'Podcast configuration error: path must be a valid URL.');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `  <title>${escapeXml(config.title)}</title>`,
    `  <link>${escapeXml(channelUrl)}</link>`,
    `  <description>${escapeXml(config.description)}</description>`,
    `  <language>${escapeXml(config.language)}</language>`,
    `  <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `  <itunes:title>${escapeXml(config.title)}</itunes:title>`,
    `  <itunes:author>${escapeXml(config.author)}</itunes:author>`,
    `  <itunes:summary>${escapeXml(config.description)}</itunes:summary>`,
    '  <itunes:owner>',
    `    <itunes:name>${escapeXml(config.author)}</itunes:name>`,
    `    <itunes:email>${escapeXml(config.email)}</itunes:email>`,
    '  </itunes:owner>',
    `  <itunes:explicit>${config.explicit ? 'yes' : 'no'}</itunes:explicit>`,
    '  <itunes:type>episodic</itunes:type>',
    `  <itunes:image href="${escapeXml(imageUrl)}"/>`,
    '  <image>',
    `    <url>${escapeXml(imageUrl)}</url>`,
    `    <title>${escapeXml(config.title)}</title>`,
    `    <link>${escapeXml(channelUrl)}</link>`,
    '  </image>',
    '  <generator>hexo-sil-podcast</generator>'
  ];

  if (config.category.text) {
    lines.push(`  <itunes:category text="${escapeXml(config.category.text)}">`);
    if (config.category.subcategory) lines.push(`    <itunes:category text="${escapeXml(config.category.subcategory)}"/>`);
    lines.push('  </itunes:category>');
  }

  if (limited.length) lines.push(`  <lastBuildDate>${formatRfc2822(limited[0].post.date)}</lastBuildDate>`);
  lines.push(...limited.map(({ post, episode }) => buildItem(post, episode, siteUrl)));
  lines.push('</channel>', '</rss>', '');
  return lines.join('\n');
}

function warnAboutArtwork(hexo, config) {
  if (config.image !== 'favicon.png') return;
  hexo.log.warn('Podcast cover uses favicon.png. Replace it with a 1400-3000px square image before submitting to podcast directories.');
}

function registerPlugin(hexo) {
  const config = toPodcastConfig(hexo.config);
  const siteUrl = hexo.config.url;
  const runtime = {
    baseDir: hexo.base_dir || process.cwd(),
    root: hexo.config.root || '/',
    media: config.media
  };

  hexo.extend.injector.register('head_end', PLAYER_STYLE);
  hexo.extend.injector.register('body_end', PLAYER_SCRIPT);
  hexo.extend.filter.register('before_post_render', async function (data) {
    if (!hasPodcastMetadata(data)) return data;
    const episode = await normaliseEpisode(data, siteUrl, config.explicit, runtime);
    data.content = `${renderPlayer(episode)}\n\n${data.content || ''}`;
    return data;
  });

  if (config.dryRun) {
    hexo.log.info('Podcast dry run enabled: player preview is active and podcast.xml will not be generated.');
    return;
  }

  validateFeedConfig(config);
  warnAboutArtwork(hexo, config);
  hexo.extend.generator.register('podcast', async function (locals) {
    return {
      path: config.path,
      data: await buildFeed(locals.posts, config, siteUrl, new Date(), runtime)
    };
  });
}

if (typeof hexo !== 'undefined') registerPlugin(hexo);

module.exports = {
  AUDIO_MIME_TYPES,
  PLAYER_END,
  PLAYER_SCRIPT,
  PLAYER_START,
  PLAYER_STYLE,
  buildFeed,
  formatDuration,
  getPublishedEpisodes,
  hasPodcastMetadata,
  normaliseEpisode,
  registerPlugin,
  renderPlayer,
  toPodcastConfig,
  validateFeedConfig
};
