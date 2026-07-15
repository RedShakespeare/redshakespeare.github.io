'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const subsrt = require('subsrt');
const { createVideoDemandRegistry } = require('../plugins/hexo-sil-video/lib/video-demand');
const {
  BUILTIN_SKINS,
  BOOTSTRAP_MAX_BYTES,
  FULLSCREEN_UI_HIDE_DELAY,
  PLAYER_START,
  RUNTIME_ROUTES,
  VOLUME_CLOSE_DELAY,
  buildBrowserBundle,
  bootstrapCspHash,
  createStateCoordinator,
  mergeVideo,
  normaliseVideo,
  parseVideoTagArgs,
  registerVideoPlugin,
  renderBootstrapScript,
  renderVideoPlayer,
  runtimeRouteData,
  toVideoConfig,
  volumeLevel
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

let browserBundlePromise;

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function bufferedRanges(ranges) {
  return {
    length: ranges.length,
    start(index) { return ranges[index][0]; },
    end(index) { return ranges[index][1]; }
  };
}

function touchPointer(window, type, x, y, pointerId = 1) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
    isPrimary: { value: true }
  });
  return event;
}

function touchTap(window, viewport, x, y, pointerId = 1) {
  viewport.dispatchEvent(touchPointer(window, 'pointerdown', x, y, pointerId));
  viewport.dispatchEvent(touchPointer(window, 'pointerup', x, y, pointerId));
  const click = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  viewport.dispatchEvent(click);
  return click;
}

async function browserPlayer(options = {}) {
  const html = renderVideoPlayer({
    title: 'Browser Fixture',
    source: '/files/video/demo.mp4',
    type: 'video/mp4',
    poster: '',
    preload: 'metadata',
    aspectRatio: '16/9',
    subtitles: [],
    fonts: {},
    fallbackFont: '',
    runtime: {
      subtitles: '/js/hexo-sil-video-subtitles.js',
      worker: '/js/hexo-sil-video-worker.js',
      wasm: '/js/hexo-sil-video-worker.wasm',
      modernWasm: '/js/hexo-sil-video-worker-modern.wasm',
      defaultFont: '/fonts/hexo-sil-video-default.woff2'
    }
  });
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://example.test/'
  });
  const { window } = dom;
  const { document } = window;
  window.TextDecoder = TextDecoder;
  const player = document.querySelector('[data-sil-video-player]');
  const stage = document.querySelector('[data-sil-video-stage]');
  const viewport = document.querySelector('[data-sil-video-viewport]');
  const mediaLayer = document.querySelector('[data-sil-video-media-layer]');
  const video = document.querySelector('video');
  const play = document.querySelector('[data-sil-video-action="play"]');
  const fullscreen = document.querySelector('[data-sil-video-action="fullscreen"]');
  const mute = document.querySelector('[data-sil-video-action="mute"]');
  const volume = document.querySelector('[data-sil-video-volume]');
  const progress = document.querySelector('[data-sil-video-progress]');
  const feedback = document.querySelector('[data-sil-video-feedback]');
  const feedbackText = document.querySelector('[data-sil-video-feedback-text]');
  let playCalls = 0;
  let pauseCalls = 0;
  let fullscreenRequests = 0;
  let fullscreenExits = 0;
  let currentTimeValue = 20;
  let currentTimeSets = 0;
  let loadCalls = 0;
  const orientationLocks = [];
  let orientationUnlocks = 0;
  Object.defineProperties(video, {
    volume: { value: 0.8, writable: true },
    muted: { value: false, writable: true },
    paused: { value: true, writable: true },
    ended: { value: false, writable: true },
    duration: { value: 100, writable: true },
    buffered: { value: bufferedRanges([[0, 25], [50, 75]]), writable: true },
    currentTime: {
      get() { return currentTimeValue; },
      set(value) { currentTimeSets += 1; currentTimeValue = value; }
    }
  });
  video.load = () => { loadCalls += 1; };
  video.play = async () => {
    playCalls += 1;
    if (options.playReject) throw new Error('play rejected');
    video.paused = false;
    video.dispatchEvent(new window.Event('play'));
  };
  video.pause = () => {
    pauseCalls += 1;
    video.paused = true;
    video.dispatchEvent(new window.Event('pause'));
  };
  Object.defineProperty(document, 'fullscreenElement', { value: null, writable: true });
  if (options.orientation !== 'missing') {
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      value: {
        async lock(value) {
          orientationLocks.push(value);
          if (options.orientation === 'reject') throw new Error('orientation lock rejected');
        },
        unlock() { orientationUnlocks += 1; }
      }
    });
  }
  viewport.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 200, width: 300, height: 200 });
  viewport.setPointerCapture = () => {};
  viewport.releasePointerCapture = () => {};
  stage.requestFullscreen = async () => {
    fullscreenRequests += 1;
    if (options.fullscreenReject === 'enter') throw new Error('enter rejected');
    document.fullscreenElement = stage;
    document.dispatchEvent(new window.Event('fullscreenchange'));
  };
  document.exitFullscreen = async () => {
    fullscreenExits += 1;
    if (options.fullscreenReject === 'exit') throw new Error('exit rejected');
    document.fullscreenElement = null;
    document.dispatchEvent(new window.Event('fullscreenchange'));
  };
  browserBundlePromise ||= buildBrowserBundle(path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'runtime', 'player.js'), 'iife');
  window.eval((await browserBundlePromise).toString('utf8'));
  return {
    dom,
    window,
    document,
    player,
    stage,
    viewport,
    mediaLayer,
    video,
    play,
    fullscreen,
    mute,
    volume,
    progress,
    feedback,
    feedbackText,
    calls: {
      get play() { return playCalls; },
      get pause() { return pauseCalls; },
      get fullscreenRequests() { return fullscreenRequests; },
      get fullscreenExits() { return fullscreenExits; },
      get currentTimeSets() { return currentTimeSets; },
      get load() { return loadCalls; },
      get orientationLocks() { return orientationLocks; },
      get orientationUnlocks() { return orientationUnlocks; }
    }
  };
}

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
  assert.throws(() => toVideoConfig({ video: { media: { prefix: '/files' } } }), /ASCII relative directory/);
  assert.throws(() => toVideoConfig({ video: { media: { prefix: 'files?cache' } } }), /ASCII relative directory/);
  assert.throws(() => toVideoConfig({ video: { media: { source_dir: 'files#media' } } }), /ASCII relative directory/);
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
  assert.equal(value.runtime.subtitles, '/js/hexo-sil-video-subtitles.js');
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
  await assert.rejects(normaliseVideo(post(), videoData({ subtitles: [] }), {
    ...runtime,
    routes: { ...RUNTIME_ROUTES, script: '/absolute.js' }
  }), /plain relative path/);
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
  assert.match(html, /data-sil-video-stage tabindex="-1"/);
  assert.match(html, /data-sil-video-media-layer/);
  assert.match(html, /data-sil-video-feedback/);
  assert.match(html, /data-sil-video-feedback-text/);
  assert.match(html, /data-sil-video-controls[^>]*hidden/);
  assert.match(html, /aria-valuetext="0:00\/--:--"/);
  assert.match(html, /aria-valuetext="100%"/);
  assert.match(html, /sil-video-player__icon--feedback-brightness/);
  assert.match(html, /sil-video-player__icon--feedback-play/);
  assert.match(html, /sil-video-player__icon--feedback-pause/);
  assert.match(html, /sil-video-player__icon--once/);
  assert.match(html, /sil-video-player__icon--repeat/);
  assert.match(html, /sil-video-player__icon--volume-low/);
  assert.match(html, /sil-video-player__icon--volume-medium/);
  assert.match(html, /sil-video-player__icon--volume-high/);
  assert.match(html, /orient="vertical"/);
  assert.match(html, /下载简体中文字幕/);
  assert.match(html, /data-sil-video-model="[A-Za-z0-9+/=]+"/);
  assert.doesNotMatch(html, /<script class="sil-video-player__model"/);
  assert.doesNotMatch(html, /<track/);
  assert.doesNotMatch(html, /playsinline/i);
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

test('volume levels expose muted and one-to-three-wave thresholds', () => {
  assert.equal(VOLUME_CLOSE_DELAY, 800);
  assert.equal(FULLSCREEN_UI_HIDE_DELAY, 2500);
  assert.equal(volumeLevel(0, false), 'muted');
  assert.equal(volumeLevel(0.2, false), 'low');
  assert.equal(volumeLevel(1 / 3, false), 'low');
  assert.equal(volumeLevel(0.5, false), 'medium');
  assert.equal(volumeLevel(2 / 3, false), 'medium');
  assert.equal(volumeLevel(0.9, false), 'high');
  assert.equal(volumeLevel(1, true), 'muted');
});

test('status coordinator preserves channel errors and restores lower-priority state', () => {
  const player = { dataset: {} };
  const status = { textContent: '' };
  const state = createStateCoordinator({ player, status });
  state.set('media', '媒体信息');
  state.set('subtitles', '字幕加载中', { level: 'loading' });
  assert.equal(status.textContent, '字幕加载中');
  state.set('fullscreen', '无法进入全屏。', { error: true });
  state.set('media', '新媒体信息');
  assert.equal(status.textContent, '无法进入全屏。');
  assert.equal(player.dataset.silVideoError, 'true');
  state.clear('fullscreen');
  assert.equal(status.textContent, '字幕加载中');
  assert.equal(player.dataset.silVideoError, undefined);
  state.clear('subtitles');
  assert.equal(status.textContent, '新媒体信息');
  assert.throws(() => state.set('unknown', '无效'), /未知视频状态频道/);
  assert.throws(() => state.clear('unknown'), /未知视频状态频道/);
});

test('video demand registry seeds cached Front Matter and raw video tags per generation', () => {
  const demand = createVideoDemandRegistry();
  demand.seed([{ video: { file: 'demo.mp4' } }]);
  assert.equal(demand.hasDemand(), true);
  demand.reset();
  demand.seed([{ _content: '正文 {% video file=demo.mp4 %}' }]);
  assert.equal(demand.hasDemand(), true);
  demand.reset();
  demand.seed([{ _content: '普通正文' }]);
  assert.equal(demand.hasDemand(), false);
});

test('plugin registers skin, runtime assets, tag, and duplicate-safe post injection', async () => {
  const hexo = mockHexo();
  registerVideoPlugin(hexo);
  assert.deepEqual(hexo.calls.generators.map(call => call.name), ['hexo-sil-video-skin', 'hexo-sil-video-runtime']);
  assert.deepEqual(hexo.calls.filters.map(call => call.name), ['before_generate', 'after_post_render']);
  assert.deepEqual(hexo.calls.injectors.map(call => call.position), ['body_end']);
  assert.match(hexo.calls.injectors[0].value, /^<script>[\s\S]+<\/script>$/);
  assert.match(hexo.calls.injectors[0].value, /\/css\/hexo-sil-video\.css/);
  assert.match(hexo.calls.injectors[0].value, /\/js\/hexo-sil-video\.js/);
  assert.doesNotMatch(hexo.calls.injectors[0].value, /<link rel="stylesheet"/);
  assert.equal(hexo.calls.tags[0].name, 'video');
  assert.equal(hexo.calls.tags[0].options.async, true);
  assert.deepEqual(await hexo.calls.generators[0].fn(), []);
  assert.deepEqual(await hexo.calls.generators[1].fn(), []);
  const article = post({ video: videoData(), content: '<p>Body</p>' });
  const renderFilter = hexo.calls.filters.find(call => call.name === 'after_post_render').fn;
  await renderFilter(article);
  assert.match(article.content, /^<!-- hexo-sil-video:start -->/);
  assert.match(article.content, /<p>Body<\/p>$/);
  await renderFilter(article);
  assert.equal((article.content.match(/hexo-sil-video:start/g) || []).length, 1);

  const routes = await hexo.calls.generators[1].fn();
  assert.deepEqual(routes.filter(route => !route.internal).map(route => route.path), Object.values(RUNTIME_ROUTES));
  assert.deepEqual(routes.filter(route => route.internal).map(route => route.path), [
    `${RUNTIME_ROUTES.script}.map`,
    `${RUNTIME_ROUTES.subtitles}.map`,
    `${RUNTIME_ROUTES.worker}.map`
  ]);
  assert.ok(routes.every(route => route.data.length > 0));
  hexo.model = name => ({ toArray: () => name === 'Post' ? [{ video: videoData() }] : [] });
  hexo.calls.filters.find(call => call.name === 'before_generate').fn();
  assert.ok((await hexo.calls.generators[1].fn()).length > 0);
  hexo.model = undefined;
  hexo.calls.filters.find(call => call.name === 'before_generate').fn();
  assert.deepEqual(await hexo.calls.generators[0].fn(), []);
  assert.deepEqual(await hexo.calls.generators[1].fn(), []);

  const tagHexo = mockHexo();
  registerVideoPlugin(tagHexo);
  await tagHexo.calls.tags[0].fn.call(post({ video: videoData() }), []);
  assert.ok((await tagHexo.calls.generators[1].fn()).length > 0);
});

test('inline bootstrap stays idle without players and loads skin then core only once', async () => {
  const bootstrap = renderBootstrapScript({ styles: ['/video.css'], script: '/video.js' });
  assert.ok(Buffer.byteLength(bootstrap) <= BOOTSTRAP_MAX_BYTES);
  const inline = bootstrap.match(/^<script>([\s\S]*)<\/script>$/)[1];
  assert.equal(bootstrapCspHash({ styles: ['/video.css'], script: '/video.js' }), `sha256-${crypto.createHash('sha256').update(inline).digest('base64')}`);
  const source = inline;
  const dom = new JSDOM('<!doctype html><body><main>Plain</main></body>', {
    runScripts: 'outside-only',
    url: 'https://example.test/'
  });
  try {
    dom.window.eval(source);
    assert.equal(dom.window.document.querySelectorAll('link[data-sil-video-style]').length, 0);
    assert.equal(dom.window.document.querySelectorAll('script[data-sil-video-core]').length, 0);

    const player = dom.window.document.createElement('aside');
    player.dataset.silVideoPlayer = '';
    dom.window.document.body.append(player);
    await wait(0);
    const link = dom.window.document.querySelector('link[data-sil-video-style]');
    assert.equal(link.getAttribute('href'), '/video.css');
    assert.equal(dom.window.document.querySelectorAll('link[data-sil-video-style]').length, 1);
    link.dispatchEvent(new dom.window.Event('load'));
    await wait(0);
    assert.equal(dom.window.document.querySelector('script[data-sil-video-core]').getAttribute('src'), '/video.js');
    dom.window.eval(source);

    const second = dom.window.document.createElement('aside');
    second.dataset.silVideoPlayer = '';
    dom.window.document.body.append(second);
    dom.window.document.dispatchEvent(new dom.window.Event('inside'));
    await wait(0);
    assert.equal(dom.window.document.querySelectorAll('link[data-sil-video-style]').length, 1);
    assert.equal(dom.window.document.querySelectorAll('script[data-sil-video-core]').length, 1);
  } finally {
    dom.window.close();
  }
});

test('bootstrap stylesheet failure preserves native controls and exposes fallback status', async () => {
  const html = renderVideoPlayer({
    title: 'Fallback',
    source: '/video.mp4',
    type: 'video/mp4',
    poster: '',
    preload: 'metadata',
    aspectRatio: '16/9',
    subtitles: [],
    fonts: {},
    fallbackFont: '',
    runtime: { subtitles: '/subtitles.js' }
  });
  const bootstrap = renderBootstrapScript({ styles: ['/missing.css'], script: '/video.js' });
  const source = bootstrap.match(/^<script>([\s\S]*)<\/script>$/)[1];
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: 'outside-only', url: 'https://example.test/' });
  try {
    const diagnostics = [];
    dom.window.console.error = (...args) => diagnostics.push(args);
    dom.window.eval(source);
    await wait(0);
    const link = dom.window.document.querySelector('link[data-sil-video-style]');
    link.dispatchEvent(new dom.window.Event('error'));
    await wait(0);
    const player = dom.window.document.querySelector('[data-sil-video-player]');
    assert.equal(dom.window.document.querySelector('video').controls, true);
    assert.equal(player.dataset.silVideoError, 'true');
    assert.equal(player.querySelector('[data-sil-video-fallback-status]').hidden, false);
    assert.match(player.querySelector('[data-sil-video-status]').textContent, /原生控件/);
    assert.equal(dom.window.document.querySelectorAll('script[data-sil-video-core]').length, 0);
    assert.match(String(diagnostics[0]?.[1]?.url), /missing\.css/);
    dom.window.document.dispatchEvent(new dom.window.Event('inside'));
    await wait(0);
    assert.equal(dom.window.document.querySelectorAll('link[data-sil-video-style]').length, 1);
    dom.window.console.error = () => { throw new Error('logger failed'); };
    const retry = dom.window.document.querySelector('link[data-sil-video-style]');
    assert.doesNotThrow(() => retry.dispatchEvent(new dom.window.Event('error')));
    await wait(0);
    assert.equal(player.dataset.silVideoError, 'true');
  } finally {
    dom.window.close();
  }
});

test('Ephesus skin and runtime retain the specified palette and interaction contract', async () => {
  const css = await fs.readFile(BUILTIN_SKINS.ephesus.sourcePath, 'utf8');
  assert.match(css, /--sil-video-surface:#fff/);
  assert.match(css, /--sil-video-ink:#8064a2/);
  assert.match(css, /--sil-video-buffered:rgba\(128,100,162,\.24\)/);
  assert.match(css, /--sil-video-buffered:color-mix\(in srgb,var\(--sil-video-ink\) 24%,transparent\)/);
  assert.match(css, /--sil-video-surface:#000/);
  assert.match(css, /--sil-video-ink:#673ab7/);
  assert.match(css, /--sil-video-buffered:rgba\(103,58,183,\.34\)/);
  assert.match(css, /--sil-video-buffered:color-mix\(in srgb,var\(--sil-video-ink\) 34%,transparent\)/);
  assert.match(css, /sil-video-player__volume-popover/);
  assert.match(css, /border-left-width:3px/);
  assert.match(css, /sil-video-player__video:focus-visible \{ outline:1px solid/);
  assert.match(css, /sil-video-player__volume \{[^}]*writing-mode:vertical-lr/);
  assert.doesNotMatch(css, /volume-control:focus-within/);
  assert.match(css, /sil-video-player__stage:fullscreen/);
  assert.match(css, /sil-video-player__stage:fullscreen \{[^}]*--sil-video-buffered:rgba\(103,58,183,\.42\)/);
  assert.match(css, /sil-video-player__stage:fullscreen \{[^}]*--sil-video-buffered:color-mix\(in srgb,var\(--sil-video-ink\) 42%,transparent\)/);
  assert.match(css, /sil-video-player__feedback \{[^}]*color:var\(--sil-video-ink\)/);
  assert.match(css, /data-sil-video-feedback-visible/);
  assert.match(css, /sil-video-player__media-layer \{[^}]*filter:brightness/);
  assert.match(css, /data-sil-video-feedback-kind="brightness"/);
  assert.match(css, /data-sil-video-feedback-kind="playback-play"[^}]*border-radius:50%/);
  assert.match(css, /data-sil-video-feedback-kind="playback-pause"[^}]*background:rgba\(0,0,0,\.58\)/);
  assert.match(css, /@media \(pointer:coarse\) \{[\s\S]*touch-action:none/);
  assert.match(css, /data-sil-video-fullscreen="true"[^}]*sil-video-player__subtitle-control/);
  assert.doesNotMatch(css, /@media screen and \(max-width:430px\) \{\s*\.sil-video-player__toolbar/);
  assert.match(css, /data-sil-video-ui-hidden/);
  assert.match(css, /data-sil-video-controls\]\[hidden\] \{ display:none \}/);
  assert.match(css, /--sil-video-range-buffered,var\(--sil-video-rail\)/);
  assert.doesNotMatch(css, /sil-video-player:fullscreen/);
});

test('browser runtime marks every buffered video range and clears stale loading state', async () => {
  const fixture = await browserPlayer();
  const { dom, window, video, progress } = fixture;
  try {
    video.dispatchEvent(new window.Event('progress'));
    const buffered = progress.style.getPropertyValue('--sil-video-range-buffered');
    assert.match(buffered, /--sil-video-buffered\) 0%/);
    assert.match(buffered, /--sil-video-buffered\) 25%/);
    assert.match(buffered, /--sil-video-buffered\) 50%/);
    assert.match(buffered, /--sil-video-buffered\) 75%/);
    assert.match(buffered, /--sil-video-rail\) 25%/);
    assert.match(buffered, /--sil-video-rail\) 50%/);

    video.dispatchEvent(new window.Event('emptied'));
    assert.equal(progress.style.getPropertyValue('--sil-video-range-buffered'), '');
    video.dispatchEvent(new window.Event('progress'));
    video.dispatchEvent(new window.Event('loadstart'));
    assert.equal(progress.style.getPropertyValue('--sil-video-range-buffered'), '');
  } finally {
    dom.window.close();
  }
});

test('browser runtime synchronises accessible values, omits empty subtitle relations, and destroys cleanly', async () => {
  const fixture = await browserPlayer();
  const { dom, document, player, video, progress, volume } = fixture;
  try {
    const subtitles = document.querySelector('[data-sil-video-action="subtitles"]');
    assert.equal(progress.getAttribute('aria-valuetext'), '0:20/1:40');
    assert.equal(volume.getAttribute('aria-valuetext'), '80%');
    assert.equal(subtitles.disabled, true);
    assert.equal(subtitles.hasAttribute('aria-haspopup'), false);
    assert.equal(subtitles.hasAttribute('aria-controls'), false);
    assert.equal(subtitles.hasAttribute('aria-expanded'), false);
    assert.equal(video.controls, false);
    assert.ok(Array.from(player.querySelectorAll('[data-sil-video-controls]')).every(control => control.hidden === false));

    player.remove();
    await wait(0);
    await wait(0);
    assert.equal(video.controls, true);
    assert.equal(player.dataset.silVideoReady, undefined);
    assert.equal(player.dataset.silVideoEnhanced, undefined);
  } finally {
    dom.window.close();
  }
});

test('browser runtime reports missing view fields and preserves native controls', async () => {
  const html = renderVideoPlayer({
    title: 'Broken view', source: '/video.mp4', type: 'video/mp4', poster: '', preload: 'metadata',
    aspectRatio: '16/9', subtitles: [], fonts: {}, fallbackFont: '', runtime: {}
  }).replace(/<input class="sil-video-player__range sil-video-player__volume"[^>]+>/, '');
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/'
  });
  try {
    dom.window.TextDecoder = TextDecoder;
    const diagnostics = [];
    dom.window.console.error = (...args) => diagnostics.push(args);
    dom.window.eval((await buildBrowserBundle(path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'runtime', 'player.js'), 'iife')).toString('utf8'));
    const player = dom.window.document.querySelector('[data-sil-video-player]');
    assert.equal(dom.window.document.querySelector('video').controls, true);
    assert.equal(player.dataset.silVideoError, 'true');
    assert.match(player.querySelector('[data-sil-video-status]').textContent, /volume/);
    assert.equal(diagnostics.length, 1);
    const replacement = dom.window.document.createElement('input');
    replacement.className = 'sil-video-player__range sil-video-player__volume';
    replacement.dataset.silVideoVolume = '';
    player.querySelector('.sil-video-player__volume-control').append(replacement);
    dom.window.document.dispatchEvent(new dom.window.Event('inside'));
    await wait(0);
    assert.equal(player.dataset.silVideoReady, undefined);
    assert.equal(player.dataset.silVideoError, 'true');
    assert.equal(diagnostics.length, 1);
    const recovered = new JSDOM(renderVideoPlayer({
      title: 'Recovered', source: '/video.mp4', type: 'video/mp4', poster: '', preload: 'metadata',
      aspectRatio: '16/9', subtitles: [], fonts: {}, fallbackFont: '',
      runtime: { subtitles: '/subtitles.js', worker: '/worker.js', wasm: '/worker.wasm', modernWasm: '/modern.wasm', defaultFont: '/font.woff2' }
    })).window.document.querySelector('[data-sil-video-player]').dataset.silVideoModel;
    player.dataset.silVideoModel = recovered;
    dom.window.document.dispatchEvent(new dom.window.Event('inside'));
    await wait(0);
    assert.equal(player.dataset.silVideoReady, 'true');
  } finally {
    dom.window.close();
  }
});

test('browser runtime keeps shortcuts focused through fullscreen entry and exit', async () => {
  const fixture = await browserPlayer();
  const { dom, window, document, player, stage, video, fullscreen, feedback, feedbackText, calls } = fixture;
  try {
    fullscreen.focus();
    fullscreen.click();
    await Promise.resolve();
    assert.equal(document.fullscreenElement, stage);
    assert.equal(document.activeElement, stage);
    assert.deepEqual(calls.orientationLocks, ['landscape']);
    stage.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    assert.ok(Math.abs(video.volume - 0.85) < Number.EPSILON * 2);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'volume');
    assert.equal(feedback.dataset.silVideoFeedbackVisible, 'true');
    assert.equal(feedbackText.textContent, '85%');

    stage.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.fullscreenExits, 1);
    assert.equal(document.fullscreenElement, null);
    assert.equal(document.activeElement, player);
    assert.equal(calls.orientationUnlocks, 1);

    player.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(video.currentTime, 25);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'progress');
    assert.equal(feedbackText.textContent, '0:25/1:40');
  } finally {
    dom.window.close();
  }
});

test('browser runtime degrades cleanly when orientation locking is unavailable or rejected', async () => {
  for (const orientation of ['missing', 'reject']) {
    const fixture = await browserPlayer({ orientation });
    const { dom, document, stage, fullscreen, calls } = fixture;
    try {
      fullscreen.click();
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(document.fullscreenElement, stage);
      if (orientation === 'reject') assert.deepEqual(calls.orientationLocks, ['landscape']);
      await document.exitFullscreen();
      assert.equal(document.fullscreenElement, null);
    } finally {
      dom.window.close();
    }
  }
});

test('browser runtime contains fullscreen rejections and exposes stable status', async () => {
  const fixture = await browserPlayer({ fullscreenReject: 'enter' });
  const { dom, document, fullscreen, player } = fixture;
  try {
    fullscreen.click();
    await wait(0);
    assert.equal(document.fullscreenElement, null);
    assert.equal(player.dataset.silVideoError, 'true');
    assert.equal(document.querySelector('[data-sil-video-status]').textContent, '无法进入全屏。');
  } finally {
    dom.window.close();
  }
});

test('browser runtime distinguishes viewport single clicks from double clicks', async () => {
  const fixture = await browserPlayer();
  const { dom, window, document, stage, viewport, calls } = fixture;
  try {
    viewport.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
    assert.equal(document.activeElement, stage);
    await wait(350);
    assert.equal(calls.play, 1);
    assert.equal(calls.pause, 0);

    viewport.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
    viewport.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
    viewport.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, button: 0 }));
    await wait(350);
    assert.equal(calls.play, 1);
    assert.equal(calls.pause, 0);
    assert.equal(calls.fullscreenRequests, 1);
    assert.equal(document.fullscreenElement, stage);

    viewport.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
    viewport.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
    viewport.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, button: 0 }));
    await wait(350);
    assert.equal(calls.play, 1);
    assert.equal(calls.pause, 0);
    assert.equal(calls.fullscreenExits, 1);
    assert.equal(document.fullscreenElement, null);
  } finally {
    dom.window.close();
  }
});

test('browser runtime maps touch double taps to left and right fifteen-second seeks', async () => {
  const fixture = await browserPlayer();
  const { dom, window, document, stage, viewport, video, fullscreen, feedback, feedbackText, calls } = fixture;
  try {
    touchTap(window, viewport, 50, 100, 1);
    touchTap(window, viewport, 50, 100, 2);
    assert.equal(video.currentTime, 5);
    assert.equal(calls.currentTimeSets, 1);
    assert.equal(calls.load, 0);
    assert.equal(calls.play, 0);
    assert.equal(calls.fullscreenRequests, 0);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'progress');
    assert.equal(feedbackText.textContent, '0:05/1:40');

    touchTap(window, viewport, 250, 100, 3);
    touchTap(window, viewport, 250, 100, 4);
    assert.equal(video.currentTime, 20);
    assert.equal(calls.currentTimeSets, 2);
    assert.equal(calls.load, 0);
    assert.equal(video.paused, true);

    video.currentTime = 0;
    const beforeStartClamp = calls.currentTimeSets;
    touchTap(window, viewport, 50, 100, 7);
    touchTap(window, viewport, 50, 100, 8);
    assert.equal(video.currentTime, 0);
    assert.equal(calls.currentTimeSets, beforeStartClamp + 1);

    video.currentTime = 100;
    const beforeEndClamp = calls.currentTimeSets;
    touchTap(window, viewport, 250, 100, 9);
    touchTap(window, viewport, 250, 100, 10);
    assert.equal(video.currentTime, 100);
    assert.equal(calls.currentTimeSets, beforeEndClamp + 1);

    video.currentTime = 20;

    video.paused = false;
    fullscreen.click();
    await Promise.resolve();
    assert.equal(document.fullscreenElement, stage);
    await wait(FULLSCREEN_UI_HIDE_DELAY + 50);
    assert.equal(stage.dataset.silVideoUiHidden, 'true');
    touchTap(window, viewport, 250, 100, 5);
    touchTap(window, viewport, 250, 100, 6);
    assert.equal(video.currentTime, 35);
    assert.equal(calls.currentTimeSets, beforeEndClamp + 3);
    assert.equal(calls.fullscreenExits, 0);
    assert.equal(stage.dataset.silVideoUiHidden, 'true');
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'progress');
    assert.equal(feedbackText.textContent, '0:35/1:40');
    await wait(950);
    assert.equal(feedback.dataset.silVideoFeedbackVisible, undefined);
    assert.equal(stage.dataset.silVideoUiHidden, 'true');
  } finally {
    dom.window.close();
  }
});

test('browser runtime delays hidden fullscreen controls for touch single taps', async () => {
  const fixture = await browserPlayer();
  const { dom, window, document, stage, viewport, video, fullscreen, feedback, calls } = fixture;
  try {
    video.paused = false;
    fullscreen.click();
    await Promise.resolve();
    assert.equal(document.fullscreenElement, stage);
    await wait(FULLSCREEN_UI_HIDE_DELAY + 50);
    assert.equal(stage.dataset.silVideoUiHidden, 'true');
    video.paused = true;

    touchTap(window, viewport, 150, 100, 1);
    assert.equal(stage.dataset.silVideoUiHidden, 'true');
    assert.equal(calls.play, 0);
    await wait(200);
    assert.equal(stage.dataset.silVideoUiHidden, 'true');
    await wait(150);
    assert.equal(stage.dataset.silVideoUiHidden, undefined);
    assert.equal(calls.play, 0);
    assert.notEqual(feedback.dataset.silVideoFeedbackKind, 'playback-play');

    touchTap(window, viewport, 150, 100, 2);
    await wait(350);
    assert.equal(calls.play, 1);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'playback-play');
  } finally {
    dom.window.close();
  }
});

test('browser runtime shows circular play and pause feedback only for viewport single clicks', async () => {
  const fixture = await browserPlayer();
  const { dom, window, viewport, feedback, feedbackText, calls } = fixture;
  try {
    viewport.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
    await wait(350);
    assert.equal(calls.play, 1);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'playback-play');
    assert.equal(feedback.dataset.silVideoFeedbackVisible, 'true');
    assert.equal(feedbackText.textContent, '');
    assert.equal(feedback.getAttribute('aria-label'), '播放');
    await wait(650);
    assert.equal(feedback.dataset.silVideoFeedbackVisible, undefined);

    viewport.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
    await wait(350);
    assert.equal(calls.pause, 1);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'playback-pause');
    assert.equal(feedback.dataset.silVideoFeedbackVisible, 'true');
    assert.equal(feedbackText.textContent, '');
    assert.equal(feedback.getAttribute('aria-label'), '暂停');
  } finally {
    dom.window.close();
  }
});

test('browser runtime omits playback feedback for failures, controls, keyboard, and double clicks', async () => {
  const failed = await browserPlayer({ playReject: true });
  try {
    failed.viewport.dispatchEvent(new failed.window.MouseEvent('click', { bubbles: true, button: 0 }));
    await wait(350);
    assert.equal(failed.calls.play, 1);
    assert.equal(failed.player.dataset.silVideoError, 'true');
    assert.equal(failed.feedback.dataset.silVideoFeedbackVisible, undefined);
  } finally {
    failed.dom.window.close();
  }

  const controls = await browserPlayer();
  try {
    controls.play.click();
    await Promise.resolve();
    assert.equal(controls.calls.play, 1);
    assert.equal(controls.feedback.dataset.silVideoFeedbackVisible, undefined);
    controls.player.focus();
    controls.player.dispatchEvent(new controls.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    assert.equal(controls.calls.pause, 1);
    assert.equal(controls.feedback.dataset.silVideoFeedbackVisible, undefined);

    controls.viewport.dispatchEvent(new controls.window.MouseEvent('click', { bubbles: true, button: 0 }));
    controls.viewport.dispatchEvent(new controls.window.MouseEvent('click', { bubbles: true, button: 0 }));
    controls.viewport.dispatchEvent(new controls.window.MouseEvent('dblclick', { bubbles: true, button: 0 }));
    await wait(350);
    assert.equal(controls.calls.fullscreenRequests, 1);
    assert.equal(controls.feedback.dataset.silVideoFeedbackVisible, undefined);
  } finally {
    controls.dom.window.close();
  }
});

test('browser runtime shows feedback for every user volume and progress adjustment', async () => {
  const fixture = await browserPlayer();
  const { dom, window, player, video, mute, volume, progress, feedback, feedbackText } = fixture;
  try {
    player.focus();
    player.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    assert.equal(video.muted, true);
    assert.equal(feedbackText.textContent, '0%');

    volume.value = '0.3';
    volume.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(video.muted, false);
    assert.equal(video.volume, 0.3);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'volume');
    assert.equal(feedbackText.textContent, '30%');

    progress.value = '50';
    progress.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(video.currentTime, 50);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'progress');
    assert.equal(feedbackText.textContent, '0:50/1:40');

    mute.click();
    assert.equal(video.muted, true);
    assert.equal(feedbackText.textContent, '0%');
    assert.equal(feedback.dataset.silVideoFeedbackVisible, 'true');
    await wait(950);
    assert.equal(feedback.dataset.silVideoFeedbackVisible, undefined);
  } finally {
    dom.window.close();
  }
});

test('browser runtime handles touch progress, brightness, and volume gestures in and out of fullscreen', async () => {
  const fixture = await browserPlayer();
  const { dom, window, document, stage, viewport, mediaLayer, video, fullscreen, feedback, feedbackText, calls } = fixture;
  try {
    viewport.dispatchEvent(touchPointer(window, 'pointerdown', 150, 100));
    viewport.dispatchEvent(touchPointer(window, 'pointermove', 300, 103));
    assert.equal(video.currentTime, 20);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'progress');
    assert.equal(feedbackText.textContent, '0:50/1:40');
    viewport.dispatchEvent(touchPointer(window, 'pointerup', 300, 103));
    assert.equal(video.currentTime, 50);

    viewport.dispatchEvent(touchPointer(window, 'pointerdown', 150, 100, 4));
    viewport.dispatchEvent(touchPointer(window, 'pointermove', 0, 100, 4));
    assert.equal(feedbackText.textContent, '0:20/1:40');
    viewport.dispatchEvent(touchPointer(window, 'pointercancel', 0, 100, 4));
    assert.equal(video.currentTime, 50);

    viewport.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
    await wait(350);
    assert.equal(calls.play, 0);

    viewport.dispatchEvent(touchPointer(window, 'pointerdown', 50, 100, 2));
    viewport.dispatchEvent(touchPointer(window, 'pointermove', 50, 50, 2));
    assert.equal(mediaLayer.style.getPropertyValue('--sil-video-brightness'), '1.5');
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'brightness');
    assert.equal(feedbackText.textContent, '150%');
    viewport.dispatchEvent(touchPointer(window, 'pointerup', 50, 50, 2));

    viewport.dispatchEvent(touchPointer(window, 'pointerdown', 50, 100, 5));
    viewport.dispatchEvent(touchPointer(window, 'pointermove', 50, 0, 5));
    assert.equal(mediaLayer.style.getPropertyValue('--sil-video-brightness'), '2');
    assert.equal(feedbackText.textContent, '200%');
    viewport.dispatchEvent(touchPointer(window, 'pointerup', 50, 0, 5));

    viewport.dispatchEvent(touchPointer(window, 'pointerdown', 50, 100, 6));
    viewport.dispatchEvent(touchPointer(window, 'pointermove', 50, 300, 6));
    assert.equal(mediaLayer.style.getPropertyValue('--sil-video-brightness'), '0');
    assert.equal(feedbackText.textContent, '0%');
    viewport.dispatchEvent(touchPointer(window, 'pointerup', 50, 300, 6));

    fullscreen.click();
    await Promise.resolve();
    assert.equal(document.fullscreenElement, stage);
    viewport.dispatchEvent(touchPointer(window, 'pointerdown', 250, 100, 3));
    viewport.dispatchEvent(touchPointer(window, 'pointermove', 250, 200, 3));
    assert.ok(Math.abs(video.volume - 0.3) < Number.EPSILON * 4);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'volume');
    assert.equal(feedbackText.textContent, '30%');
    viewport.dispatchEvent(touchPointer(window, 'pointerup', 250, 200, 3));
  } finally {
    dom.window.close();
  }
});

test('browser runtime gates mouse-wheel volume by focus and normalises trackpad deltas', async () => {
  const fixture = await browserPlayer();
  const { dom, window, stage, viewport, video, fullscreen, feedbackText } = fixture;
  try {
    stage.focus();
    const upward = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, deltaMode: 0 });
    viewport.dispatchEvent(upward);
    assert.equal(upward.defaultPrevented, true);
    assert.ok(Math.abs(video.volume - 0.85) < Number.EPSILON * 4);
    assert.equal(feedbackText.textContent, '85%');

    const trackpadOne = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -50, deltaMode: 0 });
    viewport.dispatchEvent(trackpadOne);
    assert.ok(Math.abs(video.volume - 0.85) < Number.EPSILON * 4);
    const trackpadTwo = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -50, deltaMode: 0 });
    viewport.dispatchEvent(trackpadTwo);
    assert.ok(Math.abs(video.volume - 0.9) < Number.EPSILON * 4);

    await wait(300);
    viewport.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -50, deltaMode: 0 }));
    await wait(300);
    viewport.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -50, deltaMode: 0 }));
    assert.ok(Math.abs(video.volume - 0.9) < Number.EPSILON * 4);

    const lineDown = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1, deltaMode: 1 });
    viewport.dispatchEvent(lineDown);
    assert.ok(Math.abs(video.volume - 0.85) < Number.EPSILON * 4);

    const horizontal = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 100, deltaY: 10, deltaMode: 0 });
    viewport.dispatchEvent(horizontal);
    assert.equal(horizontal.defaultPrevented, false);
    assert.ok(Math.abs(video.volume - 0.85) < Number.EPSILON * 4);

    fullscreen.focus();
    const unfocused = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, deltaMode: 0 });
    viewport.dispatchEvent(unfocused);
    assert.equal(unfocused.defaultPrevented, false);
    assert.ok(Math.abs(video.volume - 0.85) < Number.EPSILON * 4);
  } finally {
    dom.window.close();
  }
});

test('runtime route builder emits split core/subtitle bundles, module worker, WASM variants, and fallback font', async () => {
  const routes = await runtimeRouteData();
  const sizes = Object.fromEntries(routes.map(route => [route.path, route.data.length]));
  const budgets = {
    [RUNTIME_ROUTES.script]: 36000,
    [RUNTIME_ROUTES.subtitles]: 42000,
    [RUNTIME_ROUTES.worker]: 130000,
    [RUNTIME_ROUTES.wasm]: 2300000,
    [RUNTIME_ROUTES.modernWasm]: 2400000,
    [RUNTIME_ROUTES.defaultFont]: 180000
  };
  assert.ok(routes.every(route => Buffer.isBuffer(route.data)));
  assert.doesNotMatch(routes[0].data.subarray(0, 24).toString('utf8'), /^\{"0":/);
  assert.ok(sizes[RUNTIME_ROUTES.script] > 10000);
  assert.ok(sizes[RUNTIME_ROUTES.subtitles] > 10000);
  assert.equal(routes.find(route => route.path === RUNTIME_ROUTES.script).data.includes(Buffer.from('JASSUB')), false);
  assert.equal(routes.find(route => route.path === RUNTIME_ROUTES.script).data.includes(Buffer.from('import(')), true);
  assert.ok(sizes[RUNTIME_ROUTES.worker] > 10000);
  assert.ok(sizes[RUNTIME_ROUTES.wasm] > 1000000);
  assert.ok(sizes[RUNTIME_ROUTES.modernWasm] > 1000000);
  assert.ok(sizes[RUNTIME_ROUTES.defaultFont] > 10000);
  for (const [route, budget] of Object.entries(budgets)) assert.ok(sizes[route] <= budget, `${route} exceeds ${budget} bytes`);
  for (const route of [RUNTIME_ROUTES.script, RUNTIME_ROUTES.subtitles, RUNTIME_ROUTES.worker]) {
    const script = routes.find(entry => entry.path === route).data.toString('utf8');
    const mapRoute = routes.find(entry => entry.path === `${route}.map`);
    assert.equal(mapRoute.internal, true);
    assert.match(script, new RegExp(`sourceMappingURL=${path.basename(route).replace(/\./g, '\\.') }\\.map`));
    const sourceMap = JSON.parse(mapRoute.data.toString('utf8'));
    assert.ok(sourceMap.sourcesContent.length > 0);
    assert.equal(sourceMap.sources.some(source => path.isAbsolute(source)), false);
  }
});
