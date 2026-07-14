'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const PLAYER_START = '<!-- hexo-sil-audio:start -->';
const PLAYER_END = '<!-- hexo-sil-audio:end -->';
const DURATION_PATTERN = /^(?:\d{1,3}:)?[0-5]\d:[0-5]\d$/;
const AUDIO_MIME_TYPES = new Map([
  ['.mp3', 'audio/mpeg'], ['.m4a', 'audio/mp4'], ['.m4b', 'audio/mp4'], ['.mp4', 'audio/mp4'],
  ['.aac', 'audio/aac'], ['.ogg', 'audio/ogg'], ['.opus', 'audio/opus'], ['.wav', 'audio/wav'],
  ['.wave', 'audio/wav'], ['.flac', 'audio/flac'], ['.aif', 'audio/aiff'], ['.aiff', 'audio/aiff'], ['.webm', 'audio/webm']
]);

let musicMetadata;
const localMetadataCache = new Map();

const BUILTIN_SKINS = Object.freeze({
  ephesus: Object.freeze({
    outputPath: 'css/hexo-sil-audio.css',
    sourcePath: path.join(__dirname, '..', 'assets', 'hexo-sil-audio', 'skins', 'ephesus.css')
  })
});

const PLAYER_SCRIPT = `
<script>
(() => {
  'use strict';
  const selector = '.sil-audio-player[data-sil-audio-player]';
  const playerRefreshers = new WeakMap();
  let refreshScheduled = false;
  const formatTime = value => { const seconds=Math.max(0,Math.floor(Number(value)||0));const hours=Math.floor(seconds/3600);const minutes=Math.floor((seconds%3600)/60);const remaining=String(seconds%60).padStart(2,'0');return hours?hours+':'+String(minutes).padStart(2,'0')+':'+remaining:minutes+':'+remaining; };
  function luminance(value) { const hex=String(value||'').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);const rgb=String(value||'').match(/rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/i);let channels;if(hex){const source=hex[1].length===3?hex[1].split('').map(part=>part+part).join(''):hex[1];channels=[0,2,4].map(offset=>Number.parseInt(source.slice(offset,offset+2),16));}else if(rgb){channels=[Number(rgb[1]),Number(rgb[2]),Number(rgb[3])];}return channels?(channels[0]*.2126+channels[1]*.7152+channels[2]*.0722)/255:1; }
  function isDarkTheme() { const target=document.body||document.documentElement;const background=getComputedStyle(target).backgroundColor;return luminance(background)<.5; }
  function setRangeFill(input,value,maximum) { const percent=maximum>0?Math.max(0,Math.min(100,value/maximum*100)):0;input.style.setProperty('--sil-audio-range-fill',percent+'%'); }
  function initialise(player) {
    const existing = playerRefreshers.get(player);
    if(existing) return existing;
    if(player.dataset.silAudioReady==='true') return;
    const audio=player.querySelector('.sil-audio-player__audio');const play=player.querySelector('[data-sil-audio-action="play"]');const mute=player.querySelector('[data-sil-audio-action="mute"]');const progress=player.querySelector('.sil-audio-player__progress');const current=player.querySelector('.sil-audio-player__current');const duration=player.querySelector('.sil-audio-player__duration');const status=player.querySelector('.sil-audio-player__status');const statusText=player.querySelector('.sil-audio-player__status-text');const meta=player.querySelector('.sil-audio-player__meta');const metaText=player.querySelector('.sil-audio-player__meta-text');
    if(!audio||!play||!mute||!progress||!current||!duration||!status||!statusText||!meta||!metaText) return;
    player.dataset.silAudioReady='true';player.dataset.silAudioEnhanced='true';
    const syncTitle=()=>{(window.requestAnimationFrame||window.setTimeout)(()=>{const distance=Math.max(0,metaText.scrollWidth-meta.clientWidth);if(distance>0){player.dataset.silAudioTitleOverflow='true';player.style.setProperty('--sil-audio-title-distance',distance+'px');}else{delete player.dataset.silAudioTitleOverflow;player.style.removeProperty('--sil-audio-title-distance');}});};
    const syncPlaying=()=>{const playing=!audio.paused&&!audio.ended;player.dataset.silAudioPlaying=playing?'true':'false';play.setAttribute('aria-label',playing?'暂停':'播放');play.setAttribute('aria-pressed',playing?'true':'false');};
    const showLoading=()=>{delete player.dataset.silAudioError;player.dataset.silAudioLoading='true';statusText.textContent='';status.setAttribute('aria-label','正在加载音频');syncTitle();};
    const clearStatus=()=>{delete player.dataset.silAudioLoading;delete player.dataset.silAudioError;statusText.textContent='';status.removeAttribute('aria-label');syncTitle();};
    const syncTime=()=>{const maximum=Number(progress.max);const position=Number.isFinite(audio.currentTime)?Math.min(audio.currentTime,maximum||audio.currentTime):0;progress.value=String(position);current.textContent=formatTime(position);progress.setAttribute('aria-valuetext',formatTime(position));setRangeFill(progress,position,maximum);};
    const syncDuration=()=>{if(!Number.isFinite(audio.duration)||audio.duration<=0) return;progress.max=String(audio.duration);duration.textContent=formatTime(audio.duration);syncTime();clearStatus();};
    const syncVolume=()=>{const muted=audio.muted||audio.volume===0;player.dataset.silAudioMuted=muted?'true':'false';mute.setAttribute('aria-label',muted?'取消静音':'静音');mute.setAttribute('aria-pressed',muted?'true':'false');};
    const showError=()=>{delete player.dataset.silAudioLoading;player.dataset.silAudioError='true';statusText.textContent='音频加载失败，请尝试下载音频。';status.setAttribute('aria-label',statusText.textContent);syncTitle();};
    const refreshPlayer=()=>{syncTitle();};
    play.addEventListener('click',()=>{if(audio.paused||audio.ended){if(audio.ended) audio.currentTime=0;audio.play().catch(showError);}else audio.pause();});
    mute.addEventListener('click',()=>{if(audio.muted||audio.volume===0){audio.muted=false;audio.volume=Number(player.dataset.silAudioLastVolume||.8);}else{player.dataset.silAudioLastVolume=String(audio.volume||.8);audio.muted=true;}});
    progress.addEventListener('input',()=>{const position=Number(progress.value);if(Number.isFinite(position)&&Number.isFinite(audio.duration)) audio.currentTime=position;current.textContent=formatTime(position);progress.setAttribute('aria-valuetext',formatTime(position));setRangeFill(progress,position,Number(progress.max));});
    audio.addEventListener('loadstart',showLoading);audio.addEventListener('loadedmetadata',syncDuration);audio.addEventListener('durationchange',syncDuration);audio.addEventListener('canplay',clearStatus);audio.addEventListener('timeupdate',syncTime);audio.addEventListener('play',()=>{syncPlaying();clearStatus();});audio.addEventListener('pause',syncPlaying);audio.addEventListener('ended',syncPlaying);audio.addEventListener('volumechange',syncVolume);audio.addEventListener('error',showError);
    playerRefreshers.set(player,refreshPlayer);syncPlaying();syncTime();syncVolume();if(audio.readyState>=1) syncDuration();else showLoading();
    return refreshPlayer;
  }
  function refresh() { refreshScheduled=false;const theme=isDarkTheme()?'dark':'light';document.querySelectorAll(selector).forEach(player=>{player.dataset.silAudioTheme=theme;const refreshPlayer=initialise(player);if(refreshPlayer) refreshPlayer();}); }
  function scheduleRefresh() { if(refreshScheduled) return;refreshScheduled=true;(window.requestAnimationFrame||window.setTimeout)(refresh); }
  function observeMutations(records) { if(records.some(record=>Array.from(record.addedNodes).some(node=>node.nodeType===1&&(node.matches(selector)||node.querySelector(selector))))) scheduleRefresh(); }
  window.addEventListener('resize',scheduleRefresh);document.addEventListener('inside',scheduleRefresh);document.addEventListener('inside:theme',scheduleRefresh);new MutationObserver(observeMutations).observe(document.body,{childList:true,subtree:true});scheduleRefresh();
})();
</script>`;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function audioError(post, message) {
  const identifier = post && (post.source || post.path || post.title) || 'unknown post';
  return new Error(`Audio metadata error in ${identifier}: ${message}`);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function formatDuration(seconds) {
  const total = Math.max(1, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  const pad = value => String(value).padStart(2, '0');
  return hours ? `${pad(hours)}:${pad(minutes)}:${pad(remaining)}` : `${pad(minutes)}:${pad(remaining)}`;
}

function normaliseRelativeDirectory(value, fallback, field) {
  const directory = String(value == null ? fallback : value).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = directory.split('/');
  if (!directory || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Audio configuration error: ${field} must be a non-empty relative directory.`);
  }
  return directory;
}

function rejectRemovedMediaFields(media) {
  for (const field of ['manifest', 'object_prefix', 'public_path']) {
    if (Object.prototype.hasOwnProperty.call(media, field)) {
      const replacement = field === 'manifest' ? 'assets.manifest' : 'media.prefix';
      throw new Error(`Audio configuration error: media.${field} was replaced by ${replacement}.`);
    }
  }
}

function normaliseMediaUrl(value, field = 'media.url', label = 'Audio') {
  if (value == null || value === false || String(value).trim() === '') return '';
  const source = String(value).trim();
  if (/[^\x21-\x7E]/.test(source)) throw new Error(`${label} configuration error: ${field} must be an ASCII absolute HTTPS URL.`);
  let url;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`${label} configuration error: ${field} must be an ASCII absolute HTTPS URL.`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label} configuration error: ${field} must use HTTPS.`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`${label} configuration error: ${field} must not contain credentials, a query string, or a fragment.`);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.href;
}

function normaliseBuiltinSkin(value) {
  if (value == null || value === true) return 'ephesus';
  if (value === false) return false;
  const name = String(value).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BUILTIN_SKINS, name)) return name;
  throw new Error('Audio configuration error: skin.builtin must be `ephesus` or false.');
}

function normaliseSkinOverride(value) {
  if (value == null || value === false || String(value).trim() === '') return '';
  if (typeof value !== 'string') throw new Error('Audio configuration error: skin.override must be a root-relative CSS path.');
  const override = value.trim();
  const segments = override.slice(1).split('/');
  if (!override.startsWith('/') || override.startsWith('//') || !override.endsWith('.css') || override.includes('\\') || override.includes('?') || override.includes('#') || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('Audio configuration error: skin.override must be a root-relative CSS path without query strings or dot segments.');
  }
  return override;
}

function toAudioConfig(siteConfig = {}) {
  const raw = isObject(siteConfig.audio) ? siteConfig.audio : {};
  const media = isObject(raw.media) ? raw.media : {};
  const assets = raw.assets == null ? {} : raw.assets;
  if (!isObject(assets)) throw new Error('Audio configuration error: assets must be a mapping.');
  rejectRemovedMediaFields(media);
  const prefix = normaliseRelativeDirectory(media.prefix, 'files', 'media.prefix');
  const skin = raw.skin === false ? { builtin: false } : raw.skin == null ? {} : raw.skin;
  if (!isObject(skin)) throw new Error('Audio configuration error: skin must be a mapping or false.');
  return {
    assets: { enabled: assets.enabled === true },
    media: {
      prefix,
      sourceDir: normaliseRelativeDirectory(media.source_dir, prefix, 'media.source_dir'),
      url: normaliseMediaUrl(media.url)
    },
    skin: {
      builtin: normaliseBuiltinSkin(skin.builtin),
      override: normaliseSkinOverride(skin.override)
    }
  };
}

function audioRuntime(runtime = {}) {
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
      url: normaliseMediaUrl(media.url)
    }
  };
}

function normaliseLocalFile(post, value) {
  const file = String(value || '').trim();
  if (!file) throw audioError(post, '`file` must be a non-empty relative path.');
  if (/[^\x21-\x7E]/.test(file)) throw audioError(post, '`file` must use an ASCII path.');
  if (file.includes('\\') || file.startsWith('/') || file.includes('?') || file.includes('#')) {
    throw audioError(post, '`file` must be a plain relative path below audio.media.prefix.');
  }
  const segments = file.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw audioError(post, '`file` must not contain empty, dot, or parent path segments.');
  }
  return file;
}

function localPublicPath(root, prefixPath, file) {
  const prefix = String(root || '/').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return `/${[prefix, prefixPath, file].filter(Boolean).join('/')}`;
}

function mediaFileUrl(root, media, file) {
  if (media.url) {
    const encoded = file.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return new URL(encoded, media.url).href;
  }
  return localPublicPath(root, media.prefix, file);
}

function rootPublicPath(root, file) {
  return localPublicPath(root, '', String(file || '').replace(/^\/+/, ''));
}

function renderStylesheetLink(url) {
  return `<link rel="stylesheet" href="${escapeHtml(url)}">`;
}

function getMusicMetadata() {
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
  try {
    const metadata = await entry;
    const duration = Number(metadata && metadata.format && metadata.format.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('could not determine a positive duration');
    return { duration, title: String(metadata && metadata.common && metadata.common.title || '').trim() };
  } catch (error) {
    localMetadataCache.delete(key);
    throw audioError(post, `could not read local audio metadata: ${error.message}`);
  }
}

async function normaliseLocalAudio(post, fileValue, runtime) {
  const file = normaliseLocalFile(post, fileValue);
  const options = audioRuntime(runtime);
  const type = AUDIO_MIME_TYPES.get(path.extname(file).toLowerCase());
  if (!type) throw audioError(post, '`file` has an unsupported audio extension. Supported extensions: ' + Array.from(AUDIO_MIME_TYPES.keys()).join(', ') + '.');
  const capability = options.assetsEnabled ? options.assetCapability : null;
  if (options.assetsEnabled && !capability && typeof options.onMissingAssets === 'function') options.onMissingAssets();
  let length;
  let duration;
  let embeddedTitle = '';
  if (capability) {
    const key = `${options.media.prefix}/${file}`;
    let entry;
    try {
      entry = capability.getObject(key);
    } catch (error) {
      throw audioError(post, error.message.replace(/^Asset manifest error:\s*/, ''));
    }
    if (!entry) throw audioError(post, `asset manifest does not contain ${key}. Run npm run publish after adding the file.`);
    if (entry.type !== type) throw audioError(post, `asset manifest MIME type for ${key} is ${entry.type}, expected ${type}.`);
    if (!entry.duration) throw audioError(post, `asset manifest does not contain an audio duration for ${key}. Re-publish the hydrated audio file.`);
    length = entry.size;
    duration = entry.duration;
    embeddedTitle = entry.title || '';
  } else {
    const sourceRoot = path.resolve(options.sourceRoot);
    const mediaRoot = path.resolve(sourceRoot, options.media.sourceDir);
    if (mediaRoot !== sourceRoot && !mediaRoot.startsWith(`${sourceRoot}${path.sep}`)) throw audioError(post, '`media.source_dir` must resolve below the Hexo source directory.');
    const localPath = path.resolve(mediaRoot, file);
    if (!localPath.startsWith(`${mediaRoot}${path.sep}`)) throw audioError(post, '`file` must resolve below audio.media.source_dir.');
    let stat;
    try {
      stat = await fs.lstat(localPath);
    } catch (error) {
      throw audioError(post, `local audio file does not exist: ${file} (${error.code || error.message}).`);
    }
    if (!stat.isFile()) throw audioError(post, `local audio path is not a regular file: ${file}.`);
    if (!Number.isSafeInteger(stat.size) || stat.size <= 0) throw audioError(post, `local audio file must have a positive byte size: ${file}.`);
    const metadata = await readLocalMetadata(post, localPath, stat);
    length = stat.size;
    duration = formatDuration(metadata.duration);
    embeddedTitle = metadata.title;
  }
  return {
    file,
    type,
    length,
    duration,
    embeddedTitle,
    playerAudio: mediaFileUrl(options.root, options.media, file)
  };
}

function remoteFileName(url) {
  const value = decodeURIComponent(url.pathname.split('/').pop() || '');
  return value || url.hostname;
}

function titleFor(post, data, fallback) {
  return String(data.title || '').trim() || String(post && post.title || '').trim() || String(fallback || '').trim() || '音频';
}

async function normaliseAudio(post, data, runtime) {
  if (!isObject(data)) throw audioError(post, '`music` must be a mapping.');
  const hasFile = Object.prototype.hasOwnProperty.call(data, 'file') && String(data.file || '').trim() !== '';
  const hasRemote = Object.prototype.hasOwnProperty.call(data, 'audio') && String(data.audio || '').trim() !== '';
  if (hasFile === hasRemote) throw audioError(post, '`music` must define exactly one of `file` or `audio`.');

  if (hasFile) {
    const local = await normaliseLocalAudio(post, data.file, runtime);
    return { ...local, title: titleFor(post, data, local.embeddedTitle || path.basename(local.file, path.extname(local.file))) };
  }

  const value = String(data.audio || '');
  if (/[^\x21-\x7E]/.test(value)) throw audioError(post, '`audio` must use an ASCII URL.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw audioError(post, '`audio` must be an absolute HTTPS URL.');
  }
  if (url.protocol !== 'https:') throw audioError(post, '`audio` must use HTTPS.');
  const explicitType = String(data.type || '');
  if (explicitType && !/^audio\/[a-z0-9.+-]+$/i.test(explicitType)) throw audioError(post, '`type` must be an audio MIME type.');
  const explicitDuration = String(data.duration || '');
  if (explicitDuration && !DURATION_PATTERN.test(explicitDuration)) throw audioError(post, '`duration` must be MM:SS or HH:MM:SS.');
  return {
    audio: url.href,
    playerAudio: url.href,
    type: explicitType || AUDIO_MIME_TYPES.get(path.extname(url.pathname).toLowerCase()) || '',
    duration: explicitDuration,
    title: titleFor(post, data, remoteFileName(url))
  };
}

function renderAudioPlayer(audio) {
  const playerAudio = audio.playerAudio || audio.audio;
  const type = audio.type ? ` type="${escapeHtml(audio.type)}"` : '';
  const duration = audio.duration || '--:--';
  return `${PLAYER_START}
<aside class="sil-audio-player" data-sil-audio-player aria-label="音频播放器">
  <div class="sil-audio-player__header">
    <span class="sil-audio-player__status" role="status" aria-live="polite"><svg class="sil-audio-player__status-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg><span class="sil-audio-player__status-text"></span></span>
    <span class="sil-audio-player__meta"><span class="sil-audio-player__meta-text">${escapeHtml(audio.title)}</span></span>
  </div>
  <audio class="sil-audio-player__audio" controls preload="metadata"><source src="${escapeHtml(playerAudio)}"${type}>你的浏览器不支持 HTML5 音频播放。</audio>
  <div class="sil-audio-player__controls" role="group" aria-label="音频控制">
    <input class="sil-audio-player__range sil-audio-player__progress" type="range" min="0" max="100" step="0.1" value="0" aria-label="播放进度" aria-valuetext="0:00">
  </div>
  <div class="sil-audio-player__footer">
    <span class="sil-audio-player__time sil-audio-player__current" aria-live="off">0:00</span>
    <button class="sil-audio-player__button sil-audio-player__volume-button" type="button" data-sil-audio-action="mute" aria-label="静音" aria-pressed="false"><svg class="sil-audio-player__icon sil-audio-player__icon--volume" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h4l5 4V6L7 10zm12.5 2a3.5 3.5 0 0 0-2-3.15v6.29A3.5 3.5 0 0 0 15.5 12zm-2-8.2v2.06a6.5 6.5 0 0 1 0 12.28v2.06a8.5 8.5 0 0 0 0-16.4z"/></svg><svg class="sil-audio-player__icon sil-audio-player__icon--muted" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h4l5 4V6L7 10zm10.9 2 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1-2.1-2.1z"/></svg></button>
    <button class="sil-audio-player__button sil-audio-player__play-button" type="button" data-sil-audio-action="play" aria-label="播放" aria-pressed="false"><svg class="sil-audio-player__icon sil-audio-player__icon--play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><svg class="sil-audio-player__icon sil-audio-player__icon--pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg></button>
    <a class="sil-audio-player__button sil-audio-player__download" href="${escapeHtml(playerAudio)}" target="_blank" rel="noopener" aria-label="下载音频" title="下载音频"><svg class="sil-audio-player__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17zM5 19h14v2H5z"/></svg></a>
    <span class="sil-audio-player__time sil-audio-player__duration">${escapeHtml(duration)}</span>
  </div>
</aside>
${PLAYER_END}`;
}

function hasMusicMetadata(post) {
  return post && post.music !== undefined && post.music !== false;
}

function parseMusicTagArgs(args) {
  if (!args.length) return {};
  const allowed = new Set(['file', 'audio', 'title', 'type', 'duration']);
  const values = {};
  for (const argument of args) {
    const separator = String(argument).indexOf('=');
    if (separator <= 0) throw new Error('Music tag arguments must use key=value syntax.');
    const key = String(argument).slice(0, separator).trim();
    if (!allowed.has(key)) throw new Error(`Music tag does not support \`${key}\`.`);
    if (Object.prototype.hasOwnProperty.call(values, key)) throw new Error(`Music tag defines \`${key}\` more than once.`);
    values[key] = String(argument).slice(separator + 1).trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2');
  }
  return values;
}

function mergeMusic(defaults, overrides) {
  const result = { ...(isObject(defaults) ? defaults : {}), ...overrides };
  if (Object.prototype.hasOwnProperty.call(overrides, 'file')) delete result.audio;
  if (Object.prototype.hasOwnProperty.call(overrides, 'audio')) delete result.file;
  return result;
}

function registerAudioPlugin(hexo) {
  const config = toAudioConfig(hexo.config);
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
      if (hexo.log && hexo.log.warn) hexo.log.warn('hexo-sil-audio: assets integration is enabled but hexo-sil-assets is not installed; using legacy local files.');
    },
    media: config.media
  };
  if (config.skin.builtin) {
    const skin = BUILTIN_SKINS[config.skin.builtin];
    hexo.extend.generator.register('hexo-sil-audio-skin', async () => ({
      path: skin.outputPath,
      data: await fs.readFile(skin.sourcePath)
    }));
    hexo.extend.injector.register('head_end', renderStylesheetLink(rootPublicPath(runtime.root, skin.outputPath)));
  }
  if (config.skin.override) hexo.extend.injector.register('head_end', renderStylesheetLink(rootPublicPath(runtime.root, config.skin.override)));
  hexo.extend.injector.register('body_end', PLAYER_SCRIPT);
  hexo.extend.tag.register('music', async function (args) {
    const overrides = parseMusicTagArgs(args);
    return renderAudioPlayer(await normaliseAudio(this, mergeMusic(this.music, overrides), runtime));
  }, { async: true });
  hexo.extend.filter.register('after_post_render', async function (data) {
    if (!hasMusicMetadata(data) || String(data.content || '').includes(PLAYER_START)) return data;
    data.content = `${renderAudioPlayer(await normaliseAudio(data, data.music, runtime))}\n\n${data.content || ''}`;
    return data;
  });
}

if (typeof hexo !== 'undefined') registerAudioPlugin(hexo);

module.exports = {
  AUDIO_MIME_TYPES,
  BUILTIN_SKINS,
  PLAYER_END,
  PLAYER_SCRIPT,
  PLAYER_START,
  audioError,
  formatDuration,
  hasMusicMetadata,
  mergeMusic,
  mediaFileUrl,
  normaliseAudio,
  normaliseLocalAudio,
  normaliseMediaUrl,
  parseMusicTagArgs,
  registerAudioPlugin,
  renderAudioPlayer,
  renderStylesheetLink,
  rootPublicPath,
  toAudioConfig
};
