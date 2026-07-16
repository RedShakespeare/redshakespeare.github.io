'use strict';

const { assert, sourceRoot, test, toVideoConfig } = require('./helpers/hexo-sil-video-fixture');

test('video configuration follows the shared prefix and safe legacy fallback contract', () => {
  assert.deepEqual(toVideoConfig({}).media, { prefix: 'files', sourceDir: 'files', url: '' });
  assert.equal(toVideoConfig({}).preload, 'metadata');
  assert.equal(toVideoConfig({}).aspectRatio, '16/9');
  const config = toVideoConfig({ video: {
    assets: { enabled: true },
    media: { prefix: 'media', source_dir: 'legacy/video', url: 'https://media.example.test/files' },
    aspect_ratio: '4 / 3',
    subtitles: { fonts: { Fixture: 'video/font.woff2' }, fallback_font: 'Fixture' }
  } });
  assert.deepEqual(config.media, { prefix: 'media', sourceDir: 'legacy/video', url: 'https://media.example.test/files/' });
  assert.equal(config.aspectRatio, '4/3');
  assert.throws(() => toVideoConfig({ video: { media: { object_prefix: 'files' } } }), /media\.prefix/);
  assert.throws(() => toVideoConfig({ video: { media: { url: 'http://example.test/files' } } }), /HTTPS/);
  assert.throws(() => toVideoConfig({ video: { media: { prefix: '/files' } } }), /ASCII relative directory/);
  assert.throws(() => toVideoConfig({ video: { media: { prefix: 'files?cache' } } }), /ASCII relative directory/);
  assert.throws(() => toVideoConfig({ video: { media: { prefix: 'files/%2e%2e/private' } } }), /ASCII relative directory/);
  assert.throws(() => toVideoConfig({ video: { media: { source_dir: 'files#media' } } }), /ASCII relative directory/);
  assert.throws(() => toVideoConfig({ video: { skin: { override: '/css/%2e%2e/theme.css' } } }), /root-relative CSS path/);
  assert.throws(() => toVideoConfig({ video: { subtitles: { fonts: { Bad: '../bad.ttf' } } } }), /parent path/);
  assert.throws(() => toVideoConfig({ video: { subtitles: { fallback_font: 'Missing' } } }), /must name an entry/);
});
