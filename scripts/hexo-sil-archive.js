'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadAssetManifest, manifestFilePath, treeFromManifest } = require('../tools/assets-manifest');

const BUILTIN_SKINS = Object.freeze({
  ephesus: Object.freeze({
    outputPath: 'css/hexo-sil-archive.css',
    sourcePath: path.join(__dirname, '..', 'assets', 'hexo-sil-archive', 'skins', 'ephesus.css')
  })
});

const DEFAULT_UI = Object.freeze({
  title: '搜索...',
  placeholder: '输入文件名或目录名',
  hint: '支持搜索文件名和目录名称'
});

const ARCHIVE_SCRIPT = String.raw`
<script>
(() => {
  'use strict';
  const selector = '.sil-archive-card[data-sil-archive]';
  const initialised = new WeakMap();
  const treeCache = new Map();
  let refreshScheduled = false;

  function text(value) {
    return document.createTextNode(value);
  }

  function formatSize(size) {
    if (!Number.isFinite(size) || size < 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = size;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return (value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)) + ' ' + units[unit];
  }

  function luminance(value) {
    const hex = String(value || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    const rgb = String(value || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    let channels;
    if (hex) {
      const source = hex[1].length === 3 ? hex[1].split('').map(part => part + part).join('') : hex[1];
      channels = [0, 2, 4].map(offset => Number.parseInt(source.slice(offset, offset + 2), 16));
    } else if (rgb) {
      channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    }
    return channels ? (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255 : 1;
  }

  function setTheme(card) {
    const target = document.body || document.documentElement;
    card.dataset.silArchiveTheme = luminance(getComputedStyle(target).backgroundColor) < 0.5 ? 'dark' : 'light';
  }

  function downloadUrl(publicUrl, relativePath) {
    const base = String(publicUrl || '').replace(/\/+$/, '');
    return base + '/' + String(relativePath || '').split('/').map(encodeURIComponent).join('/');
  }

  function countFiles(entries) {
    return entries.reduce((total, entry) => entry.type === 'file' ? total + 1 : total + countFiles(entry.children || []), 0);
  }

  function matchesName(entry, query) {
    return (String(entry.name || '') + ' ' + String(entry.rel || '')).toLocaleLowerCase().includes(query);
  }

  function matches(entry, query) {
    return !query || matchesName(entry, query) || entry.type === 'dir' && (entry.children || []).some(child => matches(child, query));
  }

  function visibleFileCount(entries, query) {
    return entries.reduce((total, entry) => {
      if (!matches(entry, query)) return total;
      if (entry.type === 'file') return total + 1;
      const children = entry.children || [];
      return total + (matchesName(entry, query) ? countFiles(children) : visibleFileCount(children, query));
    }, 0);
  }

  function renderEntries(entries, query, publicUrl, nested) {
    const list = document.createElement('ul');
    for (const entry of entries) {
      if (!matches(entry, query)) continue;
      const item = document.createElement('li');
      if (entry.type === 'dir') {
        const details = document.createElement('details');
        details.open = !nested || Boolean(query);
        const summary = document.createElement('summary');
        summary.append(text(entry.name));
        const childQuery = query && matchesName(entry, query) ? '' : query;
        details.append(summary, renderEntries(entry.children || [], childQuery, publicUrl, true));
        item.append(details);
      } else if (entry.type === 'file' && typeof entry.rel === 'string') {
        const link = document.createElement('a');
        link.href = downloadUrl(publicUrl, entry.rel);
        link.download = '';
        link.append(text(entry.name));
        item.append(link);
        const size = formatSize(entry.size);
        if (size) {
          const detail = document.createElement('small');
          detail.append(text(' (' + size + ')'));
          item.append(detail);
        }
      } else {
        continue;
      }
      list.append(item);
    }
    return list;
  }

  function loadTree(url) {
    if (!treeCache.has(url)) {
      treeCache.set(url, fetch(url, { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(tree => {
        if (!tree || !Array.isArray(tree.children)) throw new Error('invalid tree');
        return tree;
      }));
    }
    return treeCache.get(url);
  }

  function initialise(card) {
    if (initialised.has(card)) return;
    initialised.set(card, true);
    const root = card.querySelector('.sil-archive-card__root');
    const queryInput = card.querySelector('.sil-archive-card__input');
    const meta = card.querySelector('.sil-archive-card__meta');
    const clearButton = card.querySelector('.sil-archive-card__clear');
    const treeUrl = card.dataset.silArchiveTree;
    const publicUrl = card.dataset.silArchivePublicUrl;
    if (!root || !queryInput || !meta || !clearButton || !treeUrl || !publicUrl) return;

    card.setAttribute('aria-busy', 'true');
    loadTree(treeUrl).then(tree => {
      const render = () => {
        const query = queryInput.value.trim().toLocaleLowerCase();
        root.replaceChildren(renderEntries(tree.children, query, publicUrl, false));
        const visibleFiles = visibleFileCount(tree.children, query);
        meta.textContent = query ? '找到 ' + visibleFiles + ' 个文件。' : '共 ' + countFiles(tree.children) + ' 个文件。';
        clearButton.hidden = !queryInput.value;
        clearButton.disabled = queryInput.disabled || !queryInput.value;
      };
      const clearQuery = () => {
        if (!queryInput.value) return;
        queryInput.value = '';
        render();
        queryInput.focus();
      };
      queryInput.disabled = false;
      queryInput.addEventListener('input', render);
      queryInput.addEventListener('keydown', event => {
        if (event.key === 'Escape' && queryInput.value) {
          event.preventDefault();
          clearQuery();
        }
      });
      clearButton.addEventListener('click', clearQuery);
      card.setAttribute('aria-busy', 'false');
      render();
    }).catch(() => {
      card.dataset.silArchiveError = 'true';
      card.setAttribute('aria-busy', 'false');
      meta.textContent = '目录加载失败，请稍后重试。';
    });
  }

  function refresh() {
    refreshScheduled = false;
    document.querySelectorAll(selector).forEach(card => {
      setTheme(card);
      initialise(card);
    });
  }

  function scheduleRefresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    (window.requestAnimationFrame || window.setTimeout)(refresh);
  }

  function observeMutations(records) {
    if (records.some(record => Array.from(record.addedNodes).some(node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector))))) {
      scheduleRefresh();
    }
  }

  window.addEventListener('resize', scheduleRefresh);
  document.addEventListener('inside', scheduleRefresh);
  document.addEventListener('inside:theme', scheduleRefresh);
  new MutationObserver(observeMutations).observe(document.body, { childList: true, subtree: true });
  scheduleRefresh();
})();
</script>`;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function archiveError(message) {
  return new Error('Archive configuration error: ' + message);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function unescapeHtml(value) {
  return String(value || '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function normaliseRelativeDirectory(value, field, required = false) {
  if (value == null || value === '') {
    if (required) throw archiveError(field + ' is required.');
    return '';
  }
  if (typeof value !== 'string') throw archiveError(field + ' must be a string.');
  const directory = value.trim().replace(/\\/g, '/').replace(/\/+$/g, '');
  const segments = directory.split('/');
  if (!directory || directory.startsWith('/') || directory.includes('?') || directory.includes('#') || directory.includes('\0') || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw archiveError(field + ' must be a non-empty relative directory without query strings or dot segments.');
  }
  return directory;
}

function normaliseText(value, field) {
  if (value == null) return '';
  if (typeof value !== 'string') throw archiveError(field + ' must be a string.');
  const text = value.trim();
  if (!text) throw archiveError(field + ' must not be empty when configured.');
  return text;
}

function normaliseSkinOverride(value) {
  if (value == null || value === false || String(value).trim() === '') return '';
  if (typeof value !== 'string') throw archiveError('skin.override must be a root-relative CSS path.');
  const override = value.trim();
  const segments = override.slice(1).split('/');
  if (!override.startsWith('/') || override.startsWith('//') || !override.endsWith('.css') || override.includes('\\') || override.includes('?') || override.includes('#') || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw archiveError('skin.override must be a root-relative CSS path without query strings or dot segments.');
  }
  return override;
}

function normaliseBuiltinSkin(value) {
  if (value == null || value === true) return 'ephesus';
  if (value === false) return false;
  const name = String(value).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BUILTIN_SKINS, name)) return name;
  throw archiveError('skin.builtin must be `ephesus` or false.');
}

function normaliseLayer(value, label) {
  if (value == null) return { sourceDir: '', publicPath: '', title: '', placeholder: '', hint: '' };
  if (!isObject(value)) throw archiveError(label + ' must be a mapping.');
  if (value.prefix != null && value.source_dir != null && String(value.prefix).trim() !== String(value.source_dir).trim()) {
    throw archiveError(label + ' cannot define both prefix and source_dir with different values.');
  }
  return {
    // source_dir remains a migration alias. It no longer points to a local directory.
    sourceDir: normaliseRelativeDirectory(value.prefix == null ? value.source_dir : value.prefix, label + '.prefix'),
    publicPath: normaliseRelativeDirectory(value.public_path, label + '.public_path'),
    title: normaliseText(value.title, label + '.title'),
    placeholder: normaliseText(value.placeholder, label + '.placeholder'),
    hint: normaliseText(value.hint, label + '.hint')
  };
}

function normaliseCollectionName(value, field = 'collection') {
  const name = String(value == null ? '' : value).trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) throw archiveError(field + ' must contain only letters, digits, underscores, or hyphens.');
  return name;
}

function toArchiveConfig(siteConfig = {}) {
  const raw = siteConfig.archive == null ? {} : siteConfig.archive;
  if (raw === false) return { enabled: false, skin: { builtin: false, override: '' }, defaults: normaliseLayer(null, 'defaults'), collections: {} };
  if (!isObject(raw)) throw archiveError('archive must be a mapping or false.');
  const skinRaw = raw.skin === false ? { builtin: false } : raw.skin == null ? {} : raw.skin;
  if (!isObject(skinRaw)) throw archiveError('skin must be a mapping or false.');
  const collectionsRaw = raw.collections == null ? {} : raw.collections;
  if (!isObject(collectionsRaw)) throw archiveError('collections must be a mapping.');
  const collections = {};
  for (const [key, value] of Object.entries(collectionsRaw)) {
    const name = normaliseCollectionName(key, 'collection name');
    collections[name] = normaliseLayer(value, 'collections.' + name);
  }
  return {
    enabled: true,
    skin: { builtin: normaliseBuiltinSkin(skinRaw.builtin), override: normaliseSkinOverride(skinRaw.override) },
    defaults: normaliseLayer(raw.defaults, 'defaults'),
    collections
  };
}

function firstDefined(...values) {
  return values.find(value => value !== '');
}

function resolveArchive(config, overrides = {}) {
  const collectionName = overrides.collection ? normaliseCollectionName(overrides.collection) : '';
  const collection = collectionName ? config.collections[collectionName] : null;
  if (collectionName && !collection) throw archiveError('unknown collection `' + collectionName + '`.');
  const sourceDir = firstDefined(overrides.sourceDir || '', collection && collection.sourceDir || '', config.defaults.sourceDir);
  if (!sourceDir) throw archiveError('source_dir is required after applying tag, collection, and defaults.');
  let publicPath;
  if (overrides.publicPath) publicPath = overrides.publicPath;
  else if (overrides.sourceDir) publicPath = sourceDir;
  else if (collection && collection.publicPath) publicPath = collection.publicPath;
  else if (collection && collection.sourceDir) publicPath = sourceDir;
  else if (config.defaults.publicPath) publicPath = config.defaults.publicPath;
  else publicPath = sourceDir;
  return {
    sourceDir,
    publicPath,
    title: firstDefined(overrides.title || '', collection && collection.title || '', config.defaults.title, DEFAULT_UI.title),
    placeholder: firstDefined(overrides.placeholder || '', collection && collection.placeholder || '', config.defaults.placeholder, DEFAULT_UI.placeholder),
    hint: firstDefined(overrides.hint || '', collection && collection.hint || '', config.defaults.hint, DEFAULT_UI.hint)
  };
}

function parseArchiveTagArgs(args = []) {
  const allowed = new Map([
    ['collection', 'collection'],
    ['prefix', 'sourceDir'],
    ['source_dir', 'sourceDir'],
    ['public_path', 'publicPath'],
    ['title', 'title'],
    ['placeholder', 'placeholder'],
    ['hint', 'hint']
  ]);
  const values = {};
  for (const argument of args) {
    const separator = String(argument).indexOf('=');
    if (separator <= 0) throw archiveError('Archive tag arguments must use key=value syntax.');
    const key = String(argument).slice(0, separator).trim();
    const outputKey = allowed.get(key);
    if (!outputKey) throw archiveError('Archive tag does not support `' + key + '`.');
    if (Object.prototype.hasOwnProperty.call(values, outputKey)) throw archiveError('Archive tag defines `' + key + '` more than once.');
    values[outputKey] = String(argument).slice(separator + 1).trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2');
  }
  return {
    collection: values.collection ? normaliseCollectionName(values.collection, 'Archive tag collection') : '',
    sourceDir: normaliseRelativeDirectory(values.sourceDir, 'Archive tag prefix'),
    publicPath: normaliseRelativeDirectory(values.publicPath, 'Archive tag public_path'),
    title: normaliseText(values.title, 'Archive tag title'),
    placeholder: normaliseText(values.placeholder, 'Archive tag placeholder'),
    hint: normaliseText(values.hint, 'Archive tag hint')
  };
}

function rootPublicPath(root, file) {
  const prefix = String(root || '/').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const target = String(file || '').replace(/^\/+|\/+$/g, '');
  return '/' + [prefix, target].filter(Boolean).join('/');
}

function archiveTreePath(sourceDir) {
  const digest = createHash('sha256').update(sourceDir).digest('base64url');
  return 'archive-data/' + digest + '.json';
}

function renderStylesheetLink(url) {
  return '<link rel="stylesheet" href="' + escapeHtml(url) + '">';
}

function renderArchiveCard(archive, runtime = {}) {
  const treeUrl = rootPublicPath(runtime.root || '/', archiveTreePath(archive.sourceDir));
  const publicUrl = rootPublicPath(runtime.root || '/', archive.publicPath);
  const attr = (name, value) => name + '="' + escapeHtml(value) + '"';
  return [
    '<section class="sil-archive-card" data-sil-archive ' + attr('data-sil-archive-prefix', archive.sourceDir) + ' ' + attr('data-sil-archive-public-path', archive.publicPath) + ' ' + attr('data-sil-archive-tree', treeUrl) + ' ' + attr('data-sil-archive-public-url', publicUrl) + ' role="search" ' + attr('aria-label', archive.title) + ' aria-busy="true">',
    '  <div class="sil-archive-card__header">',
    '    <span class="sil-archive-card__title">' + escapeHtml(archive.title) + '</span>',
    '    <p class="sil-archive-card__meta" aria-live="polite">正在加载目录…</p>',
    '  </div>',
    '  <div class="sil-archive-card__control">',
    '    <svg class="sil-archive-card__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m20 20-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"/></svg>',
    '    <input class="sil-archive-card__input" type="search" ' + attr('placeholder', archive.placeholder) + ' autocomplete="off" ' + attr('aria-label', archive.placeholder) + ' disabled>',
    '    <button class="sil-archive-card__clear" type="button" aria-label="清除筛选" hidden disabled>×</button>',
    '  </div>',
    '  <p class="sil-archive-card__hint">' + escapeHtml(archive.hint) + '</p>',
    '  <div class="sil-archive-card__root" ' + attr('aria-label', archive.title + '文件目录') + '></div>',
    '</section>'
  ].join('\n');
}

function readAttribute(markup, name) {
  const match = String(markup).match(new RegExp('\\b' + name + '="([^"]*)"', 'i'));
  return match ? unescapeHtml(match[1]) : '';
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value.toArray === 'function') return value.toArray();
  return [];
}

function extractArchiveCards(locals = {}) {
  const entries = [];
  for (const collection of [locals.pages, locals.posts]) {
    for (const item of toArray(collection)) {
      const content = String(item && item.content || '');
      const sections = content.match(/<section\b[^>]*\bdata-sil-archive(?:\s|=|>)[^>]*>/gi) || [];
      for (const section of sections) {
        const sourceDir = readAttribute(section, 'data-sil-archive-prefix') || readAttribute(section, 'data-sil-archive-source-dir');
        const publicPath = readAttribute(section, 'data-sil-archive-public-path');
        if (sourceDir && publicPath) entries.push({
          sourceDir: normaliseRelativeDirectory(sourceDir, 'rendered archive source_dir', true),
          publicPath: normaliseRelativeDirectory(publicPath, 'rendered archive public_path', true)
        });
      }
    }
  }
  return entries;
}

function uniqueArchives(entries) {
  const archives = new Map();
  for (const entry of entries) {
    const current = archives.get(entry.publicPath);
    if (current && current.sourceDir !== entry.sourceDir) {
      throw archiveError('public_path `' + entry.publicPath + '` maps to both `' + current.sourceDir + '` and `' + entry.sourceDir + '`.');
    }
    archives.set(entry.publicPath, entry);
  }
  return Array.from(archives.values());
}

function uniqueArchiveTrees(entries) {
  const archives = new Map();
  for (const entry of entries) {
    if (!archives.has(entry.sourceDir)) archives.set(entry.sourceDir, entry);
  }
  return Array.from(archives.values());
}

function configuredArchives(config) {
  return Object.keys(config.collections).map(collection => resolveArchive(config, { collection }));
}

function buildArchiveRoutes(locals, config, runtime = {}) {
  const archives = uniqueArchiveTrees(uniqueArchives([
    ...configuredArchives(config),
    ...extractArchiveCards(locals)
  ]));
  const manifest = loadAssetManifest(manifestFilePath(runtime.baseDir, runtime.manifestPath));
  return archives.map(archive => {
    const tree = treeFromManifest(manifest, archive.sourceDir);
    if (!tree.children.length) throw archiveError('prefix `' + archive.sourceDir + '` has no matching objects in the asset manifest.');
    return { path: archiveTreePath(archive.sourceDir), data: JSON.stringify(tree, null, 2) };
  });
}

function registerArchivePlugin(hexo) {
  const config = toArchiveConfig(hexo.config);
  if (!config.enabled) return;
  const runtime = {
    baseDir: hexo.base_dir || process.cwd(),
    root: hexo.config.root || '/',
    manifestPath: hexo.config.assets && hexo.config.assets.manifest || 'source/_data/assets.json'
  };
  if (config.skin.builtin) {
    const skin = BUILTIN_SKINS[config.skin.builtin];
    hexo.extend.generator.register('hexo-sil-archive-skin', async () => ({ path: skin.outputPath, data: await fsp.readFile(skin.sourcePath) }));
    hexo.extend.injector.register('head_end', renderStylesheetLink(rootPublicPath(runtime.root, skin.outputPath)));
  }
  if (config.skin.override) hexo.extend.injector.register('head_end', renderStylesheetLink(rootPublicPath(runtime.root, config.skin.override)));
  hexo.extend.injector.register('body_end', ARCHIVE_SCRIPT);
  hexo.extend.tag.register('archive', function (args) {
    return renderArchiveCard(resolveArchive(config, parseArchiveTagArgs(args)), runtime);
  });
  hexo.extend.generator.register('hexo-sil-archive-tree', locals => buildArchiveRoutes(locals, config, runtime));
}

if (typeof hexo !== 'undefined') registerArchivePlugin(hexo);

module.exports = {
  ARCHIVE_SCRIPT,
  BUILTIN_SKINS,
  DEFAULT_UI,
  archiveTreePath,
  archiveError,
  buildArchiveRoutes,
  configuredArchives,
  extractArchiveCards,
  parseArchiveTagArgs,
  registerArchivePlugin,
  renderArchiveCard,
  resolveArchive,
  rootPublicPath,
  toArchiveConfig,
  uniqueArchives,
  uniqueArchiveTrees
};
