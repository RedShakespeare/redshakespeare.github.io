'use strict';

const assert = require('node:assert/strict');
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
