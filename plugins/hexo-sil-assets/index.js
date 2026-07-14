'use strict';

const path = require('node:path');
const {
  getObject,
  loadAssetManifest,
  manifestFilePath,
  normaliseManifestPath,
  treeFromManifest
} = require('./lib/manifest');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toAssetsConfig(siteConfig = {}) {
  const raw = siteConfig.assets == null ? {} : siteConfig.assets;
  if (!isObject(raw)) throw new Error('Assets configuration error: assets must be a mapping.');
  return { manifestPath: normaliseManifestPath(raw.manifest, 'assets.manifest') };
}

function createAssetCapability(options = {}) {
  const baseDir = path.resolve(options.baseDir || process.cwd());
  const manifestPath = normaliseManifestPath(options.manifestPath, 'assets.manifest');
  let cachedManifest = null;

  function load() {
    if (!cachedManifest) cachedManifest = loadAssetManifest(manifestFilePath(baseDir, manifestPath));
    return cachedManifest;
  }

  return Object.freeze({
    manifestPath,
    reset() {
      cachedManifest = null;
    },
    load,
    get state() {
      return load().state;
    },
    getObject(key) {
      return getObject(load(), key);
    },
    tree(prefix) {
      return treeFromManifest(load(), prefix);
    }
  });
}

function registerAssetsPlugin(hexo) {
  const config = toAssetsConfig(hexo.config);
  const capability = createAssetCapability({
    baseDir: hexo.base_dir || process.cwd(),
    manifestPath: config.manifestPath
  });
  if (!isObject(hexo.sil)) hexo.sil = {};
  if (hexo.sil.assets) throw new Error('Assets configuration error: hexo.sil.assets is already registered.');
  hexo.sil.assets = capability;
  if (hexo.extend && hexo.extend.filter) hexo.extend.filter.register('before_generate', () => capability.reset());
  return capability;
}

module.exports = {
  ...require('./lib/manifest'),
  createAssetCapability,
  registerAssetsPlugin,
  toAssetsConfig
};
