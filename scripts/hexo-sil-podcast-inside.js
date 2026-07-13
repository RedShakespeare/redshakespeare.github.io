'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { hasPodcastMetadata } = require('./hexo-sil-podcast');

const LIST_PATH = 'podcasts';
const LIST_URL = `/${LIST_PATH}/`;
const FALLBACK_URL = '/tags/Podcast/';
const PATCH_MARKER = 'hexo-sil-podcast-inside';
const POST_LIST_PROPERTIES = ['title', 'date', 'date_formatted', 'author', 'thumbnail', 'color', 'excerpt', 'link', 'tags', 'categories'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toInsidePodcastConfig(siteConfig = {}) {
  const podcast = isObject(siteConfig.podcast) ? siteConfig.podcast : {};
  const inside = isObject(podcast.inside) ? podcast.inside : {};
  return { enabled: inside.enabled !== false };
}

function collectionToArray(value) {
  if (!value) return [];
  if (typeof value.toArray === 'function') return value.toArray();
  return Array.from(value);
}

function listItem(post) {
  const item = {};
  for (const property of POST_LIST_PROPERTIES) {
    if (post[property] !== undefined && post[property] !== null && post[property] !== false) item[property] = post[property];
  }

  for (const property of ['tags', 'categories']) {
    if (!item[property]) continue;
    const names = collectionToArray(item[property]).map(entry => entry && entry.name ? entry.name : String(entry)).filter(Boolean).sort();
    if (names.length) item[property] = names;
    else delete item[property];
  }

  return item;
}

function comparePosts(left, right) {
  const leftSticky = typeof left.sticky === 'number' ? left.sticky : 0;
  const rightSticky = typeof right.sticky === 'number' ? right.sticky : 0;
  if (leftSticky !== rightSticky) return rightSticky - leftSticky;
  if (left.date === right.date) return 0;
  return left.date > right.date ? -1 : 1;
}

function podcastPosts(posts) {
  return collectionToArray(posts)
    .filter(post => post && post.layout === 'post' && post.visible !== false && hasPodcastMetadata(post))
    .sort(comparePosts)
    .map(listItem);
}

function perPage(theme, length) {
  const configured = theme && theme.post ? Number(theme.post.per_page) : NaN;
  if (configured === 0) return Math.max(1, length);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 10;
}

function apiPath(dataDirectory, route) {
  const encoded = Buffer.from(route).toString('base64').replace(/=/g, '');
  return `${dataDirectory}/${encoded}.json`;
}

function buildPodcastList(posts, theme = {}) {
  const entries = podcastPosts(posts);
  const size = perPage(theme, entries.length);
  const total = Math.max(1, Math.ceil(entries.length / size));
  const dataDirectory = String(theme.data_dir || 'api').replace(/^\/+|\/+$/g, '') || 'api';
  const routes = [];

  for (let index = 1; index <= total; index += 1) {
    const route = index === 1 ? LIST_PATH : `${LIST_PATH}/${index}`;
    const data = {
      per_page: size,
      total,
      current: index,
      data: entries.slice((index - 1) * size, index * size)
    };

    routes.push(
      { path: `${route}/index.html`, data: { ...data, type: 'posts' }, layout: 'index' },
      { path: apiPath(dataDirectory, route), data: JSON.stringify(data) }
    );
  }

  return routes;
}

function themeDirectory(hexo) {
  if (hexo.theme_dir) return hexo.theme_dir;
  try {
    return path.dirname(require.resolve('hexo-theme-inside/package.json'));
  } catch {
    return '';
  }
}

function hasInsidePatch(hexo, readFile = fs.readFileSync) {
  try {
    const directory = themeDirectory(hexo);
    const source = path.join(directory, 'source');
    const manifest = JSON.parse(readFile(path.join(source, '_manifest.json'), 'utf8'));
    const main = manifest.scripts && manifest.scripts.find(file => file.startsWith('main.'));
    if (!main) return false;
    return [main, '_ssr.js'].every(file => readFile(path.join(source, file), 'utf8').includes(PATCH_MARKER));
  } catch {
    return false;
  }
}

function isInsideTheme(hexo) {
  const directory = themeDirectory(hexo);
  return path.basename(directory) === 'hexo-theme-inside';
}

function normaliseMenuUrl(value) {
  return `/${String(value || '').trim().replace(/^\/+|\/+$/g, '')}/`;
}

function setPodcastMenu(hexo, target) {
  const menu = hexo.theme && hexo.theme.config && hexo.theme.config.menu;
  if (!isObject(menu)) return;

  const podcastUrls = new Set([normaliseMenuUrl(LIST_URL), normaliseMenuUrl(FALLBACK_URL)]);
  const entry = Object.keys(menu).find(key => podcastUrls.has(normaliseMenuUrl(menu[key])));

  if (target === false) {
    if (entry) delete menu[entry];
    return;
  }

  if (entry) menu[entry] = target;
  else menu['🎙 Podcasts'] = target;
}

function registerInsidePlugin(hexo) {
  const config = toInsidePodcastConfig(hexo.config);
  if (!isInsideTheme(hexo)) return;

  if (!config.enabled) {
    setPodcastMenu(hexo, false);
    hexo.log.info('hexo-sil-podcast-inside disabled: Podcasts menu is hidden.');
    return;
  }

  if (!hasInsidePatch(hexo)) {
    setPodcastMenu(hexo, FALLBACK_URL);
    hexo.log.warn('hexo-sil-podcast-inside patch is unavailable; Podcasts falls back to /tags/Podcast/.');
    return;
  }

  setPodcastMenu(hexo, LIST_URL);
  hexo.extend.generator.register('podcast-inside-list', function (locals) {
    return buildPodcastList(locals.posts, this.theme && this.theme.config);
  });
}

if (typeof hexo !== 'undefined') registerInsidePlugin(hexo);

module.exports = {
  FALLBACK_URL,
  LIST_PATH,
  LIST_URL,
  PATCH_MARKER,
  buildPodcastList,
  hasInsidePatch,
  podcastPosts,
  registerInsidePlugin,
  setPodcastMenu,
  toInsidePodcastConfig
};
