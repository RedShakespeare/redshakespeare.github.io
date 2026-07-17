'use strict';

const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildBrowserBundle, renderVideoPlayer } = require('../../plugins/hexo-sil-video');

let browserBundlePromise;

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
    download: options.download !== false,
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
  const diagnostics = [];
  window.console.error = (...args) => diagnostics.push(args);
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
    networkState: { value: options.networkState ?? 1, writable: true },
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
    diagnostics,
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

module.exports = { browserPlayer, touchPointer, touchTap };
