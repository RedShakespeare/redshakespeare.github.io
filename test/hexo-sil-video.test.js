'use strict';

const assert = require('node:assert/strict');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const subsrt = require('subsrt');
const {
  BUILTIN_SKINS,
  FULLSCREEN_UI_HIDE_DELAY,
  PLAYER_START,
  RUNTIME_ROUTES,
  VOLUME_CLOSE_DELAY,
  buildBrowserBundle,
  mergeVideo,
  normaliseVideo,
  parseVideoTagArgs,
  registerVideoPlugin,
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

function touchPointer(window, type, x, y, pointerId = 1) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
    isPrimary: { value: true }
  });
  return event;
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
  const orientationLocks = [];
  let orientationUnlocks = 0;
  Object.defineProperties(video, {
    volume: { value: 0.8, writable: true },
    muted: { value: false, writable: true },
    paused: { value: true, writable: true },
    ended: { value: false, writable: true },
    duration: { value: 100, writable: true },
    currentTime: { value: 20, writable: true }
  });
  video.play = async () => {
    playCalls += 1;
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
    document.fullscreenElement = stage;
    document.dispatchEvent(new window.Event('fullscreenchange'));
  };
  document.exitFullscreen = async () => {
    fullscreenExits += 1;
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
  assert.match(html, /data-sil-video-stage tabindex="-1"/);
  assert.match(html, /data-sil-video-media-layer/);
  assert.match(html, /data-sil-video-feedback/);
  assert.match(html, /data-sil-video-feedback-text/);
  assert.match(html, /sil-video-player__icon--feedback-brightness/);
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
  assert.match(css, /border-left-width:3px/);
  assert.match(css, /sil-video-player__video:focus-visible \{ outline:1px solid/);
  assert.match(css, /sil-video-player__volume \{[^}]*writing-mode:vertical-lr/);
  assert.doesNotMatch(css, /volume-control:focus-within/);
  assert.match(css, /sil-video-player__stage:fullscreen/);
  assert.match(css, /sil-video-player__feedback \{[^}]*color:var\(--sil-video-ink\)/);
  assert.match(css, /data-sil-video-feedback-visible/);
  assert.match(css, /sil-video-player__media-layer \{[^}]*filter:brightness/);
  assert.match(css, /data-sil-video-feedback-kind="brightness"/);
  assert.match(css, /@media \(pointer:coarse\) \{[\s\S]*touch-action:none/);
  assert.match(css, /data-sil-video-fullscreen="true"[^}]*sil-video-player__subtitle-control/);
  assert.doesNotMatch(css, /@media screen and \(max-width:430px\) \{\s*\.sil-video-player__toolbar/);
  assert.match(css, /data-sil-video-ui-hidden/);
  assert.doesNotMatch(css, /sil-video-player:fullscreen/);
  assert.match(runtimeSource, /const rates = \[1, 1\.25, 1\.5, 1\.75, 2, 0\.5, 0\.75\]/);
  assert.match(runtimeSource, /stage\.requestFullscreen\(\)/);
  assert.doesNotMatch(runtimeSource, /player\.requestFullscreen\(\)/);
  assert.match(runtimeSource, /document\.fullscreenElement === stage/);
  assert.match(runtimeSource, /subtitleRenderer\.resize\(true\)/);
  assert.match(runtimeSource, /window\.setTimeout\([\s\S]*VOLUME_CLOSE_DELAY/);
  assert.match(runtimeSource, /window\.setTimeout\([\s\S]*FULLSCREEN_UI_HIDE_DELAY/);
  assert.match(runtimeSource, /const VIEWPORT_CLICK_DELAY = 300/);
  assert.match(runtimeSource, /const FEEDBACK_HIDE_DELAY = 900/);
  assert.match(runtimeSource, /const TOUCH_GESTURE_THRESHOLD = 12/);
  assert.match(runtimeSource, /const TOUCH_SEEK_SECONDS = 60/);
  assert.match(runtimeSource, /const WHEEL_PIXEL_STEP = 100/);
  assert.match(runtimeSource, /const WHEEL_RESET_DELAY = 250/);
  assert.match(runtimeSource, /orientation\?\.lock\?\.\('landscape'\)/);
  assert.match(runtimeSource, /focusWithoutScroll\(stage\)/);
  assert.match(runtimeSource, /focusWithoutScroll\(player\)/);
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
    await Promise.resolve();
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
