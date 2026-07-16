'use strict';

const path = require('node:path');

function createRuntimeOptions({ isObject, normaliseRoutes, normaliseRuntimeFields, runtimeRoutes }) {
  return function runtimeOptions(runtime = {}) {
    if (runtime.media != null && !isObject(runtime.media)) throw new Error('Video configuration error: runtime.media must be a mapping.');
    const common = normaliseRuntimeFields({
      media: runtime.media,
      preload: runtime.preload,
      aspectRatio: runtime.aspectRatio,
      subtitles: runtime.subtitles
    });
    return {
      baseDir: runtime.baseDir || process.cwd(),
      sourceRoot: path.resolve(runtime.sourceRoot || path.join(runtime.baseDir || process.cwd(), 'source')),
      root: runtime.root || '/',
      assetsEnabled: runtime.assetsEnabled === true,
      assetCapability: runtime.assetCapability || (typeof runtime.getAssetCapability === 'function' ? runtime.getAssetCapability() : null),
      onMissingAssets: runtime.onMissingAssets,
      resourceCache: runtime.resourceCache instanceof Map ? runtime.resourceCache : new Map(),
      media: common.media,
      preload: common.preload,
      aspectRatio: common.aspectRatio,
      subtitles: common.subtitles,
      routes: normaliseRoutes(runtime.routes || runtimeRoutes)
    };
  };
}

module.exports = { createRuntimeOptions };
