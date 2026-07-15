'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const playerState = require('./lib/player-state');

const PLAYER_START = '<!-- hexo-sil-video:start -->';
const PLAYER_END = '<!-- hexo-sil-video:end -->';
const VIDEO_MIME_TYPES = new Map([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.webm', 'video/webm']
]);
const SUBTITLE_MIME_TYPES = new Map([
  ['.ass', new Set(['text/x-ssa', 'text/x-ssa; charset=utf-8', 'text/plain', 'text/plain; charset=utf-8'])],
  ['.srt', new Set(['application/x-subrip', 'application/x-subrip; charset=utf-8', 'text/plain', 'text/plain; charset=utf-8'])]
]);
const FONT_MIME_TYPES = new Map([
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf']
]);
const POSTER_EXTENSIONS = new Set(['.avif', '.gif', '.jpg', '.jpeg', '.png', '.webp']);
const BUILTIN_SKINS = Object.freeze({
  ephesus: Object.freeze({
    outputPath: 'css/hexo-sil-video.css',
    sourcePath: path.join(__dirname, 'skins', 'ephesus.css')
  })
});
const RUNTIME_ROUTES = Object.freeze({
  script: 'js/hexo-sil-video.js',
  worker: 'js/hexo-sil-video-worker.js',
  wasm: 'wasm/hexo-sil-video.wasm',
  modernWasm: 'wasm/hexo-sil-video-modern.wasm',
  defaultFont: 'fonts/hexo-sil-video-default.woff2'
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function videoError(post, message) {
  const identifier = post && (post.source || post.path || post.title) || 'unknown post';
  return new Error(`Video metadata error in ${identifier}: ${message}`);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function normaliseRelativeDirectory(value, fallback, field) {
  const directory = String(value == null ? fallback : value).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = directory.split('/');
  if (!directory || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Video configuration error: ${field} must be a non-empty relative directory.`);
  }
  return directory;
}

function normaliseRelativeFile(value, field, errorFactory = message => new Error(`Video configuration error: ${message}`)) {
  const file = String(value || '').trim();
  if (!file) throw errorFactory(`${field} must be a non-empty relative path.`);
  if (/[^\x21-\x7E]/.test(file)) throw errorFactory(`${field} must use an ASCII path.`);
  if (file.includes('\\') || file.startsWith('/') || file.includes('?') || file.includes('#')) {
    throw errorFactory(`${field} must be a plain relative path below video.media.prefix.`);
  }
  const segments = file.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw errorFactory(`${field} must not contain empty, dot, or parent path segments.`);
  }
  return file;
}

function normaliseHttpsUrl(value, field, errorFactory = message => new Error(`Video configuration error: ${message}`), trailingSlash = false) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/[^\x21-\x7E]/.test(source)) throw errorFactory(`${field} must be an ASCII absolute HTTPS URL.`);
  let url;
  try {
    url = new URL(source);
  } catch {
    throw errorFactory(`${field} must be an ASCII absolute HTTPS URL.`);
  }
  if (url.protocol !== 'https:') throw errorFactory(`${field} must use HTTPS.`);
  if (url.username || url.password) throw errorFactory(`${field} must not contain credentials.`);
  if (trailingSlash && (url.search || url.hash)) throw errorFactory(`${field} must not contain a query string or fragment.`);
  if (trailingSlash) url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.href;
}

function normaliseBuiltinSkin(value) {
  if (value == null || value === true) return 'ephesus';
  if (value === false) return false;
  const name = String(value).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BUILTIN_SKINS, name)) return name;
  throw new Error('Video configuration error: skin.builtin must be `ephesus` or false.');
}

function normaliseSkinOverride(value) {
  if (value == null || value === false || String(value).trim() === '') return '';
  if (typeof value !== 'string') throw new Error('Video configuration error: skin.override must be a root-relative CSS path.');
  const override = value.trim();
  const segments = override.slice(1).split('/');
  if (!override.startsWith('/') || override.startsWith('//') || !override.endsWith('.css') || override.includes('\\') || override.includes('?') || override.includes('#') || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('Video configuration error: skin.override must be a root-relative CSS path without query strings or dot segments.');
  }
  return override;
}

function normaliseAspectRatio(value) {
  const source = String(value == null ? '16/9' : value).trim();
  const match = source.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) {
    throw new Error('Video configuration error: aspect_ratio must use a positive width/height ratio.');
  }
  return `${Number(match[1])}/${Number(match[2])}`;
}

function normaliseFonts(value) {
  if (value == null) return {};
  if (!isObject(value)) throw new Error('Video configuration error: subtitles.fonts must be a mapping.');
  const fonts = {};
  for (const [rawName, rawFile] of Object.entries(value)) {
    const name = String(rawName).trim();
    if (!name || /[\r\n]/.test(name)) throw new Error('Video configuration error: subtitle font names must be non-empty single-line strings.');
    const file = normaliseRelativeFile(rawFile, `subtitles.fonts.${name}`);
    if (!FONT_MIME_TYPES.has(path.extname(file).toLowerCase())) {
      throw new Error(`Video configuration error: subtitles.fonts.${name} must use WOFF, WOFF2, TTF, or OTF.`);
    }
    fonts[name] = file;
  }
  return fonts;
}

function rejectRemovedMediaFields(media) {
  for (const field of ['manifest', 'object_prefix', 'public_path']) {
    if (Object.prototype.hasOwnProperty.call(media, field)) {
      const replacement = field === 'manifest' ? 'assets.manifest' : 'media.prefix';
      throw new Error(`Video configuration error: media.${field} was replaced by ${replacement}.`);
    }
  }
}

function toVideoConfig(siteConfig = {}) {
  const raw = isObject(siteConfig.video) ? siteConfig.video : {};
  const media = isObject(raw.media) ? raw.media : {};
  const assets = raw.assets == null ? {} : raw.assets;
  const subtitles = raw.subtitles == null ? {} : raw.subtitles;
  if (!isObject(assets)) throw new Error('Video configuration error: assets must be a mapping.');
  if (!isObject(subtitles)) throw new Error('Video configuration error: subtitles must be a mapping.');
  rejectRemovedMediaFields(media);
  const prefix = normaliseRelativeDirectory(media.prefix, 'files', 'media.prefix');
  const fonts = normaliseFonts(subtitles.fonts);
  const fallbackFont = String(subtitles.fallback_font || '').trim();
  if (fallbackFont && !Object.prototype.hasOwnProperty.call(fonts, fallbackFont)) {
    throw new Error('Video configuration error: subtitles.fallback_font must name an entry in subtitles.fonts.');
  }
  const skin = raw.skin === false ? { builtin: false } : raw.skin == null ? {} : raw.skin;
  if (!isObject(skin)) throw new Error('Video configuration error: skin must be a mapping or false.');
  const preload = raw.preload == null ? 'metadata' : String(raw.preload).trim();
  if (!['none', 'metadata', 'auto'].includes(preload)) throw new Error('Video configuration error: preload must be none, metadata, or auto.');
  return {
    assets: { enabled: assets.enabled === true },
    media: {
      prefix,
      sourceDir: normaliseRelativeDirectory(media.source_dir, prefix, 'media.source_dir'),
      url: normaliseHttpsUrl(media.url, 'media.url', undefined, true)
    },
    preload,
    aspectRatio: normaliseAspectRatio(raw.aspect_ratio),
    subtitles: { fonts, fallbackFont },
    skin: { builtin: normaliseBuiltinSkin(skin.builtin), override: normaliseSkinOverride(skin.override) }
  };
}

function rootPublicPath(root, file) {
  const prefix = String(root || '/').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return `/${[prefix, String(file || '').replace(/^\/+/, '')].filter(Boolean).join('/')}`;
}

function mediaFileUrl(root, media, file) {
  if (media.url) {
    const encoded = file.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return new URL(encoded, media.url).href;
  }
  return rootPublicPath(root, `${media.prefix}/${file}`);
}

function runtimeOptions(runtime = {}) {
  const media = isObject(runtime.media) ? runtime.media : {};
  const prefix = normaliseRelativeDirectory(media.prefix, 'files', 'media.prefix');
  return {
    baseDir: runtime.baseDir || process.cwd(),
    sourceRoot: path.resolve(runtime.sourceRoot || path.join(runtime.baseDir || process.cwd(), 'source')),
    root: runtime.root || '/',
    assetsEnabled: runtime.assetsEnabled === true,
    assetCapability: runtime.assetCapability || (typeof runtime.getAssetCapability === 'function' ? runtime.getAssetCapability() : null),
    onMissingAssets: runtime.onMissingAssets,
    media: {
      prefix,
      sourceDir: normaliseRelativeDirectory(media.sourceDir, prefix, 'media.source_dir'),
      url: normaliseHttpsUrl(media.url, 'media.url', undefined, true)
    },
    preload: runtime.preload || 'metadata',
    aspectRatio: runtime.aspectRatio || '16/9',
    subtitles: runtime.subtitles || { fonts: {}, fallbackFont: '' },
    routes: runtime.routes || RUNTIME_ROUTES
  };
}

async function localEntry(post, file, options, expected, field) {
  const key = `${options.media.prefix}/${file}`;
  const capability = options.assetsEnabled ? options.assetCapability : null;
  if (options.assetsEnabled && !capability && typeof options.onMissingAssets === 'function') options.onMissingAssets();
  if (capability) {
    let entry;
    try {
      entry = capability.getObject(key);
    } catch (error) {
      throw videoError(post, error.message.replace(/^Asset manifest error:\s*/, ''));
    }
    if (!entry) throw videoError(post, `asset manifest does not contain ${key}. Refresh or publish the asset manifest after adding the file.`);
    if (typeof expected === 'string' && entry.type !== expected) throw videoError(post, `asset manifest MIME type for ${key} is ${entry.type}, expected ${expected}.`);
    if (expected instanceof Set && !expected.has(entry.type)) throw videoError(post, `asset manifest MIME type for ${key} is ${entry.type}, expected ${Array.from(expected).join(' or ')}.`);
    if (typeof expected === 'function' && !expected(entry.type)) throw videoError(post, `asset manifest MIME type for ${key} is ${entry.type}, expected ${field}.`);
    return entry;
  }
  const mediaRoot = path.resolve(options.sourceRoot, options.media.sourceDir);
  if (mediaRoot !== options.sourceRoot && !mediaRoot.startsWith(`${options.sourceRoot}${path.sep}`)) {
    throw videoError(post, '`media.source_dir` must resolve below the Hexo source directory.');
  }
  const localPath = path.resolve(mediaRoot, file);
  if (!localPath.startsWith(`${mediaRoot}${path.sep}`)) throw videoError(post, `${field} must resolve below video.media.source_dir.`);
  let stat;
  try {
    stat = await fs.lstat(localPath);
  } catch (error) {
    throw videoError(post, `local ${field} file does not exist: ${file} (${error.code || error.message}).`);
  }
  if (!stat.isFile() || stat.size <= 0) throw videoError(post, `local ${field} path must be a non-empty regular file: ${file}.`);
  return { size: stat.size };
}

async function normaliseSubtitles(post, value, options) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw videoError(post, '`video.subtitles` must be a list.');
  let defaults = 0;
  const tracks = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!isObject(raw)) throw videoError(post, `subtitle ${index + 1} must be a mapping.`);
    const file = normaliseRelativeFile(raw.file, `subtitle ${index + 1}.file`, message => videoError(post, message));
    const extension = path.extname(file).toLowerCase();
    const acceptedTypes = SUBTITLE_MIME_TYPES.get(extension);
    if (!acceptedTypes) throw videoError(post, `subtitle ${index + 1}.file must use ASS or SRT.`);
    const label = String(raw.label || '').trim();
    const srclang = String(raw.srclang || '').trim();
    if (!label || /[\r\n]/.test(label)) throw videoError(post, `subtitle ${index + 1}.label must be a non-empty single-line string.`);
    if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(srclang)) throw videoError(post, `subtitle ${index + 1}.srclang must be a language tag.`);
    const isDefault = raw.default === true;
    if (isDefault) defaults += 1;
    await localEntry(post, file, options, acceptedTypes, 'subtitle');
    tracks.push({ file, format: extension.slice(1), label, srclang, default: isDefault, url: mediaFileUrl(options.root, options.media, file) });
  }
  if (defaults > 1) throw videoError(post, '`video.subtitles` may define only one default track.');
  return tracks;
}

async function normaliseVideo(post, data, runtime = {}) {
  if (!isObject(data)) throw videoError(post, '`video` must be a mapping.');
  const options = runtimeOptions(runtime);
  const hasFile = Object.prototype.hasOwnProperty.call(data, 'file') && String(data.file || '').trim() !== '';
  const hasUrl = Object.prototype.hasOwnProperty.call(data, 'url') && String(data.url || '').trim() !== '';
  if (hasFile === hasUrl) throw videoError(post, '`video` must define exactly one of `file` or `url`.');
  let source;
  let type = '';
  let file = '';
  if (hasFile) {
    file = normaliseRelativeFile(data.file, '`file`', message => videoError(post, message));
    type = VIDEO_MIME_TYPES.get(path.extname(file).toLowerCase());
    if (!type) throw videoError(post, '`file` must use MP4, M4V, or WebM.');
    await localEntry(post, file, options, type, 'video');
    source = mediaFileUrl(options.root, options.media, file);
  } else {
    source = normaliseHttpsUrl(data.url, '`url`', message => videoError(post, message));
    type = VIDEO_MIME_TYPES.get(path.extname(new URL(source).pathname).toLowerCase()) || '';
  }
  let poster = '';
  if (data.poster != null && String(data.poster).trim()) {
    const posterFile = normaliseRelativeFile(data.poster, '`poster`', message => videoError(post, message));
    if (!POSTER_EXTENSIONS.has(path.extname(posterFile).toLowerCase())) throw videoError(post, '`poster` must use AVIF, GIF, JPEG, PNG, or WebP.');
    await localEntry(post, posterFile, options, value => /^image\//.test(value), 'an image MIME type');
    poster = mediaFileUrl(options.root, options.media, posterFile);
  }
  const fonts = {};
  for (const [name, fontFile] of Object.entries(options.subtitles.fonts || {})) {
    await localEntry(post, fontFile, options, FONT_MIME_TYPES.get(path.extname(fontFile).toLowerCase()), 'font');
    fonts[name] = mediaFileUrl(options.root, options.media, fontFile);
  }
  const title = String(data.title || post && post.title || (file && path.basename(file, path.extname(file))) || '视频').trim();
  return {
    title,
    source,
    type,
    poster,
    preload: options.preload,
    aspectRatio: options.aspectRatio,
    subtitles: await normaliseSubtitles(post, data.subtitles, options),
    fonts,
    fallbackFont: options.subtitles.fallbackFont || '',
    runtime: Object.fromEntries(Object.entries(options.routes).map(([name, route]) => [name, rootPublicPath(options.root, route)]))
  };
}

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
  return `${PLAYER_START}
<aside class="sil-video-player" data-sil-video-player data-sil-video-model="${model}" tabindex="0" aria-label="视频播放器" style="--sil-video-aspect-ratio:${escapeHtml(video.aspectRatio)}">
  <div class="sil-video-player__stage" data-sil-video-stage tabindex="-1">
    <header class="sil-video-player__header"><span class="sil-video-player__title">${escapeHtml(video.title)}</span><span class="sil-video-player__status" data-sil-video-status role="status" aria-live="polite"></span></header>
    <div class="sil-video-player__viewport" data-sil-video-viewport>
      <div class="sil-video-player__media-layer" data-sil-video-media-layer style="--sil-video-brightness:1"><video class="sil-video-player__video" controls preload="${escapeHtml(video.preload)}"${poster}><source src="${escapeHtml(video.source)}"${type}>你的浏览器不支持 HTML5 视频播放。</video></div>
      <div class="sil-video-player__feedback" data-sil-video-feedback role="status" aria-live="polite" aria-atomic="true">${feedbackIcon}${brightnessIcon}${feedbackPlayIcon}${feedbackPauseIcon}<span data-sil-video-feedback-text></span></div>
    </div>
    <div class="sil-video-player__progress-row">
      <span class="sil-video-player__time" data-sil-video-current>0:00</span>
      <input class="sil-video-player__range sil-video-player__progress" data-sil-video-progress type="range" min="0" max="100" step="0.1" value="0" aria-label="播放进度" aria-valuetext="0:00">
      <span class="sil-video-player__time" data-sil-video-duration>--:--</span>
    </div>
    <div class="sil-video-player__toolbar" role="group" aria-label="视频控制">
      <button class="sil-video-player__button" data-sil-video-action="play" type="button" aria-label="播放" aria-pressed="false">${playIcon}</button>
      <div class="sil-video-player__volume-control">
        <button class="sil-video-player__button" data-sil-video-action="mute" type="button" aria-label="静音" aria-pressed="false">${volumeIcon}</button>
        <div class="sil-video-player__volume-popover"><input class="sil-video-player__range sil-video-player__volume" data-sil-video-volume type="range" min="0" max="1" step="0.05" value="1" aria-label="音量" orient="vertical"></div>
      </div>
      <button class="sil-video-player__button sil-video-player__rate" data-sil-video-action="rate" type="button" aria-label="播放速度 1 倍">1×</button>
      <button class="sil-video-player__button" data-sil-video-action="repeat" type="button" aria-label="播放一次" aria-pressed="false">${repeatIcon}</button>
      <div class="sil-video-player__subtitle-control">
        <button class="sil-video-player__button" data-sil-video-action="subtitles" type="button" aria-label="字幕" aria-expanded="false">${icon('subtitles', '<path d="M3 5h18v14H3zm2 2v10h14V7zm1 6h5v2H6zm7 0h5v2h-5zM6 9h8v2H6z"/>')}</button>
        <div class="sil-video-player__subtitle-menu" data-sil-video-subtitle-menu hidden></div>
      </div>
      <span class="sil-video-player__toolbar-spacer"></span>
      <a class="sil-video-player__button" href="${escapeHtml(video.source)}" target="_blank" rel="noopener" aria-label="下载视频" title="下载视频">${icon('download', '<path d="M11 3h2v10.2l3.6-3.6L18 11l-6 6-6-6 1.4-1.4 3.6 3.6zM5 19h14v2H5z"/>')}</a>
      <button class="sil-video-player__button" data-sil-video-action="fullscreen" type="button" aria-label="进入全屏">${icon('fullscreen', '<path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/>')}</button>
    </div>
  </div>
  <div class="sil-video-player__subtitle-downloads" data-sil-video-subtitle-downloads>${subtitleDownloads}</div>
</aside>
${PLAYER_END}`;
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

async function buildBrowserBundle(entryPoint, format) {
  const esbuild = require('esbuild');
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format,
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    legalComments: 'eof'
  });
  return Buffer.from(result.outputFiles[0].contents);
}

async function runtimeRouteData() {
  const jassubRoot = path.dirname(require.resolve('jassub/package.json'));
  return [
    { path: RUNTIME_ROUTES.script, data: await buildBrowserBundle(path.join(__dirname, 'runtime', 'player.js'), 'iife') },
    { path: RUNTIME_ROUTES.worker, data: await buildBrowserBundle(path.join(jassubRoot, 'dist', 'worker', 'worker.js'), 'esm') },
    { path: RUNTIME_ROUTES.wasm, data: await fs.readFile(path.join(jassubRoot, 'dist', 'wasm', 'jassub-worker.wasm')) },
    { path: RUNTIME_ROUTES.modernWasm, data: await fs.readFile(path.join(jassubRoot, 'dist', 'wasm', 'jassub-worker-modern.wasm')) },
    { path: RUNTIME_ROUTES.defaultFont, data: await fs.readFile(path.join(jassubRoot, 'dist', 'default.woff2')) }
  ];
}

function renderStylesheetLink(url) {
  return `<link rel="stylesheet" href="${escapeHtml(url)}">`;
}

function registerVideoPlugin(hexo) {
  const config = toVideoConfig(hexo.config);
  let warnedMissingAssets = false;
  const runtime = {
    baseDir: hexo.base_dir || process.cwd(),
    sourceRoot: hexo.source_dir || path.join(hexo.base_dir || process.cwd(), hexo.config.source_dir || 'source'),
    root: hexo.config.root || '/',
    assetsEnabled: config.assets.enabled,
    getAssetCapability: () => hexo.sil && hexo.sil.assets,
    onMissingAssets: () => {
      if (warnedMissingAssets) return;
      warnedMissingAssets = true;
      if (hexo.log && hexo.log.warn) hexo.log.warn('hexo-sil-video: assets integration is enabled but hexo-sil-assets is not installed; using legacy local files.');
    },
    media: config.media,
    preload: config.preload,
    aspectRatio: config.aspectRatio,
    subtitles: config.subtitles,
    routes: RUNTIME_ROUTES
  };
  if (config.skin.builtin) {
    const skin = BUILTIN_SKINS[config.skin.builtin];
    hexo.extend.generator.register('hexo-sil-video-skin', async () => ({ path: skin.outputPath, data: await fs.readFile(skin.sourcePath) }));
    hexo.extend.injector.register('head_end', renderStylesheetLink(rootPublicPath(runtime.root, skin.outputPath)));
  }
  if (config.skin.override) hexo.extend.injector.register('head_end', renderStylesheetLink(rootPublicPath(runtime.root, config.skin.override)));
  hexo.extend.generator.register('hexo-sil-video-runtime', runtimeRouteData);
  hexo.extend.injector.register('body_end', `<script src="${escapeHtml(rootPublicPath(runtime.root, RUNTIME_ROUTES.script))}" defer></script>`);
  hexo.extend.tag.register('video', async function (args) {
    return renderVideoPlayer(await normaliseVideo(this, mergeVideo(this.video, parseVideoTagArgs(args)), runtime));
  }, { async: true });
  hexo.extend.filter.register('after_post_render', async function (data) {
    if (!data || data.video === undefined || data.video === false || String(data.content || '').includes(PLAYER_START)) return data;
    data.content = `${renderVideoPlayer(await normaliseVideo(data, data.video, runtime))}\n\n${data.content || ''}`;
    return data;
  });
}

module.exports = {
  BUILTIN_SKINS,
  FONT_MIME_TYPES,
  PLAYER_END,
  PLAYER_START,
  RUNTIME_ROUTES,
  SUBTITLE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  ...playerState,
  buildBrowserBundle,
  mediaFileUrl,
  mergeVideo,
  normaliseVideo,
  parseVideoTagArgs,
  registerVideoPlugin,
  renderVideoPlayer,
  rootPublicPath,
  runtimeRouteData,
  toVideoConfig
};
