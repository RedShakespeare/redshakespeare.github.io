'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createAssetCapability,
  normaliseManifest,
  registerAssetsPlugin,
  serialiseManifest,
  treeFromManifest
} = require('hexo-sil-assets');
const { loadAssetsConfig, mappingForKey } = require('hexo-sil-assets/config');
const { R2Client, requiredEnvironment } = require('hexo-sil-assets/r2-client');

const siteRoot = path.resolve(__dirname, '..');

test('asset manifest is stable, validates checksums, and creates sorted archive trees', () => {
  const manifest = JSON.parse(serialiseManifest({
    'files/library/z.txt': { size: 1, sha256: 'b'.repeat(64), type: 'text/plain' },
    'files/library/a/one.txt': { size: 2, sha256: 'a'.repeat(64), type: 'text/plain' }
  }));
  const normalised = normaliseManifest(manifest);
  assert.equal(normalised.state, 'legacy');
  const tree = treeFromManifest(normalised, 'files/library');
  assert.deepEqual(tree.children.map(entry => entry.name), ['a', 'z.txt']);
  assert.equal(tree.children[0].children[0].rel, 'a/one.txt');
  assert.throws(() => normaliseManifest({ version: 1, objects: { 'files/a': { size: 1, sha256: 'nope', type: 'text/plain' } } }), /SHA-256/);
  assert.throws(() => normaliseManifest({ version: 1, state: 'unsafe', objects: {} }), /state/);
});

test('Hexo capability exposes one resettable manifest service', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ephesus-capability-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const data = path.join(root, 'source', '_data');
  await fs.mkdir(data, { recursive: true });
  await fs.writeFile(path.join(data, 'assets.json'), serialiseManifest({
    'files/a.txt': { size: 1, sha256: 'a'.repeat(64), type: 'text/plain' }
  }));
  const capability = createAssetCapability({ baseDir: root });
  assert.equal(capability.state, 'legacy');
  assert.equal(capability.getObject('files/a.txt').size, 1);
  assert.equal(capability.tree('files').children[0].name, 'a.txt');

  const filters = [];
  const hexo = {
    base_dir: root,
    config: { assets: { manifest: 'source/_data/assets.json' } },
    extend: { filter: { register: (name, fn) => filters.push({ name, fn }) } }
  };
  assert.equal(registerAssetsPlugin(hexo), hexo.sil.assets);
  assert.equal(filters[0].name, 'before_generate');
});

test('site asset configuration preserves every local mapping and publish boundary', () => {
  const config = loadAssetsConfig(siteRoot);
  assert.deepEqual(config.managed, [
    { prefix: 'files', source: 'source/files', ignore: 'source/files/**' },
    { prefix: 'img/df.zip', source: 'source/img/df.zip', ignore: 'source/img/df.zip' }
  ]);
  assert.equal(config.manifest, 'source/_data/assets.json');
  assert.equal(config.workspace, '.assets-workspace.json');
  assert.equal(mappingForKey(config, 'files/hxh_civ/readme.txt').source, 'source/files');
  assert.equal(mappingForKey(config, 'img/df.zip').source, 'source/img/df.zip');
  assert.deepEqual(config.publish.git, {
    remote: 'origin', branch: 'src', stage: true, commit: true, push: true
  });
  assert.deepEqual(config.publish.checks.map(check => [check.command, ...check.args]), [
    ['npm', 'run', 'test:assets'],
    ['npm', 'run', 'test:hexo-sil-audio'],
    ['npm', 'run', 'test:hexo-sil-archive'],
    ['npm', 'run', 'test:hexo-sil-podcast'],
    ['npm', 'run', 'test:hexo-sil-podcast-inside'],
    ['npm', 'run', 'test:podcast-feed-verifier'],
    ['npm', 'run', 'test:r2-assets'],
    ['npx', 'hexo', 'generate', '--bail']
  ]);
});

test('R2 client configuration remains credential-safe and URL encoded', () => {
  const environment = requiredEnvironment({
    R2_ACCOUNT_ID: 'account',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'assets'
  });
  const client = new R2Client(environment);
  assert.equal(client.url('files/a b.mp3'), 'https://account.r2.cloudflarestorage.com/assets/files/a%20b.mp3');
  assert.throws(() => requiredEnvironment({}), /R2_ACCOUNT_ID/);
});
