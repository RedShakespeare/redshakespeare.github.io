'use strict';

const path = require('node:path');

function createVideoConfig({ builtinSkins, fontMimeTypes, runtimeRoutes }) {
  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function normaliseRelativeDirectory(value, fallback, field) {
    const raw = String(value == null ? fallback : value).trim();
    if (!raw || raw.startsWith('/') || /[^\x21-\x7E]/.test(raw) || raw.includes('\\') || raw.includes('?') || raw.includes('#')) {
      throw new Error(`Video configuration error: ${field} must be an ASCII relative directory.`);
    }
    const directory = raw.replace(/^\/+|\/+$/g, '');
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
    try { url = new URL(source); } catch { throw errorFactory(`${field} must be an ASCII absolute HTTPS URL.`); }
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
    if (Object.prototype.hasOwnProperty.call(builtinSkins, name)) return name;
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
      if (!fontMimeTypes.has(path.extname(file).toLowerCase())) {
        throw new Error(`Video configuration error: subtitles.fonts.${name} must use WOFF, WOFF2, TTF, or OTF.`);
      }
      fonts[name] = file;
    }
    return fonts;
  }

  function normaliseRoutes(value) {
    if (!isObject(value)) throw new Error('Video configuration error: runtime.routes must be a mapping.');
    const names = ['script', 'subtitles', 'worker', 'wasm', 'modernWasm', 'defaultFont'];
    return Object.fromEntries(names.map(name => {
      if (typeof value[name] !== 'string' || !value[name].trim()) {
        throw new Error(`Video configuration error: runtime.routes.${name} must be a relative path.`);
      }
      return [name, normaliseRelativeFile(value[name], `runtime.routes.${name}`)];
    }));
  }

  function normaliseRuntimeFields({ media: rawMedia = {}, preload: rawPreload, aspectRatio: rawAspectRatio, subtitles: rawSubtitles }) {
    const media = isObject(rawMedia) ? rawMedia : {};
    const subtitles = rawSubtitles == null ? {} : rawSubtitles;
    if (!isObject(subtitles)) throw new Error('Video configuration error: subtitles must be a mapping.');
    const prefix = normaliseRelativeDirectory(media.prefix, 'files', 'media.prefix');
    const fonts = normaliseFonts(subtitles.fonts);
    const fallbackFont = String(subtitles.fallbackFont || '').trim();
    if (fallbackFont && !Object.prototype.hasOwnProperty.call(fonts, fallbackFont)) {
      throw new Error('Video configuration error: subtitles.fallbackFont must name an entry in subtitles.fonts.');
    }
    const preload = rawPreload == null ? 'metadata' : String(rawPreload).trim();
    if (!['none', 'metadata', 'auto'].includes(preload)) throw new Error('Video configuration error: preload must be none, metadata, or auto.');
    return {
      media: {
        prefix,
        sourceDir: normaliseRelativeDirectory(media.sourceDir, prefix, 'media.source_dir'),
        url: normaliseHttpsUrl(media.url, 'media.url', undefined, true)
      },
      preload,
      aspectRatio: normaliseAspectRatio(rawAspectRatio),
      subtitles: { fonts, fallbackFont }
    };
  }

  function toVideoConfig(siteConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(siteConfig, 'video') && siteConfig.video != null && !isObject(siteConfig.video)) {
      throw new Error('Video configuration error: video must be a mapping.');
    }
    const raw = isObject(siteConfig.video) ? siteConfig.video : {};
    if (Object.prototype.hasOwnProperty.call(raw, 'media') && raw.media != null && !isObject(raw.media)) {
      throw new Error('Video configuration error: media must be a mapping.');
    }
    const media = isObject(raw.media) ? raw.media : {};
    const assets = raw.assets == null ? {} : raw.assets;
    const subtitles = raw.subtitles == null ? {} : raw.subtitles;
    if (!isObject(assets)) throw new Error('Video configuration error: assets must be a mapping.');
    if (!isObject(subtitles)) throw new Error('Video configuration error: subtitles must be a mapping.');
    for (const field of ['manifest', 'object_prefix', 'public_path']) {
      if (Object.prototype.hasOwnProperty.call(media, field)) {
        const replacement = field === 'manifest' ? 'assets.manifest' : 'media.prefix';
        throw new Error(`Video configuration error: media.${field} was replaced by ${replacement}.`);
      }
    }
    const skin = raw.skin === false ? { builtin: false } : raw.skin == null ? {} : raw.skin;
    if (!isObject(skin)) throw new Error('Video configuration error: skin must be a mapping or false.');
    const common = normaliseRuntimeFields({
      media: { prefix: media.prefix, sourceDir: media.source_dir, url: media.url },
      preload: raw.preload,
      aspectRatio: raw.aspect_ratio,
      subtitles: { fonts: subtitles.fonts, fallbackFont: subtitles.fallback_font }
    });
    return {
      assets: { enabled: assets.enabled === true },
      media: common.media,
      preload: common.preload,
      aspectRatio: common.aspectRatio,
      subtitles: common.subtitles,
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
    if (runtime.media != null && !isObject(runtime.media)) throw new Error('Video configuration error: runtime.media must be a mapping.');
    const common = normaliseRuntimeFields({
      media: runtime.media,
      preload: runtime.preload,
      aspectRatio: runtime.aspectRatio,
      subtitles: runtime.subtitles,
      routes: runtime.routes || runtimeRoutes
    });
    return {
      baseDir: runtime.baseDir || process.cwd(),
      sourceRoot: path.resolve(runtime.sourceRoot || path.join(runtime.baseDir || process.cwd(), 'source')),
      root: runtime.root || '/',
      assetsEnabled: runtime.assetsEnabled === true,
      assetCapability: runtime.assetCapability || (typeof runtime.getAssetCapability === 'function' ? runtime.getAssetCapability() : null),
      onMissingAssets: runtime.onMissingAssets,
      resourceCache: new Map(),
      media: common.media,
      preload: common.preload,
      aspectRatio: common.aspectRatio,
      subtitles: common.subtitles,
      routes: normaliseRoutes(runtime.routes || runtimeRoutes)
    };
  }

  return { isObject, mediaFileUrl, normaliseHttpsUrl, normaliseRelativeFile, rootPublicPath, runtimeOptions, toVideoConfig };
}

module.exports = { createVideoConfig };
