'use strict';

const assert = require('node:assert/strict');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const subsrt = require('subsrt');
const {
  BUILTIN_SKINS,
  PLAYER_START,
  RUNTIME_ROUTES,
  mergeVideo,
  normaliseVideo,
  parseVideoTagArgs,
  registerVideoPlugin,
  renderVideoPlayer,
  runtimeRouteData,
  toVideoConfig
} = require('../plugins/hexo-sil-video');

const fixtureRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), 'hexo-sil-video-'));
const sourceRoot = path.join(fixtureRoot, 'source');
const fixtureFiles = {
  'files/video/demo.mp4': Buffer.from('video'),
  'files/video/poster.webp': Buffer.from('poster'),
  'files/video/zh.ass': Buffer.from('[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,24,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,你好'),
  'files/video/en.srt': Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nHello\n'),
  'files/video/font.woff2': Buffer.from('font')
};
for (const [relative, contents] of Object.entries(fixtureFiles)) {
  const filename = path.join(sourceRoot, relative);
  fsSync.mkdirSync(path.dirname(filename), { recursive: true });
  fsSync.writeFileSync(filename, contents);
}
test.after(() => fsSync.rmSync(fixtureRoot, { recursive: true, force: true }));

const manifestEntries = {
  'files/video/demo.mp4': { size: 5, type: 'video/mp4' },
  'files/video/poster.webp': { size: 6, type: 'image/webp' },
  'files/video/zh.ass': { size: 10, type: 'text/x-ssa; charset=utf-8' },
  'files/video/en.srt': { size: 10, type: 'application/x-subrip; charset=utf-8' },
  'files/video/font.woff2': { size: 4, type: 'font/woff2' }
};
const capability = { getObject: key => manifestEntries[key] || null };
const runtime = {
  baseDir: fixtureRoot,
  sourceRoot,
  root: '/',
  assetsEnabled: true,
  assetCapability: capability,
  media: { prefix: 'files', sourceDir: 'files', url: '' },
  preload: 'metadata',
  aspectRatio: '16/9',
  subtitles: { fonts: { Fixture: 'video/font.woff2' }, fallbackFont: 'Fixture' },
  routes: RUNTIME_ROUTES
};

function post(overrides = {}) {
  return { source: 'source/_posts/video.md', path: '2026/video/', title: 'Video Article', ...overrides };
}

function videoData(overrides = {}) {
  return {
    file: 'video/demo.mp4',
    poster: 'video/poster.webp',
    subtitles: [
      { file: 'video/zh.ass', srclang: 'zh-Hans', label: '简体中文', default: true },
      { file: 'video/en.srt', srclang: 'en', label: 'English' }
    ],
    ...overrides
  };
}

function mockHexo(video = {}) {
  const calls = { filters: [], generators: [], injectors: [], tags: [], logs: [] };
  return {
    base_dir: fixtureRoot,
    source_dir: sourceRoot,
    sil: { assets: capability },
    log: { warn: message => calls.logs.push(message) },
    config: {
      root: '/',
      video: {
        assets: { enabled: true },
        media: { prefix: 'files' },
        subtitles: { fonts: { Fixture: 'video/font.woff2' }, fallback_font: 'Fixture' },
        ...video
      }
    },
    extend: {
      filter: { register: (name, fn) => calls.filters.push({ name, fn }) },
      generator: { register: (name, fn) => calls.generators.push({ name, fn }) },
      injector: { register: (position, value) => calls.injectors.push({ position, value }) },
      tag: { register: (name, fn, options) => calls.tags.push({ name, fn, options }) }
    },
    calls
  };
}

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
  assert.throws(() => toVideoConfig({ video: { subtitles: { fonts: { Bad: '../bad.ttf' } } } }), /parent path/);
  assert.throws(() => toVideoConfig({ video: { subtitles: { fallback_font: 'Missing' } } }), /must name an entry/);
});

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
  assert.equal(value.fonts.Fixture, '/files/video/font.woff2');
  assert.equal(value.runtime.worker, '/js/hexo-sil-video-worker.js');
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
  await assert.rejects(normaliseVideo(post(), { url: 'http://media.example.test/demo.mp4' }, runtime), /must use HTTPS/);
  await assert.rejects(normaliseVideo(post(), { file: '../demo.mp4' }, runtime), /parent path/);
  await assert.rejects(normaliseVideo(post(), videoData({ subtitles: [
    { file: 'video/zh.ass', srclang: 'zh-Hans', label: '中文', default: true },
    { file: 'video/en.srt', srclang: 'en', label: 'English', default: true }
  ] }), runtime), /only one default/);
});

test('rendered player exposes native fallback, custom controls, downloads, and runtime model', async () => {
  const html = renderVideoPlayer(await normaliseVideo(post(), videoData(), runtime));
  assert.match(html, new RegExp(PLAYER_START));
  assert.match(html, /<video[^>]+controls[^>]+preload="metadata"/);
  assert.match(html, /data-sil-video-action="rate"[^>]*>1×/);
  assert.match(html, /data-sil-video-action="repeat"/);
  assert.match(html, /data-sil-video-action="fullscreen"/);
  assert.match(html, /下载简体中文字幕/);
  assert.match(html, /data-sil-video-model="[A-Za-z0-9+/=]+"/);
  assert.doesNotMatch(html, /<script class="sil-video-player__model"/);
  assert.doesNotMatch(html, /<track/);
});

test('tag arguments position the default player and source overrides drop its subtitles', () => {
  assert.deepEqual(parseVideoTagArgs(['file=video/other.mp4', 'title=Other']), { file: 'video/other.mp4', title: 'Other' });
  assert.deepEqual(mergeVideo(videoData(), { url: 'https://example.test/other.mp4' }), {
    url: 'https://example.test/other.mp4',
    poster: 'video/poster.webp'
  });
  assert.throws(() => parseVideoTagArgs(['subtitle=bad.ass']), /does not support/);
});

test('SRT conversion produces an ASS track suitable for JASSUB', () => {
  const converted = subsrt.convert('1\n00:00:00,000 --> 00:00:01,000\nHello\n', { from: 'srt', to: 'ass' });
  assert.match(converted, /ScriptType: v4\.00\+/);
  assert.match(converted, /Dialogue: 0,0:00:00\.00,0:00:01\.00/);
});

test('plugin registers skin, runtime assets, tag, and duplicate-safe post injection', async () => {
  const hexo = mockHexo();
  registerVideoPlugin(hexo);
  assert.deepEqual(hexo.calls.generators.map(call => call.name), ['hexo-sil-video-skin', 'hexo-sil-video-runtime']);
  assert.deepEqual(hexo.calls.injectors.map(call => call.position), ['head_end', 'body_end']);
  assert.equal(hexo.calls.tags[0].name, 'video');
  assert.equal(hexo.calls.tags[0].options.async, true);
  const routes = await hexo.calls.generators[1].fn();
  assert.deepEqual(routes.map(route => route.path), Object.values(RUNTIME_ROUTES));
  assert.ok(routes.every(route => route.data.length > 0));

  const article = post({ video: videoData(), content: '<p>Body</p>' });
  await hexo.calls.filters[0].fn(article);
  assert.match(article.content, /^<!-- hexo-sil-video:start -->/);
  assert.match(article.content, /<p>Body<\/p>$/);
  await hexo.calls.filters[0].fn(article);
  assert.equal((article.content.match(/hexo-sil-video:start/g) || []).length, 1);
});

test('Ephesus skin and runtime retain the specified palette and interaction contract', async () => {
  const css = await fs.readFile(BUILTIN_SKINS.ephesus.sourcePath, 'utf8');
  const runtimeSource = await fs.readFile(path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'runtime', 'player.js'), 'utf8');
  assert.match(css, /--sil-video-surface:#fff/);
  assert.match(css, /--sil-video-ink:#8064a2/);
  assert.match(css, /--sil-video-surface:#000/);
  assert.match(css, /--sil-video-ink:#673ab7/);
  assert.match(css, /sil-video-player__volume-popover/);
  assert.match(runtimeSource, /const rates = \[1, 1\.25, 1\.5, 1\.75, 2, 0\.5, 0\.75\]/);
  assert.match(runtimeSource, /event\.key === 'Enter'/);
  assert.match(runtimeSource, /event\.key === 'Escape'/);
  assert.match(runtimeSource, /document\.exitFullscreen\(\)/);
  assert.match(runtimeSource, /adjustVolume\(0\.05\)/);
  assert.match(runtimeSource, /adjustVolume\(-0\.05\)/);
  assert.match(runtimeSource, /seek\(-5\)/);
  assert.match(runtimeSource, /seek\(5\)/);
  assert.match(runtimeSource, /key === 'm'/);
  assert.match(runtimeSource, /video\.loop = !video\.loop/);
  assert.doesNotMatch(runtimeSource, /video\.pause\(\);\s*video\.currentTime = 0/);
});

test('runtime route builder emits browser script, module worker, WASM variants, and fallback font', async () => {
  const routes = await runtimeRouteData();
  const sizes = Object.fromEntries(routes.map(route => [route.path, route.data.length]));
  assert.ok(routes.every(route => Buffer.isBuffer(route.data)));
  assert.doesNotMatch(routes[0].data.subarray(0, 24).toString('utf8'), /^\{"0":/);
  assert.ok(sizes[RUNTIME_ROUTES.script] > 10000);
  assert.ok(sizes[RUNTIME_ROUTES.worker] > 10000);
  assert.ok(sizes[RUNTIME_ROUTES.wasm] > 1000000);
  assert.ok(sizes[RUNTIME_ROUTES.modernWasm] > 1000000);
  assert.ok(sizes[RUNTIME_ROUTES.defaultFont] > 10000);
});
