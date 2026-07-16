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


function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
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
  mockHexo,
  post,
  runtime,
  sourceRoot,
  videoData,
  wait
};
