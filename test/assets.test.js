'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadAssetManifest, serialiseManifest, treeFromManifest } = require('../tools/assets-manifest');
const { diffManifest, lfsPointer, parseArguments, scanLocalAssets } = require('../tools/assets');
const { R2Client, requiredEnvironment } = require('../tools/r2-client');

test('asset manifest is stable, validates checksums, and creates sorted archive trees', () => {
  const manifest = JSON.parse(serialiseManifest({
    'files/library/z.txt': { size: 1, sha256: 'b'.repeat(64), type: 'text/plain' },
    'files/library/a/one.txt': { size: 2, sha256: 'a'.repeat(64), type: 'text/plain' }
  }));
  const normalised = require('../tools/assets-manifest').normaliseManifest(manifest);
  assert.equal(normalised.state, 'legacy');
  const tree = treeFromManifest(normalised, 'files/library');
  assert.deepEqual(tree.children.map(entry => entry.name), ['a', 'z.txt']);
  assert.equal(tree.children[0].children[0].rel, 'a/one.txt');
  assert.throws(() => require('../tools/assets-manifest').normaliseManifest({ version: 1, objects: { 'files/a': { size: 1, sha256: 'nope', type: 'text/plain' } } }), /SHA-256/);
  assert.throws(() => require('../tools/assets-manifest').normaliseManifest({ version: 1, state: 'unsafe', objects: {} }), /state/);
});

test('scanner preserves Git LFS object sizes and detects manifest changes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ephesus-assets-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const files = path.join(root, 'source', 'files', 'library');
  await fs.mkdir(files, { recursive: true });
  await fs.writeFile(path.join(files, 'small.txt'), 'hello');
  await fs.writeFile(path.join(files, 'large.zip'), `version https://git-lfs.github.com/spec/v1\noid sha256:${'c'.repeat(64)}\nsize 987654\n`);
  const local = await scanLocalAssets(root, ['files']);
  assert.equal(local.get('files/library/large.zip').size, 987654);
  assert.equal(local.get('files/library/large.zip').pointer, true);
  const manifest = { objects: { 'files/library/small.txt': { size: 5, sha256: local.get('files/library/small.txt').sha256, type: 'text/plain; charset=utf-8' } } };
  const difference = diffManifest(manifest, local, ['files']);
  assert.deepEqual(difference.uploads.map(entry => entry.key), ['files/library/large.zip']);
  assert.deepEqual(difference.deletes, []);
  assert.deepEqual(lfsPointer(`version https://git-lfs.github.com/spec/v1\noid sha256:${'d'.repeat(64)}\nsize 42\n`), { sha256: 'd'.repeat(64), size: 42 });
});

test('CLI arguments and R2 configuration are cross-platform and credential-safe', () => {
  assert.deepEqual(parseArguments(['publish', '--scope', 'files/podcast', '--dry-run']).options.scope, ['files/podcast']);
  assert.equal(parseArguments(['migrate', '--finalize']).options.finalize, true);
  assert.throws(() => parseArguments(['pull', '--scope', '../unsafe']), /safe relative path/);
  const environment = requiredEnvironment({ R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'assets' });
  const client = new R2Client(environment);
  assert.equal(client.url('files/a b.mp3'), 'https://account.r2.cloudflarestorage.com/assets/files/a%20b.mp3');
  assert.throws(() => requiredEnvironment({}), /R2_ACCOUNT_ID/);
});
