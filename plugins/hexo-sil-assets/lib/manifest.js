'use strict';

// Shared manifest contract for Hexo integrations and asset maintenance commands.

const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_VERSION = 1;
const DEFAULT_MANIFEST_PATH = 'source/_data/assets.json';
const MANIFEST_STATES = new Set(['legacy', 'r2']);

function assetManifestError(message) {
  return new Error(`Asset manifest error: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalisePath(value, field, options = {}) {
  const required = options.required !== false;
  if (value == null || value === '') {
    if (required) throw assetManifestError(`${field} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw assetManifestError(`${field} must be a string.`);
  const normalised = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = normalised.split('/');
  if (!normalised || normalised.includes('?') || normalised.includes('#') || normalised.includes('\0') || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw assetManifestError(`${field} must be a safe relative path.`);
  }
  return normalised;
}

function normaliseObjectKey(value, field = 'object key') {
  return normalisePath(value, field);
}

function normaliseManifestPath(value, field = 'assets.manifest') {
  return normalisePath(value == null ? DEFAULT_MANIFEST_PATH : value, field);
}

function normaliseEntry(key, value) {
  if (!isObject(value)) throw assetManifestError(`objects.${key} must be a mapping.`);
  const size = Number(value.size);
  if (!Number.isSafeInteger(size) || size < 0) throw assetManifestError(`objects.${key}.size must be a non-negative integer.`);
  const sha256 = String(value.sha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw assetManifestError(`objects.${key}.sha256 must be a SHA-256 hex digest.`);
  const type = String(value.type || '').trim();
  if (!type || /[\r\n]/.test(type)) throw assetManifestError(`objects.${key}.type must be a MIME type.`);
  const entry = { size, sha256, type };
  if (value.duration != null && value.duration !== '') {
    const duration = String(value.duration);
    if (!/^(?:\d{1,3}:)?[0-5]\d:[0-5]\d$/.test(duration)) throw assetManifestError(`objects.${key}.duration must be MM:SS or HH:MM:SS.`);
    entry.duration = duration;
  }
  if (value.title != null && String(value.title).trim()) entry.title = String(value.title).trim();
  if (value.updated != null && String(value.updated).trim()) entry.updated = String(value.updated).trim();
  return Object.freeze(entry);
}

function normaliseManifest(value) {
  if (!isObject(value)) throw assetManifestError('manifest must be a mapping.');
  if (Number(value.version) !== MANIFEST_VERSION) throw assetManifestError(`version must be ${MANIFEST_VERSION}.`);
  const state = String(value.state || 'legacy').trim().toLowerCase();
  if (!MANIFEST_STATES.has(state)) throw assetManifestError('state must be `legacy` or `r2`.');
  if (!isObject(value.objects)) throw assetManifestError('objects must be a mapping.');
  const objects = {};
  for (const key of Object.keys(value.objects).sort((left, right) => left.localeCompare(right, 'en'))) {
    objects[normaliseObjectKey(key)] = normaliseEntry(key, value.objects[key]);
  }
  return Object.freeze({ version: MANIFEST_VERSION, state, objects: Object.freeze(objects) });
}

function loadAssetManifest(filePath) {
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw assetManifestError(`could not read ${filePath}: ${error.code || error.message}.`);
  }
  try {
    return normaliseManifest(JSON.parse(source));
  } catch (error) {
    if (String(error && error.message || '').startsWith('Asset manifest error:')) throw error;
    throw assetManifestError(`could not parse ${filePath}: ${error.message}.`);
  }
}

function manifestFilePath(baseDir, manifestPath) {
  const base = path.resolve(baseDir || process.cwd());
  const relative = normaliseManifestPath(manifestPath);
  const absolute = path.resolve(base, relative);
  if (!absolute.startsWith(base + path.sep)) throw assetManifestError('manifest path must resolve beneath the repository root.');
  return absolute;
}

function getObject(manifest, key) {
  const normalised = normaliseObjectKey(key);
  return manifest && manifest.objects && manifest.objects[normalised] || null;
}

function relativeObjectPath(key, prefix) {
  const objectKey = normaliseObjectKey(key);
  const normalisedPrefix = normaliseObjectKey(prefix, 'prefix');
  if (objectKey === normalisedPrefix) return '';
  const prefixWithSlash = `${normalisedPrefix}/`;
  return objectKey.startsWith(prefixWithSlash) ? objectKey.slice(prefixWithSlash.length) : null;
}

function treeFromManifest(manifest, prefix) {
  const root = { children: new Map() };
  for (const [key, entry] of Object.entries(manifest.objects)) {
    const relative = relativeObjectPath(key, prefix);
    if (!relative) continue;
    const segments = relative.split('/');
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      if (!node.children.has(segment)) node.children.set(segment, { children: new Map() });
      node = node.children.get(segment);
    }
    node.children.set(segments[segments.length - 1], { entry, relative });
  }

  function render(node, relativeBase = '') {
    return Array.from(node.children.entries()).sort((left, right) => {
      const leftDirectory = left[1].children instanceof Map;
      const rightDirectory = right[1].children instanceof Map;
      if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
      return left[0].localeCompare(right[0], 'zh-Hans-CN');
    }).map(([name, child]) => {
      const relative = relativeBase ? `${relativeBase}/${name}` : name;
      if (child.children instanceof Map) return { type: 'dir', name, rel: relative, children: render(child, relative) };
      return { type: 'file', name, rel: child.relative, size: child.entry.size };
    });
  }

  return { children: render(root) };
}

function serialiseManifest(objects, state = 'legacy') {
  const normalisedState = String(state || 'legacy').trim().toLowerCase();
  if (!MANIFEST_STATES.has(normalisedState)) throw assetManifestError('state must be `legacy` or `r2`.');
  const sorted = {};
  for (const key of Object.keys(objects).sort((left, right) => left.localeCompare(right, 'en'))) sorted[normaliseObjectKey(key)] = objects[key];
  return `${JSON.stringify({ version: MANIFEST_VERSION, state: normalisedState, objects: sorted }, null, 2)}\n`;
}

module.exports = {
  DEFAULT_MANIFEST_PATH,
  MANIFEST_STATES,
  MANIFEST_VERSION,
  assetManifestError,
  getObject,
  loadAssetManifest,
  manifestFilePath,
  normaliseManifest,
  normaliseManifestPath,
  normaliseObjectKey,
  normalisePath,
  relativeObjectPath,
  serialiseManifest,
  treeFromManifest
};
