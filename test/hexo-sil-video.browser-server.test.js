'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const { ensureHydratedMediaFixture } = require('./fixtures/hexo-sil-video-browser-server');

test('browser media fixture validation preserves hydrated binary data', () => {
  const data = Buffer.from([0, 1, 2, 3]);
  assert.equal(ensureHydratedMediaFixture('/fixtures/video.mp4', data), data);
});

test('browser media fixture validation rejects Git LFS pointers with an actionable error', () => {
  const pointer = Buffer.from(`version https://git-lfs.github.com/spec/v1
oid sha256:${'0'.repeat(64)}
size 92262536
`);
  assert.throws(
    () => ensureHydratedMediaFixture('/fixtures/video.mp4', pointer),
    /Media fixture .*video\.mp4 is a Git LFS pointer; hydrate it before running browser tests\./
  );
});

test('legacy preflight hydrates the LFS-backed production browser fixture', async () => {
  const workflow = await fs.readFile(path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf8');
  assert.match(
    workflow,
    /git lfs pull --include="source\/img\/df\.zip,source\/files\/videos\/3\.mp4"/
  );
});
