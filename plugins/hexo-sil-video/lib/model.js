'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function createVideoModel({
  fontMimeTypes,
  posterMimeTypes,
  subtitleMimeTypes,
  videoMimeTypes,
  isObject,
  mediaFileUrl,
  normaliseHttpsUrl,
  normaliseRelativeFile,
  rootPublicPath,
  runtimeOptions
}) {
  function videoError(post, message) {
    const identifier = post && (post.source || post.path || post.title) || 'unknown post';
    return new Error(`Video metadata error in ${identifier}: ${message}`);
  }

  async function localEntry(post, file, options, expectation) {
    const field = expectation.description;
    const key = `${options.media.prefix}/${file}`;
    const cached = options.resourceCache.get(key);
    if (cached) return cached;
    const pending = validateLocalEntry(post, file, options, expectation);
    options.resourceCache.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      options.resourceCache.delete(key);
      throw error;
    }
  }

  async function validateLocalEntry(post, file, options, expectation) {
    const field = expectation.description;
    const key = `${options.media.prefix}/${file}`;
    const capability = options.assetsEnabled ? options.assetCapability : null;
    if (options.assetsEnabled && !capability && typeof options.onMissingAssets === 'function') options.onMissingAssets();
    if (capability) {
      let entry;
      try { entry = capability.getObject(key); } catch (error) {
        throw videoError(post, error.message.replace(/^Asset manifest error:\s*/, ''));
      }
      if (!entry) throw videoError(post, `asset manifest does not contain ${key}. Refresh or publish the asset manifest after adding the file.`);
      if (expectation.type && entry.type !== expectation.type) throw videoError(post, `asset manifest MIME type for ${key} is ${entry.type}, expected ${expectation.type}.`);
      if (expectation.types && !expectation.types.has(entry.type)) throw videoError(post, `asset manifest MIME type for ${key} is ${entry.type}, expected ${Array.from(expectation.types).join(' or ')}.`);
      if (expectation.test && !expectation.test(entry.type)) throw videoError(post, `asset manifest MIME type for ${key} is ${entry.type}, expected ${field}.`);
      return entry;
    }
    if (expectation.localType && expectation.type && expectation.localType !== expectation.type) {
      throw videoError(post, `${field} extension does not match expected MIME type ${expectation.type}.`);
    }
    if (expectation.localType && expectation.types && !expectation.types.has(expectation.localType)) {
      throw videoError(post, `${field} extension does not match an accepted MIME type.`);
    }
    if (expectation.localType && expectation.test && !expectation.test(expectation.localType)) {
      throw videoError(post, `${field} extension does not match the expected type.`);
    }
    const mediaRoot = path.resolve(options.sourceRoot, options.media.sourceDir);
    if (mediaRoot !== options.sourceRoot && !mediaRoot.startsWith(`${options.sourceRoot}${path.sep}`)) {
      throw videoError(post, '`media.source_dir` must resolve below the Hexo source directory.');
    }
    const localPath = path.resolve(mediaRoot, file);
    if (!localPath.startsWith(`${mediaRoot}${path.sep}`)) throw videoError(post, `${field} must resolve below video.media.source_dir.`);
    let stat;
    try { stat = await fs.lstat(localPath); } catch (error) {
      throw videoError(post, `local ${field} file does not exist: ${file} (${error.code || error.message}).`);
    }
    if (!stat.isFile() || stat.size <= 0) throw videoError(post, `local ${field} path must be a non-empty regular file: ${file}.`);
    return { size: stat.size, type: expectation.localType || '' };
  }

  async function normaliseSubtitles(post, value, options) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw videoError(post, '`video.subtitles` must be a list.');
    let defaults = 0;
    const tracks = value.map((raw, index) => {
      if (!isObject(raw)) throw videoError(post, `subtitle ${index + 1} must be a mapping.`);
      const file = normaliseRelativeFile(raw.file, `subtitle ${index + 1}.file`, message => videoError(post, message));
      const extension = path.extname(file).toLowerCase();
      const acceptedTypes = subtitleMimeTypes.get(extension);
      if (!acceptedTypes) throw videoError(post, `subtitle ${index + 1}.file must use ASS or SRT.`);
      const label = String(raw.label || '').trim();
      const srclang = String(raw.srclang || '').trim();
      if (!label || /[\r\n]/.test(label)) throw videoError(post, `subtitle ${index + 1}.label must be a non-empty single-line string.`);
      if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(srclang)) throw videoError(post, `subtitle ${index + 1}.srclang must be a language tag.`);
      const isDefault = raw.default === true;
      if (isDefault) defaults += 1;
      return { file, format: extension.slice(1), label, srclang, default: isDefault, url: mediaFileUrl(options.root, options.media, file), acceptedTypes, localType: acceptedTypes.values().next().value };
    });
    if (defaults > 1) throw videoError(post, '`video.subtitles` may define only one default track.');
    await Promise.all(tracks.map(track => localEntry(post, track.file, options, {
      types: track.acceptedTypes,
      localType: track.localType,
      description: 'subtitle'
    })));
    return tracks.map(({ acceptedTypes, localType, ...track }) => track);
  }

  async function normaliseSource(post, data, options) {
    const hasFile = Object.prototype.hasOwnProperty.call(data, 'file') && String(data.file || '').trim() !== '';
    const hasUrl = Object.prototype.hasOwnProperty.call(data, 'url') && String(data.url || '').trim() !== '';
    if (hasFile === hasUrl) throw videoError(post, '`video` must define exactly one of `file` or `url`.');
    if (!hasFile) {
      const source = normaliseHttpsUrl(data.url, '`url`', message => videoError(post, message));
      return {
        file: '',
        source,
        type: videoMimeTypes.get(path.extname(new URL(source).pathname).toLowerCase()) || ''
      };
    }
    const file = normaliseRelativeFile(data.file, '`file`', message => videoError(post, message));
    const type = videoMimeTypes.get(path.extname(file).toLowerCase());
    if (!type) throw videoError(post, '`file` must use MP4, M4V, WebM, OGG, OGV, MPEG, MPG, MOV, 3GP, or 3G2.');
    await localEntry(post, file, options, { type, localType: type, description: 'video' });
    return { file, source: mediaFileUrl(options.root, options.media, file), type };
  }

  async function normalisePoster(post, value, options) {
    if (value == null || !String(value).trim()) return '';
    const file = normaliseRelativeFile(value, '`poster`', message => videoError(post, message));
    const localType = posterMimeTypes.get(path.extname(file).toLowerCase());
    if (!localType) throw videoError(post, '`poster` must use AVIF, GIF, JPEG, PNG, or WebP.');
    await localEntry(post, file, options, {
      test: type => /^image\//.test(type),
      localType,
      description: 'an image MIME type'
    });
    return mediaFileUrl(options.root, options.media, file);
  }

  async function normaliseFonts(post, options) {
    const entries = Object.entries(options.subtitles.fonts || {});
    await Promise.all(entries.map(([, file]) => {
      const type = fontMimeTypes.get(path.extname(file).toLowerCase());
      return localEntry(post, file, options, { type, localType: type, description: 'font' });
    }));
    return Object.fromEntries(entries.map(([name, file]) => [name, mediaFileUrl(options.root, options.media, file)]));
  }

  async function normaliseVideo(post, data, runtime = {}) {
    if (!isObject(data)) throw videoError(post, '`video` must be a mapping.');
    const options = runtimeOptions(runtime);
    const { file, source, type } = await normaliseSource(post, data, options);
    const poster = await normalisePoster(post, data.poster, options);
    const [subtitles, fonts] = await Promise.all([
      normaliseSubtitles(post, data.subtitles, options),
      normaliseFonts(post, options)
    ]);
    const title = String(data.title || post && post.title || (file && path.basename(file, path.extname(file))) || '视频').trim();
    return {
      title,
      source,
      type,
      poster,
      preload: options.preload,
      aspectRatio: options.aspectRatio,
      subtitles,
      fonts,
      fallbackFont: options.subtitles.fallbackFont || '',
      runtime: Object.fromEntries(Object.entries(options.routes).map(([name, route]) => [name, rootPublicPath(options.root, route)]))
    };
  }

  return { normaliseVideo };
}

module.exports = { createVideoModel };
