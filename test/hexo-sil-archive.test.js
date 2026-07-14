'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ARCHIVE_SCRIPT,
  BUILTIN_SKINS,
  archiveTreePath,
  buildArchiveRoutes,
  extractArchiveCards,
  parseArchiveTagArgs,
  registerArchivePlugin,
  renderArchiveCard,
  resolveArchive,
  toArchiveConfig
} = require('hexo-sil-archive');
const { createAssetCapability, serialiseManifest } = require('hexo-sil-assets');

const baseDir = path.resolve(__dirname, '..');

function mockHexo({ root = '/', archive, workingDir = baseDir } = {}) {
  const calls = { generators: [], injectors: [], tags: [], logs: [] };
  return {
    base_dir: workingDir,
    source_dir: path.join(workingDir, 'source'),
    sil: { assets: createAssetCapability({ baseDir: workingDir }) },
    log: { warn: message => calls.logs.push(message) },
    config: {
      root,
      archive: archive === undefined ? { assets: { enabled: true }, defaults: { prefix: 'files' } } : archive
    },
    extend: {
      generator: { register: (name, fn) => calls.generators.push({ name, fn }) },
      injector: { register: (position, value) => calls.injectors.push({ position, value }) },
      tag: { register: (name, fn, options) => calls.tags.push({ name, fn, options }) }
    },
    calls
  };
}

test('archive configuration derives public paths and applies tag, collection, then defaults', () => {
  const config = toArchiveConfig({
    archive: {
      defaults: {
        prefix: 'files',
        title: '默认搜索',
        placeholder: '默认占位',
        hint: '默认提示'
      },
      collections: {
        'hxh-civ': {
          prefix: 'files/hxh_civ',
          title: '文明搜索'
        }
      }
    }
  });

  assert.deepEqual(resolveArchive(config, { collection: 'hxh-civ' }), {
    prefix: 'files/hxh_civ',
    sourceDir: 'files/hxh_civ',
    title: '文明搜索',
    placeholder: '默认占位',
    hint: '默认提示'
  });
  assert.deepEqual(resolveArchive(config, parseArchiveTagArgs(['collection=hxh-civ', 'title=\"标签标题\"'])), {
    prefix: 'files/hxh_civ',
    sourceDir: 'files/hxh_civ',
    title: '标签标题',
    placeholder: '默认占位',
    hint: '默认提示'
  });
  assert.deepEqual(resolveArchive(config, parseArchiveTagArgs(['prefix=files/rl'])), {
    prefix: 'files/rl',
    sourceDir: 'files/rl',
    title: '默认搜索',
    placeholder: '默认占位',
    hint: '默认提示'
  });
  assert.throws(() => toArchiveConfig({ archive: { defaults: { source_dir: '../outside' } } }), /dot segments/);
  assert.throws(() => resolveArchive(config, { collection: 'missing' }), /unknown collection/);
  assert.throws(() => parseArchiveTagArgs(['source_dir=files/a', 'source_dir=files/b']), /more than once/);
  assert.throws(() => parseArchiveTagArgs(['folder=files/a']), /does not support/);
  assert.throws(() => parseArchiveTagArgs(['public_path=files/a']), /does not support/);
});

test('archive card serialises resolved data and can be rediscovered from rendered content', () => {
  const card = renderArchiveCard({
    prefix: 'downloads/library',
    sourceDir: 'files/library',
    title: 'A < B',
    placeholder: 'Find',
    hint: 'Hint'
  }, { root: '/blog/' });
  assert.ok(card.includes(`data-sil-archive-tree="/blog/${archiveTreePath('downloads/library')}"`));
  assert.match(card, /A &lt; B/);
  assert.deepEqual(extractArchiveCards({ pages: [{ content: card }] }), [{ prefix: 'downloads/library', sourceDir: 'files/library' }]);
});

test('tree routes include configured and tag-defined collections with LFS sizes', async t => {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'hexo-sil-archive-'));
  t.after(() => fsp.rm(temporary, { recursive: true, force: true }));
  const manifestDirectory = path.join(temporary, 'source', '_data');
  await fsp.mkdir(manifestDirectory, { recursive: true });
  await fsp.writeFile(path.join(manifestDirectory, 'assets.json'), serialiseManifest({
    'files/library/nested/guide.txt': { size: 5, sha256: 'a'.repeat(64), type: 'text/plain; charset=utf-8' },
    'files/library/large.bin': { size: 987654, sha256: 'b'.repeat(64), type: 'application/octet-stream' },
    'files/library/index.html': { size: 8, sha256: 'c'.repeat(64), type: 'text/html' },
    'files/library/nested/index.html': { size: 9, sha256: 'd'.repeat(64), type: 'text/html' },
    'files/library/.hidden.txt': { size: 10, sha256: 'e'.repeat(64), type: 'text/plain' }
  }));

  const config = toArchiveConfig({ archive: { assets: { enabled: true }, collections: { library: { prefix: 'files/library' } } } });
  const card = renderArchiveCard(resolveArchive(config, { collection: 'library' }));
  const routes = buildArchiveRoutes({ pages: [{ content: card }], posts: [] }, config, { baseDir: temporary, assetCapability: createAssetCapability({ baseDir: temporary }) });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, archiveTreePath('files/library'));
  const tree = JSON.parse(routes[0].data);
  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].name, 'nested');
  assert.deepEqual(tree.children[0].children.map(entry => entry.name), ['guide.txt']);
  assert.equal(tree.children[1].name, 'large.bin');
  assert.equal(tree.children[1].size, 987654);
  assert.doesNotMatch(routes[0].data, /index\.html|hidden/);

  const conflicting = renderArchiveCard({
    prefix: 'files/library',
    sourceDir: 'files/other',
    title: 'Other',
    placeholder: 'Find',
    hint: 'Hint'
  });
  assert.throws(
    () => buildArchiveRoutes({ pages: [{ content: card + conflicting }], posts: [] }, config, { baseDir: temporary, assetCapability: createAssetCapability({ baseDir: temporary }) }),
    /maps to both/
  );
});

test('enabled integration falls back to a legacy source directory when the capability is absent', async t => {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'hexo-sil-archive-legacy-'));
  t.after(() => fsp.rm(temporary, { recursive: true, force: true }));
  const library = path.join(temporary, 'source', 'legacy-library');
  await fsp.mkdir(library, { recursive: true });
  await fsp.writeFile(path.join(library, 'guide.txt'), 'guide');
  let warnings = 0;
  const config = toArchiveConfig({
    archive: { assets: { enabled: true }, collections: { library: { prefix: 'files/library', source_dir: 'legacy-library' } } }
  });
  const routes = buildArchiveRoutes({ pages: [], posts: [] }, config, {
    baseDir: temporary,
    sourceRoot: path.join(temporary, 'source'),
    onMissingAssets: () => { warnings += 1; }
  });
  const tree = JSON.parse(routes[0].data);
  assert.equal(tree.children[0].name, 'guide.txt');
  assert.equal(warnings, 1);
});

test('Ephesus skin mirrors the audio card frame and runtime supports SPA cards', async () => {
  const css = await fsp.readFile(BUILTIN_SKINS.ephesus.sourcePath, 'utf8');
  assert.equal(BUILTIN_SKINS.ephesus.outputPath, 'css/hexo-sil-archive.css');
  assert.match(css, /--sil-archive-surface:#fff/);
  assert.match(css, /--sil-archive-surface:#000/);
  assert.ok(css.includes('border-left-width:var(--sil-archive-accent-border-width)'));
  assert.match(css, /border-radius:8px/);
  assert.match(css, /data-sil-archive-theme=\"dark\"/);
  assert.match(css, /sil-archive-card__control:focus-within \{ border-color:var\(--sil-archive-ink\) \}/);
  assert.doesNotMatch(css, /sil-archive-card__control:focus-within \{[^}]*box-shadow/);
  assert.match(css, /sil-archive-card__input:focus-visible \{ outline:none \}/);
  assert.match(css, /sil-archive-card__clear:focus-visible \{ outline:2px solid var\(--sil-archive-focus\);outline-offset:2px \}/);
  assert.ok(ARCHIVE_SCRIPT.includes('const treeCache = new Map()'));
  assert.ok(ARCHIVE_SCRIPT.includes('new MutationObserver(observeMutations)'));
  assert.ok(ARCHIVE_SCRIPT.includes("document.addEventListener('inside:theme'"));
  assert.match(ARCHIVE_SCRIPT, /Escape/);
});

test('plugin registers generated skin, runtime, tag, and configurable overrides', async () => {
  const hexo = mockHexo({
    root: '/blog/',
    archive: {
      defaults: { source_dir: 'files' },
      skin: { builtin: 'ephesus', override: '/css/archive-local.css' }
    }
  });
  registerArchivePlugin(hexo);
  assert.deepEqual(hexo.calls.generators.map(call => call.name), ['hexo-sil-archive-skin', 'hexo-sil-archive-tree']);
  assert.deepEqual(hexo.calls.injectors.map(call => call.position), ['head_end', 'head_end', 'body_end']);
  assert.ok(hexo.calls.injectors[0].value.includes('href="/blog/css/hexo-sil-archive.css"'));
  assert.ok(hexo.calls.injectors[1].value.includes('href="/blog/css/archive-local.css"'));
  assert.equal(hexo.calls.tags[0].name, 'archive');
  assert.equal(hexo.calls.tags[0].options, undefined);
  assert.ok(hexo.calls.tags[0].fn(['prefix=files/library']).includes('data-sil-archive-prefix="files/library"'));
  const skinRoute = await hexo.calls.generators[0].fn();
  assert.equal(skinRoute.path, 'css/hexo-sil-archive.css');
  assert.match(skinRoute.data.toString(), /sil-archive-card/);

  const replacement = mockHexo({
    archive: {
      defaults: { source_dir: 'files' },
      skin: { builtin: false, override: '/css/custom-archive.css' }
    }
  });
  registerArchivePlugin(replacement);
  assert.deepEqual(replacement.calls.generators.map(call => call.name), ['hexo-sil-archive-tree']);
  assert.deepEqual(replacement.calls.injectors.map(call => call.position), ['head_end', 'body_end']);
  assert.ok(replacement.calls.injectors[0].value.includes('custom-archive.css'));
});
