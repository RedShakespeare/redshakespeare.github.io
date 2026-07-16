'use strict';

const { assert, normaliseVideo, post, RUNTIME_ROUTES, runtime, subsrt, test, videoData } = require('./helpers/hexo-sil-video-fixture');
const { createResourceValidator } = require('../plugins/hexo-sil-video/lib/resource-validator');
const fs = require('node:fs/promises');
const path = require('node:path');

test('manifest-backed video resolves media, ASS/SRT tracks, poster, and fonts', async () => {
  const value = await normaliseVideo(post(), videoData(), runtime);
  assert.equal(value.source, '/files/video/demo.mp4');
  assert.equal(value.type, 'video/mp4');
  assert.equal(value.poster, '/files/video/poster.webp');
  assert.equal(value.title, 'Video Article');
  assert.deepEqual(value.subtitles.map(track => [track.format, track.url, track.default]), [
    ['ass', '/files/video/zh.ass', true],
    ['srt', '/files/video/en.srt', false]
  ]);
  assert.deepEqual(Object.keys(value.subtitles[0]).sort(), ['default', 'file', 'format', 'label', 'srclang', 'url']);
  assert.equal(value.fonts.Fixture, '/files/video/font.woff2');
  assert.equal(value.runtime.subtitles, '/js/hexo-sil-video-subtitles.js');
  assert.equal(value.runtime.worker, '/js/hexo-sil-video-worker.js');
});
test('manifest-backed video accepts additional local OGG, MPEG, and QuickTime containers', async () => {
  const ogv = await normaliseVideo(post(), videoData({ file: 'video/demo.ogv', subtitles: [] }), runtime);
  assert.equal(ogv.source, '/files/video/demo.ogv');
  assert.equal(ogv.type, 'video/ogg');
  const mpeg = await normaliseVideo(post(), videoData({ file: 'video/demo.mpeg', subtitles: [] }), runtime);
  assert.equal(mpeg.source, '/files/video/demo.mpeg');
  assert.equal(mpeg.type, 'video/mpeg');
  const mov = await normaliseVideo(post(), videoData({ file: 'video/demo.mov', subtitles: [] }), runtime);
  assert.equal(mov.source, '/files/video/demo.mov');
  assert.equal(mov.type, 'video/quicktime');
});

test('legacy mode validates local files and external video URLs stay HTTPS-only', async () => {
  let warnings = 0;
  const legacy = await normaliseVideo(post(), videoData({ subtitles: [] }), {
    ...runtime,
    assetsEnabled: true,
    assetCapability: null,
    onMissingAssets: () => { warnings += 1; },
    subtitles: { fonts: {}, fallbackFont: '' }
  });
  assert.equal(legacy.source, '/files/video/demo.mp4');
  assert.ok(warnings >= 1);
  const external = await normaliseVideo(post(), { url: 'https://media.example.test/demo.webm' }, runtime);
  assert.equal(external.type, 'video/webm');
  for (const [url, type] of [
    ['https://media.example.test/demo.ogv', 'video/ogg'],
    ['https://media.example.test/demo.ogg', 'video/ogg'],
    ['https://media.example.test/demo.mpeg', 'video/mpeg'],
    ['https://media.example.test/demo.mpg', 'video/mpeg'],
    ['https://media.example.test/demo.mov', 'video/quicktime'],
    ['https://media.example.test/demo.3gp', 'video/3gpp'],
    ['https://media.example.test/demo.3g2', 'video/3gpp2']
  ]) {
    assert.equal((await normaliseVideo(post(), { url }, runtime)).type, type);
  }
  await assert.rejects(normaliseVideo(post(), { url: 'http://media.example.test/demo.mp4' }, runtime), /must use HTTPS/);
  await assert.rejects(normaliseVideo(post(), { file: '../demo.mp4' }, runtime), /parent path/);
  await assert.rejects(normaliseVideo(post(), videoData({ subtitles: [] }), {
    ...runtime,
    routes: { ...RUNTIME_ROUTES, script: '/absolute.js' }
  }), /plain relative path/);
  await assert.rejects(normaliseVideo(post(), videoData({ subtitles: [
    { file: 'video/zh.ass', srclang: 'zh-Hans', label: '中文', default: true },
    { file: 'video/en.srt', srclang: 'en', label: 'English', default: true }
  ] }), runtime), /only one default/);
});

test('manifest resource failures preserve stable player-facing diagnostics', async () => {
  const manifestRuntime = getObject => ({ ...runtime, assetCapability: { getObject } });
  await assert.rejects(
    normaliseVideo(post(), videoData({ subtitles: [] }), manifestRuntime(() => { throw new Error('Asset manifest error: broken manifest'); })),
    /broken manifest/
  );
  await assert.rejects(
    normaliseVideo(post(), videoData({ subtitles: [] }), manifestRuntime(() => null)),
    /asset manifest does not contain files\/video\/demo\.mp4/
  );
  await assert.rejects(
    normaliseVideo(post(), videoData({ subtitles: [] }), manifestRuntime(() => ({ type: 'video/webm' }))),
    /expected video\/mp4/
  );
  await assert.rejects(
    normaliseVideo(post(), videoData({ poster: 'video/poster.webp', subtitles: [] }), manifestRuntime(key => ({
      type: key.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream'
    }))),
    /expected an image MIME type/
  );
});

test('generation resource cache deduplicates successful validation and retries failures', async () => {
  const resourceCache = new Map();
  let calls = 0;
  const cachedRuntime = {
    ...runtime,
    resourceCache,
    subtitles: { fonts: {}, fallbackFont: '' },
    assetCapability: {
      getObject() {
        calls += 1;
        return { type: 'video/mp4' };
      }
    }
  };
  const data = videoData({ poster: '', subtitles: [] });
  await normaliseVideo(post(), data, cachedRuntime);
  await normaliseVideo(post(), data, cachedRuntime);
  assert.equal(calls, 1);

  resourceCache.clear();
  calls = 0;
  cachedRuntime.assetCapability.getObject = () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary manifest failure');
    return { type: 'video/mp4' };
  };
  await assert.rejects(normaliseVideo(post(), data, cachedRuntime), /temporary manifest failure/);
  await normaliseVideo(post(), data, cachedRuntime);
  assert.equal(calls, 2);
});

test('resource cache shares backend reads without sharing validation or post context', async () => {
  const resourceCache = new Map();
  let calls = 0;
  const options = {
    assetsEnabled: true,
    assetCapability: { getObject() { calls += 1; return null; } },
    media: { prefix: 'files' },
    resourceCache
  };
  const { validateLocalEntry } = createResourceValidator({
    fs,
    path,
    videoError: (article, message) => new Error(`${article.title}: ${message}`)
  });
  await assert.rejects(validateLocalEntry({ title: 'First' }, 'shared.mp4', options, { type: 'video/mp4', description: 'video' }), /First:/);
  await assert.rejects(validateLocalEntry({ title: 'Second' }, 'shared.mp4', options, { type: 'video/mp4', description: 'video' }), /Second:/);
  assert.equal(calls, 1);

  resourceCache.clear();
  options.assetCapability.getObject = () => { calls += 1; return { type: 'video/mp4' }; };
  await validateLocalEntry({ title: 'Video' }, 'shared.mp4', options, { type: 'video/mp4', description: 'video' });
  await assert.rejects(
    validateLocalEntry({ title: 'Font' }, 'shared.mp4', options, { type: 'font/woff2', description: 'font' }),
    /Font: asset manifest MIME type.*expected font\/woff2/
  );
  assert.equal(calls, 2);
});

test('SRT conversion produces an ASS track suitable for JASSUB', () => {
  const converted = subsrt.convert('1\n00:00:00,000 --> 00:00:01,000\nHello\n', { from: 'srt', to: 'ass' });
  assert.match(converted, /ScriptType: v4\.00\+/);
  assert.match(converted, /Dialogue: 0,0:00:00\.00,0:00:01\.00/);
});
