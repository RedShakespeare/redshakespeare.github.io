'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');
const { createRuntimeServices } = require('./hexo-sil-video-runtime-services');

const runtimeRoot = path.join(__dirname, '..', '..', 'plugins', 'hexo-sil-video', 'runtime');

async function loadRuntime(name) {
  const result = await esbuild.build({
    entryPoints: [path.join(runtimeRoot, name)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: ['es2020']
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

function subtitleDom() {
  const dom = new JSDOM('<!doctype html><body><aside><button data-action></button><div data-menu></div><video></video></aside></body>', {
    pretendToBeVisual: true,
    url: 'https://example.test/'
  });
  const { document } = dom.window;
  return {
    dom,
    player: document.querySelector('aside'),
    button: document.querySelector('[data-action]'),
    menu: document.querySelector('[data-menu]'),
    video: document.querySelector('video'),
    services: createRuntimeServices(dom.window)
  };
}

function model() {
  return {
    subtitles: [
      { label: '中文', srclang: 'zh-Hans', default: false, format: 'ass', url: '/zh.ass' },
      { label: 'English', srclang: 'en', default: false, format: 'ass', url: '/en.ass' }
    ],
    fonts: {},
    fallbackFont: '',
    runtime: { subtitles: '/subtitles.js', worker: '/worker.js', wasm: '/worker.wasm', modernWasm: '/modern.wasm', defaultFont: '/font.woff2' }
  };
}

function moduleRuntime(contents) {
  return {
    async loadSubtitleText(track, signal) {
      if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      return contents[track.label];
    }
  };
}

function rendererFactory(log, behaviour = {}) {
  return ({ content }) => {
    const renderer = {
      ready: Promise.resolve(),
      renderer: {
        async setTrack(next) {
          log.push(['set', next]);
          if (behaviour.failSet?.(next, log)) throw new Error('set failed');
        },
        async freeTrack() { log.push(['free']); }
      },
      async destroy() { log.push(['destroy', content]); },
      async resize() {}
    };
    log.push(['create', content]);
    return renderer;
  };
}


module.exports = { assert, test, JSDOM, createRuntimeServices, loadRuntime, subtitleDom, model, moduleRuntime, rendererFactory };
