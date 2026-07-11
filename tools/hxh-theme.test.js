'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { generateHxhTheme } = require('./hxh-theme');
const { R2_SYNC_IMPLEMENTATION_INPUTS, objectPath, shouldRefreshHxhTheme } = require('./sync-r2-assets');

function withFixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hxh-theme-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries(files)) fs.writeFileSync(path.join(root, file), contents);
  return root;
}

test('generates the current Inside shell configuration', () => {
  const manifest = generateHxhTheme({ root: path.resolve(__dirname, '..') });

  assert.equal(manifest.version, 1);
  assert.equal(manifest.site.title, 'Ephesus');
  assert.equal(manifest.site.url, 'https://www.ephesus.top/');
  assert.equal(manifest.profile.avatar, 'https://www.ephesus.top/avatar.jpg');
  assert.equal(manifest.appearance.default.accentColor, '#673ab7');
  assert.equal(manifest.appearance.dark.background, '#22272e');
  assert.deepEqual(manifest.menu.map((item) => item.label), [
    '🏠 Writings',
    '💾 RLArchive',
    '🌟 About',
    '🔗 Links',
  ]);
  assert.equal(manifest.sns.find((item) => item.icon === 'feed').url, 'https://www.ephesus.top/atom.xml');
});

test('fills Inside defaults and resolves relative profile links', (t) => {
  const root = withFixture(t, {
    '_config.yml': 'title: Test Site\nauthor: Tester\nurl: http://example.test/blog\nlanguage: zh-CN\n',
    '_config.inside.yml': [
      'profile:',
      '  avatar: img/avatar.png',
      '  bio: hello',
      'menu:',
      '  Home: /',
      'sns:',
      '  - title: Feed',
      '    icon: feed',
      'footer:',
      "  copyright: '&copy; Test'",
    ].join('\n'),
  });

  const manifest = generateHxhTheme({ root });
  assert.equal(manifest.site.url, 'https://example.test/blog/');
  assert.equal(manifest.profile.avatar, 'https://example.test/blog/img/avatar.png');
  assert.equal(manifest.menu[0].url, 'https://example.test/');
  assert.equal(manifest.sns[0].url, 'https://example.test/blog/atom.xml');
  assert.equal(manifest.appearance.default.contentWidth, '660px');
  assert.equal(manifest.appearance.default.cardBackground, '#ffffff');
  assert.equal(manifest.appearance.dark.cardBackground, '#2d333b');
});

test('refreshes the theme manifest for config-only and full synchronization', () => {
  assert.equal(shouldRefreshHxhTheme('incremental', { hxhTheme: false }), false);
  assert.equal(shouldRefreshHxhTheme('incremental', { hxhTheme: true }), true);
  assert.equal(shouldRefreshHxhTheme('theme', { hxhTheme: false }), true);
  assert.equal(shouldRefreshHxhTheme('full', { hxhTheme: false }), true);
});

test('maps incremental source files beneath the existing R2 files prefix', () => {
  assert.equal(objectPath('source/files/hxh_civ/index.html'), 'hxh_civ/index.html');
  assert.equal(objectPath('source/files/rl/game.zip'), 'rl/game.zip');
});

test('treats sync implementation changes as a full mirror boundary', () => {
  assert.deepEqual(R2_SYNC_IMPLEMENTATION_INPUTS, ['tools/sync-r2-assets.js']);
});
