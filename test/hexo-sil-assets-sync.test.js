'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { loadAssetsConfig } = require('hexo-sil-assets/config');

test('legacy sync keeps the established R2 mirror boundary', () => {
  const config = loadAssetsConfig(path.resolve(__dirname, '..'));
  assert.deepEqual(config.legacySync, {
    source: 'source/files',
    remote: 'r2:ephesus-files/files',
    implementationInputs: [
      'hexo-sil-assets.config.js',
      'package.json',
      'package-lock.json',
      '.github/workflows/deploy.yml'
    ]
  });
});
