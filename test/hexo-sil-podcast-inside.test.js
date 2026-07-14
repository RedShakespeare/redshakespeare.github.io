'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  FALLBACK_URL,
  LIST_URL,
  buildPodcastList,
  hasInsidePatch,
  registerInsidePlugin,
  toInsidePodcastConfig
} = require('hexo-sil-podcast-inside');

function createPatchedTheme(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-sil-podcast-inside-'));
  const themeDir = path.join(root, 'hexo-theme-inside');
  const sourceDir = path.join(themeDir, 'source');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, '_manifest.json'), JSON.stringify({ scripts: ['main.test.js'] }));
  fs.writeFileSync(path.join(sourceDir, 'main.test.js'), '/* hexo-sil-podcast-inside */');
  fs.writeFileSync(path.join(sourceDir, '_ssr.js'), '/* hexo-sil-podcast-inside */');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return themeDir;
}

function mockHexo(themeDir, enabled = true) {
  const calls = { generators: [], logs: [] };
  return {
    theme_dir: themeDir,
    config: { podcast: { inside: { enabled } } },
    theme: {
      config: {
        menu: { '🏠 Writings': '/', '🎙 Podcasts': '/tags/Podcast/' },
        post: { per_page: 2 },
        data_dir: 'api'
      }
    },
    log: {
      info: message => calls.logs.push(message),
      warn: message => calls.logs.push(message)
    },
    extend: {
      generator: { register: (name, fn) => calls.generators.push({ name, fn }) }
    },
    calls
  };
}

function post(overrides = {}) {
  return {
    layout: 'post',
    title: 'Episode',
    date: new Date('2026-07-13T12:00:00Z'),
    date_formatted: 'Jul 13, 2026',
    link: '/2026/episode/',
    tags: [{ name: 'Podcast' }, { name: 'Games' }],
    categories: [{ name: 'Audio' }],
    podcast: { file: 'podcast/episode.mp3' },
    ...overrides
  };
}

test('Inside configuration defaults to enabled and can be disabled explicitly', () => {
  assert.deepEqual(toInsidePodcastConfig({}), { enabled: true });
  assert.deepEqual(toInsidePodcastConfig({ podcast: { inside: { enabled: false } } }), { enabled: false });
});

test('the marker check needs both browser and SSR support', () => {
  const fakeHexo = { theme_dir: '/tmp/hexo-theme-inside' };
  const readFile = filename => filename.endsWith('_manifest.json')
    ? JSON.stringify({ scripts: ['main.hash.js'] })
    : filename.endsWith('main.hash.js') ? 'hexo-sil-podcast-inside' : 'missing';
  assert.equal(hasInsidePatch(fakeHexo, readFile), false);
});

test('an unavailable patch keeps the menu on the compatible Podcast tag archive', () => {
  const hexo = mockHexo('/tmp/hexo-theme-inside');
  registerInsidePlugin(hexo);

  assert.equal(hexo.theme.config.menu['🎙 Podcasts'], FALLBACK_URL);
  assert.equal(hexo.calls.generators.length, 0);
  assert.match(hexo.calls.logs.join('\n'), /falls back/);
});

test('disabled integration hides its menu and does not register a list generator', t => {
  const hexo = mockHexo(createPatchedTheme(t), false);
  registerInsidePlugin(hexo);

  assert.equal(hexo.theme.config.menu['🎙 Podcasts'], undefined);
  assert.equal(hexo.calls.generators.length, 0);
  assert.match(hexo.calls.logs.join('\n'), /disabled/);
});

test('the patched extension creates an Inside-compatible metadata-filtered list', t => {
  const hexo = mockHexo(createPatchedTheme(t));
  registerInsidePlugin(hexo);

  assert.equal(hexo.theme.config.menu['🎙 Podcasts'], LIST_URL);
  assert.equal(hexo.calls.generators.length, 1);
  assert.equal(hexo.calls.generators[0].name, 'podcast-inside-list');

  const routes = hexo.calls.generators[0].fn.call(
    { theme: { config: hexo.theme.config } },
    {
      posts: [
        post({ title: 'Metadata only', tags: [], date: new Date('2026-07-12T12:00:00Z') }),
        post({ title: 'Pinned', sticky: 1 }),
        post({ title: 'Not a podcast', podcast: false }),
        post({ title: 'Hidden', visible: false })
      ]
    }
  );

  assert.deepEqual(routes.map(route => route.path), ['podcasts/index.html', 'api/cG9kY2FzdHM.json']);
  assert.equal(routes[0].layout, 'index');
  assert.equal(routes[0].data.type, 'posts');
  assert.deepEqual(routes[0].data.data.map(item => item.title), ['Pinned', 'Metadata only']);
  assert.deepEqual(routes[0].data.data[0].tags, ['Games', 'Podcast']);
  assert.equal(routes[0].data.data[1].tags, undefined);
  assert.equal(routes[0].data.data[0].podcast, undefined);
});

test('the list generator paginates with the theme post setting', () => {
  const routes = buildPodcastList([post({ title: 'One' }), post({ title: 'Two' }), post({ title: 'Three' })], {
    post: { per_page: 2 },
    data_dir: 'content-api'
  });

  assert.deepEqual(routes.map(route => route.path), [
    'podcasts/index.html',
    'content-api/cG9kY2FzdHM.json',
    'podcasts/2/index.html',
    'content-api/cG9kY2FzdHMvMg.json'
  ]);
  assert.equal(routes[2].data.current, 2);
  assert.equal(routes[2].data.data.length, 1);
});
