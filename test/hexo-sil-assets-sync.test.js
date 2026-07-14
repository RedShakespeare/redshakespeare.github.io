'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { R2_SYNC_IMPLEMENTATION_INPUTS, objectPath } = require('../plugins/hexo-sil-assets/legacy-sync');

test('maps incremental assets beneath the existing R2 files prefix', () => {
  assert.equal(objectPath('source/files/hxh_civ/index.html'), 'hxh_civ/index.html');
  assert.equal(objectPath('source/files/rl/game.zip'), 'rl/game.zip');
});

test('treats sync implementation changes as a full mirror boundary', () => {
  assert.deepEqual(R2_SYNC_IMPLEMENTATION_INPUTS, ['plugins/hexo-sil-assets/legacy-sync.js']);
});
