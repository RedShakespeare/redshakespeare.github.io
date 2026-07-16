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
const { createVideoDemandRegistry } = require('../../plugins/hexo-sil-video/lib/video-demand');
const {
  BUILTIN_SKINS,
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
} = require('../../plugins/hexo-sil-video');

const fixtureRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), 'hexo-sil-video-'));
const sourceRoot = path.join(fixtureRoot, 'source');
const fixtureFiles = {
  'files/video/demo.mp4': Buffer.from('video'),
  'files/video/demo.ogv': Buffer.from('ogv-video'),
  'files/video/demo.mpeg': Buffer.from('mpeg-video'),
  'files/video/demo.mov': Buffer.from('mov-video'),
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
  'files/video/demo.ogv': { size: 9, type: 'video/ogg' },
  'files/video/demo.mpeg': { size: 10, type: 'video/mpeg' },
  'files/video/demo.mov': { size: 9, type: 'video/quicktime' },
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
  browserBundlePromise ||= buildBrowserBundle(path.join(__dirname, '..', '..', 'plugins', 'hexo-sil-video', 'runtime', 'browser-entry.js'), 'iife');
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


module.exports = {
  assert,
  crypto,
  fs,
  path,
  test,
  JSDOM,
  subsrt,
  createVideoDemandRegistry,
  BUILTIN_SKINS,
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
  volumeLevel,
  browserPlayer,
  mockHexo,
  post,
  runtime,
  sourceRoot,
  touchPointer,
  touchTap,
  videoData,
  wait
};
