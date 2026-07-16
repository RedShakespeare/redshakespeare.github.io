'use strict';

const path = require('node:path');
const { createPathConfig } = require('./path-config');
const { createRuntimeOptions } = require('./runtime-options');

function createVideoConfig({ builtinSkins, fontMimeTypes, runtimeRoutes }) {
  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  const { mediaFileUrl, normaliseHttpsUrl, normaliseRelativeDirectory, normaliseRelativeFile, rootPublicPath } = createPathConfig();

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
    if (!override.startsWith('/') || override.startsWith('//') || !override.endsWith('.css') || /[\\%?#]/.test(override) || segments.some(segment => !segment || segment === '.' || segment === '..')) {
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

  function normaliseMedia(media, prefix) {
    return {
      prefix,
      sourceDir: normaliseRelativeDirectory(media.sourceDir, prefix, 'media.source_dir'),
      url: normaliseHttpsUrl(media.url, 'media.url', undefined, true)
    };
  }

  function normaliseSubtitlesConfig(subtitles) {
    const fonts = normaliseFonts(subtitles.fonts);
    const fallbackFont = String(subtitles.fallbackFont || '').trim();
    if (fallbackFont && !Object.prototype.hasOwnProperty.call(fonts, fallbackFont)) {
      throw new Error('Video configuration error: subtitles.fallbackFont must name an entry in subtitles.fonts.');
    }
    return { fonts, fallbackFont };
  }

  function normalisePreload(value) {
    const preload = value == null ? 'metadata' : String(value).trim();
    if (!['none', 'metadata', 'auto'].includes(preload)) {
      throw new Error('Video configuration error: preload must be none, metadata, or auto.');
    }
    return preload;
  }

  function normaliseRuntimeFields({ media: rawMedia = {}, preload: rawPreload, aspectRatio: rawAspectRatio, subtitles: rawSubtitles }) {
    const media = isObject(rawMedia) ? rawMedia : {};
    const subtitles = rawSubtitles == null ? {} : rawSubtitles;
    if (!isObject(subtitles)) throw new Error('Video configuration error: subtitles must be a mapping.');
    const prefix = normaliseRelativeDirectory(media.prefix, 'files', 'media.prefix');
    const subtitleConfig = normaliseSubtitlesConfig(subtitles);
    const preload = normalisePreload(rawPreload);
    return {
      media: normaliseMedia(media, prefix),
      preload,
      aspectRatio: normaliseAspectRatio(rawAspectRatio),
      subtitles: subtitleConfig
    };
  }

  function optionalMapping(value, field) {
    if (value == null) return {};
    if (!isObject(value)) throw new Error(`Video configuration error: ${field} must be a mapping.`);
    return value;
  }

  function rejectLegacyMediaFields(media) {
    for (const field of ['manifest', 'object_prefix', 'public_path']) {
      if (!Object.prototype.hasOwnProperty.call(media, field)) continue;
      const replacement = field === 'manifest' ? 'assets.manifest' : 'media.prefix';
      throw new Error(`Video configuration error: media.${field} was replaced by ${replacement}.`);
    }
  }

  function normaliseSkinConfig(value) {
    const skin = value === false ? { builtin: false } : value == null ? {} : value;
    if (!isObject(skin)) throw new Error('Video configuration error: skin must be a mapping or false.');
    return { builtin: normaliseBuiltinSkin(skin.builtin), override: normaliseSkinOverride(skin.override) };
  }

  function toVideoConfig(siteConfig = {}) {
    const raw = optionalMapping(siteConfig.video, 'video');
    const media = optionalMapping(raw.media, 'media');
    const assets = optionalMapping(raw.assets, 'assets');
    const subtitles = optionalMapping(raw.subtitles, 'subtitles');
    rejectLegacyMediaFields(media);
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
      skin: normaliseSkinConfig(raw.skin)
    };
  }

  const runtimeOptions = createRuntimeOptions({ isObject, normaliseRoutes, normaliseRuntimeFields, runtimeRoutes });

  return { isObject, mediaFileUrl, normaliseHttpsUrl, normaliseRelativeFile, rootPublicPath, runtimeOptions, toVideoConfig };
}

module.exports = { createVideoConfig };
