'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function createVideoModel({
  fontMimeTypes,
  posterExtensions,
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

  async function localEntry(post, file, options, expected, field) {
    const key = `${options.media.prefix}/${file}`;
    const capability = options.assetsEnabled ? options.assetCapability : null;
    if (options.assetsEnabled && !capability && typeof options.onMissingAssets === 'function') options.onMissingAssets();
    if (capability) {
      let entry;
      try { entry = capability.getObject(key); } catch (error) {
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
    try { stat = await fs.lstat(localPath); } catch (error) {
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
      const acceptedTypes = subtitleMimeTypes.get(extension);
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
      type = videoMimeTypes.get(path.extname(file).toLowerCase());
      if (!type) throw videoError(post, '`file` must use MP4, M4V, or WebM.');
      await localEntry(post, file, options, type, 'video');
      source = mediaFileUrl(options.root, options.media, file);
    } else {
      source = normaliseHttpsUrl(data.url, '`url`', message => videoError(post, message));
      type = videoMimeTypes.get(path.extname(new URL(source).pathname).toLowerCase()) || '';
    }
    let poster = '';
    if (data.poster != null && String(data.poster).trim()) {
      const posterFile = normaliseRelativeFile(data.poster, '`poster`', message => videoError(post, message));
      if (!posterExtensions.has(path.extname(posterFile).toLowerCase())) throw videoError(post, '`poster` must use AVIF, GIF, JPEG, PNG, or WebP.');
      await localEntry(post, posterFile, options, value => /^image\//.test(value), 'an image MIME type');
      poster = mediaFileUrl(options.root, options.media, posterFile);
    }
    const fonts = {};
    for (const [name, fontFile] of Object.entries(options.subtitles.fonts || {})) {
      await localEntry(post, fontFile, options, fontMimeTypes.get(path.extname(fontFile).toLowerCase()), 'font');
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

  return { normaliseVideo };
}

module.exports = { createVideoModel };
