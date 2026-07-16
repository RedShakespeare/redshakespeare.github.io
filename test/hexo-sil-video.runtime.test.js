'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');
const { createRuntimeServices } = require('./helpers/hexo-sil-video-runtime-services');

const runtimeRoot = path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'runtime');

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

test('runtime and CommonJS state coordinators share the same channel semantics', async () => {
  const common = require('../plugins/hexo-sil-video/lib/player-state');
  const runtime = await loadRuntime('state-coordinator.js');
  const runScenario = createCoordinator => {
    const player = { dataset: {} };
    const status = { textContent: '' };
    const state = createCoordinator({ player, status });
    state.set('media', '媒体信息');
    state.set('subtitles', '字幕加载中', { level: 'loading' });
    state.set('fullscreen', '无法进入全屏。', { error: true });
    state.set('media', '新媒体信息');
    const errorState = [status.textContent, player.dataset.silVideoError, state.snapshot()];
    state.clear('fullscreen');
    const restoredState = [status.textContent, player.dataset.silVideoError, state.snapshot()];
    return JSON.parse(JSON.stringify({ errorState, restoredState }));
  };

  assert.deepEqual(runScenario(runtime.createStateCoordinator), runScenario(common.createStateCoordinator));
  assert.deepEqual(runtime.STATE_CHANNELS, common.STATE_CHANNELS);
  assert.equal(runtime.VOLUME_CLOSE_DELAY, common.VOLUME_CLOSE_DELAY);
  assert.equal(runtime.FULLSCREEN_UI_HIDE_DELAY, common.FULLSCREEN_UI_HIDE_DELAY);
});

test('cleanup errors preserve their causes without requiring AggregateError', async () => {
  const runtime = await loadRuntime('shared.js');
  const causes = [new Error('first'), new Error('second')];
  const error = runtime.createCleanupError('cleanup failed', causes);
  assert.equal(error.name, 'CleanupError');
  assert.equal(error.message, 'cleanup failed');
  assert.deepEqual(error.errors, causes);
  const flattened = [];
  runtime.appendCleanupError(flattened, error);
  assert.deepEqual(flattened, causes);
});

test('player runtime module imports without browser globals or startup side effects', async () => {
  const runtime = await loadRuntime('player.js');
  assert.equal(typeof runtime.createVideoRuntime, 'function');
  assert.equal(typeof runtime.refreshOnePlayer, 'function');
});

test('refreshOnePlayer shares initialise and theme refresh projection', async () => {
  const { refreshOnePlayer } = await loadRuntime('player.js');
  const dom = new JSDOM('<!doctype html><body><aside class="sil-video-player" data-sil-video-player data-sil-video-model="model"></aside></body>');
  const player = dom.window.document.querySelector('aside');
  const records = new Map();
  const calls = [];
  const instance = {
    mount() { calls.push('mount'); },
    refreshTheme() { calls.push('theme'); },
    async destroy() {}
  };
  const options = {
    player,
    records,
    diagnostics: { report() {} },
    createInstance: () => instance
  };
  refreshOnePlayer(options);
  refreshOnePlayer(options);
  assert.deepEqual(calls, ['mount', 'theme', 'theme']);
  assert.equal(records.get(player).status, 'ready');
  dom.window.close();
});

test('subtitle module import failure is retryable and successful selection commits atomically', async () => {
  const { createSubtitleController } = await loadRuntime('subtitle-controller.js');
  const refs = subtitleDom();
  const attempts = [];
  let first = true;
  const log = [];
  const controller = createSubtitleController({
    ...refs,
    model: model(),
    moduleLoader: async () => {
      attempts.push('import');
      if (first) { first = false; throw new Error('import failed'); }
      return moduleRuntime({ 中文: 'A', English: 'B' });
    },
    rendererFactory: rendererFactory(log)
  });

  assert.equal(await controller.select(0), false);
  assert.equal(await controller.select(0), true);
  assert.deepEqual(attempts, ['import', 'import']);
  assert.equal(refs.button.getAttribute('aria-pressed'), 'true');
  assert.equal(refs.menu.querySelector('[data-sil-video-track="0"]').getAttribute('aria-checked'), 'true');
  await controller.destroy();
  refs.dom.window.close();
});

test('subtitle renderer readiness failure destroys the candidate and permits recreation', async () => {
  const { createSubtitleController } = await loadRuntime('subtitle-controller.js');
  const refs = subtitleDom();
  const log = [];
  let attempt = 0;
  const controller = createSubtitleController({
    ...refs,
    model: model(),
    moduleLoader: async () => moduleRuntime({ 中文: 'A', English: 'B' }),
    rendererFactory: ({ content }) => {
      attempt += 1;
      const current = attempt;
      log.push(['create', current]);
      return {
        ready: current === 1 ? Promise.reject(new Error('ready failed')) : Promise.resolve(),
        renderer: { async setTrack() {}, async freeTrack() {} },
        async destroy() { log.push(['destroy', current, content]); },
        async resize() {}
      };
    }
  });

  assert.equal(await controller.select(0), false);
  assert.equal(await controller.select(0), true);
  assert.deepEqual(log, [['create', 1], ['destroy', 1, 'A'], ['create', 2]]);
  await controller.destroy();
  refs.dom.window.close();
});

test('a superseded subtitle request cannot overwrite the newer committed track', async () => {
  const { createSubtitleController } = await loadRuntime('subtitle-controller.js');
  const refs = subtitleDom();
  const log = [];
  let releaseFirst;
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const first = new Promise(resolve => { releaseFirst = resolve; });
  const controller = createSubtitleController({
    ...refs,
    model: model(),
    moduleLoader: async () => ({
      async loadSubtitleText(track) {
        if (track.label === '中文') {
          markStarted();
          return first;
        }
        return 'B';
      }
    }),
    rendererFactory: rendererFactory(log)
  });

  const staleSelection = controller.select(0);
  await started;
  assert.equal(await controller.select(1), true);
  releaseFirst('A');
  assert.equal(await staleSelection, false);
  assert.equal(refs.menu.querySelector('[data-sil-video-track="1"]').getAttribute('aria-checked'), 'true');
  assert.deepEqual(log, [['create', 'B']]);
  await controller.destroy();
  refs.dom.window.close();
});

test('a superseded subtitle renderer candidate is destroyed before the next track commits', async () => {
  const { createSubtitleController } = await loadRuntime('subtitle-controller.js');
  const refs = subtitleDom();
  const log = [];
  let markCreated;
  const created = new Promise(resolve => { markCreated = resolve; });
  const firstReady = new Promise(() => {});
  const controller = createSubtitleController({
    ...refs,
    model: model(),
    moduleLoader: async () => moduleRuntime({ 中文: 'A', English: 'B' }),
    rendererFactory: ({ content }) => {
      log.push(['create', content]);
      if (content === 'A') markCreated();
      return {
        ready: content === 'A' ? firstReady : Promise.resolve(),
        renderer: { async setTrack() {}, async freeTrack() {} },
        async destroy() { log.push(['destroy', content]); },
        async resize() {}
      };
    }
  });

  const staleSelection = controller.select(0);
  await created;
  const currentSelection = controller.select(1);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(log.slice(0, 2), [['create', 'A'], ['destroy', 'A']]);
  assert.equal(await staleSelection, false);
  assert.equal(await currentSelection, true);
  assert.deepEqual(log.slice(0, 3), [['create', 'A'], ['destroy', 'A'], ['create', 'B']]);
  await controller.destroy();
  refs.dom.window.close();
});

test('subtitle switch failure restores the old track and selection', async () => {
  const { createSubtitleController } = await loadRuntime('subtitle-controller.js');
  const refs = subtitleDom();
  const log = [];
  let failNext = true;
  const controller = createSubtitleController({
    ...refs,
    model: model(),
    moduleLoader: async () => moduleRuntime({ 中文: 'A', English: 'B' }),
    rendererFactory: rendererFactory(log, {
      failSet(next) {
        if (next === 'B' && failNext) { failNext = false; return true; }
        return false;
      }
    })
  });
  assert.equal(await controller.select(0), true);
  assert.equal(await controller.select(1), false);
  assert.equal(refs.button.getAttribute('aria-pressed'), 'true');
  assert.equal(refs.menu.querySelector('[data-sil-video-track="0"]').getAttribute('aria-checked'), 'true');
  assert.deepEqual(log.map(entry => entry[0]), ['create', 'set', 'set']);
  await controller.destroy();
  refs.dom.window.close();
});

test('subtitle rollback failure destroys the renderer and clears selection', async () => {
  const { createSubtitleController } = await loadRuntime('subtitle-controller.js');
  const refs = subtitleDom();
  const log = [];
  const controller = createSubtitleController({
    ...refs,
    model: model(),
    moduleLoader: async () => moduleRuntime({ 中文: 'A', English: 'B' }),
    rendererFactory: rendererFactory(log, { failSet: next => next === 'B' || next === 'A' })
  });
  assert.equal(await controller.select(0), true);
  assert.equal(await controller.select(1), false);
  assert.equal(refs.button.getAttribute('aria-pressed'), 'false');
  assert.equal(log.at(-1)[0], 'destroy');
  await controller.destroy();
  refs.dom.window.close();
});

test('subtitle rollback clears a renderer even when its own destroy fails, allowing a fresh retry', async () => {
  const { createSubtitleController } = await loadRuntime('subtitle-controller.js');
  const refs = subtitleDom();
  let creation = 0;
  const diagnostics = [];
  const controller = createSubtitleController({
    ...refs,
    model: model(),
    moduleLoader: async () => moduleRuntime({ 中文: 'A', English: 'B' }),
    services: createRuntimeServices(refs.dom.window, { diagnostics: { report: (...args) => diagnostics.push(args) } }),
    rendererFactory: () => {
      creation += 1;
      const current = creation;
      return {
        ready: Promise.resolve(),
        renderer: {
          async setTrack() { if (current === 1) throw new Error('set failed'); },
          async freeTrack() {}
        },
        async destroy() { if (current === 1) throw new Error('destroy failed'); },
        async resize() {}
      };
    }
  });
  assert.equal(await controller.select(0), true);
  assert.equal(await controller.select(1), false);
  assert.equal(refs.button.getAttribute('aria-pressed'), 'false');
  assert.equal(await controller.select(1), true);
  assert.equal(creation, 2);
  assert.ok(diagnostics.some(entry => entry[0] === 'subtitle.destroy'));
  await controller.destroy();
  refs.dom.window.close();
});

test('subtitle destroy waits for an in-flight renderer operation', async () => {
  const { createSubtitleController } = await loadRuntime('subtitle-controller.js');
  const refs = subtitleDom();
  let release;
  const operation = new Promise(resolve => { release = resolve; });
  const log = [];
  let started = false;
  const controller = createSubtitleController({
    ...refs,
    model: model(),
    moduleLoader: async () => moduleRuntime({ 中文: 'A', English: 'B' }),
    rendererFactory: () => ({
      ready: Promise.resolve(),
      renderer: { async setTrack() { started = true; await operation; log.push('set-done'); }, async freeTrack() {} },
      async destroy() { log.push('destroy'); },
      async resize() {}
    })
  });
  assert.equal(await controller.select(0), true);
  const selection = controller.select(1);
  await new Promise(resolve => setImmediate(resolve));
  const destroying = controller.destroy();
  assert.equal(started, true);
  assert.deepEqual(log, []);
  release();
  await Promise.all([selection, destroying]);
  assert.deepEqual(log, ['set-done', 'set-done', 'destroy']);
  refs.dom.window.close();
});

test('subtitle destroy reports renderer cleanup failures through its aggregate result', async () => {
  const { createSubtitleController } = await loadRuntime('subtitle-controller.js');
  const refs = subtitleDom();
  const diagnostics = [];
  const controller = createSubtitleController({
    ...refs,
    model: model(),
    moduleLoader: async () => moduleRuntime({ 中文: 'A', English: 'B' }),
    services: createRuntimeServices(refs.dom.window, { diagnostics: { report: (...args) => diagnostics.push(args) } }),
    rendererFactory: () => ({
      ready: Promise.resolve(),
      renderer: { async setTrack() {}, async freeTrack() {} },
      async destroy() { throw new Error('destroy failed'); },
      async resize() {}
    })
  });
  assert.equal(await controller.select(0), true);
  await assert.rejects(controller.destroy(), error => error.name === 'CleanupError' &&
    error.errors.some(item => item.message === 'destroy failed') &&
    error.errors.every(item => item.name !== 'CleanupError'));
  assert.ok(diagnostics.some(entry => entry[0] === 'subtitle.destroy' && entry[1].message === 'destroy failed'));
  assert.equal(await controller.select(1), false);
  refs.dom.window.close();
});

test('subtitle capability failures use the stable public error code and message', async () => {
  const { createSubtitleRenderer } = await loadRuntime('subtitles.js');
  assert.throws(
    () => createSubtitleRenderer({ video: {}, content: '', runtime: {}, fonts: {}, fallbackFont: '' }),
    error => error.code === 'SIL_VIDEO_SUBTITLE_CAPABILITY' && error.message === '当前浏览器不支持高级字幕渲染。'
  );
});

test('fullscreen actions serialize opposite toggles and destroy waits for the queue', async () => {
  const { createFullscreenController } = await loadRuntime('fullscreen-controller.js');
  const dom = new JSDOM('<!doctype html><body><aside><div data-stage><video></video><button></button></div></aside></body>', {
    pretendToBeVisual: true,
    url: 'https://example.test/'
  });
  const { document } = dom.window;
  const player = document.querySelector('aside');
  const stage = document.querySelector('[data-stage]');
  const video = document.querySelector('video');
  const fullscreen = document.querySelector('button');
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.__fullscreenElement || null });
  let releaseEnter;
  const calls = [];
  stage.requestFullscreen = () => {
    calls.push('enter');
    document.__fullscreenElement = stage;
    document.dispatchEvent(new dom.window.Event('fullscreenchange'));
    return new Promise(resolve => { releaseEnter = resolve; });
  };
  document.exitFullscreen = async () => {
    calls.push('exit');
    document.__fullscreenElement = null;
    document.dispatchEvent(new dom.window.Event('fullscreenchange'));
  };
  const controller = createFullscreenController({
    player, video, stage, fullscreen,
    services: createRuntimeServices(dom.window)
  });
  const entering = controller.toggle();
  const exiting = controller.toggle();
  assert.deepEqual(calls, ['enter']);
  let destroyed = false;
  const destroying = controller.destroy().then(() => { destroyed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(destroyed, false);
  releaseEnter();
  assert.equal(await entering, true);
  assert.equal(await exiting, true);
  await destroying;
  assert.deepEqual(calls, ['enter', 'exit']);
  dom.window.close();
});

test('fullscreen actions fail safely when fullscreenchange never confirms the target state', async () => {
  const { createFullscreenController } = await loadRuntime('fullscreen-controller.js');
  const dom = new JSDOM('<!doctype html><body><aside><div data-stage><video></video><button></button></div></aside></body>', {
    pretendToBeVisual: true,
    url: 'https://example.test/'
  });
  const { document } = dom.window;
  const player = document.querySelector('aside');
  const stage = document.querySelector('[data-stage]');
  const video = document.querySelector('video');
  const fullscreen = document.querySelector('button');
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  stage.requestFullscreen = async () => {};
  let timeoutHandler;
  const states = [];
  const diagnostics = [];
  const clock = {
    setTimeout(handler) { timeoutHandler = handler; return 1; },
    clearTimeout() {},
    requestAnimationFrame(handler) { handler(); return null; },
    cancelAnimationFrame() {}
  };
  const controller = createFullscreenController({
    player,
    video,
    stage,
    fullscreen,
    services: createRuntimeServices(dom.window, {
      clock,
      state: { set: (...args) => states.push(args), clear() {} },
      diagnostics: { report: (...args) => diagnostics.push(args) }
    })
  });
  const toggling = controller.toggle();
  await new Promise(resolve => setImmediate(resolve));
  timeoutHandler();
  assert.equal(await toggling, false);
  assert.equal(states[0][1], '无法进入全屏。');
  assert.equal(diagnostics[0][1].code, 'SIL_VIDEO_FULLSCREEN_TIMEOUT');
  await controller.destroy();
  dom.window.close();
});

test('fullscreen waits for a state event that arrives after the native promise resolves', async () => {
  const { createFullscreenController } = await loadRuntime('fullscreen-controller.js');
  const dom = new JSDOM('<!doctype html><body><aside><div data-stage><video></video><button></button></div></aside></body>', {
    pretendToBeVisual: true,
    url: 'https://example.test/'
  });
  const { document } = dom.window;
  const player = document.querySelector('aside');
  const stage = document.querySelector('[data-stage]');
  const video = document.querySelector('video');
  const fullscreen = document.querySelector('button');
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.__fullscreenElement || null });
  stage.requestFullscreen = async () => {};
  const controller = createFullscreenController({
    player, video, stage, fullscreen,
    services: createRuntimeServices(dom.window)
  });
  const entering = controller.toggle();
  await new Promise(resolve => setImmediate(resolve));
  document.__fullscreenElement = stage;
  document.dispatchEvent(new dom.window.Event('fullscreenchange'));
  assert.equal(await entering, true);
  await controller.destroy();
  dom.window.close();
});

test('fullscreen destroy cancels state confirmation without reporting a false timeout', async () => {
  const { createFullscreenController } = await loadRuntime('fullscreen-controller.js');
  const dom = new JSDOM('<!doctype html><body><aside><div data-stage><video></video><button></button></div></aside></body>', {
    pretendToBeVisual: true,
    url: 'https://example.test/'
  });
  const { document } = dom.window;
  const player = document.querySelector('aside');
  const stage = document.querySelector('[data-stage]');
  const video = document.querySelector('video');
  const fullscreen = document.querySelector('button');
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  stage.requestFullscreen = async () => {};
  const states = [];
  const diagnostics = [];
  const controller = createFullscreenController({
    player,
    video,
    stage,
    fullscreen,
    services: createRuntimeServices(dom.window, {
      state: { set: (...args) => states.push(args), clear() {} },
      diagnostics: { report: (...args) => diagnostics.push(args) }
    })
  });
  const entering = controller.toggle();
  await new Promise(resolve => setImmediate(resolve));
  await controller.destroy();
  assert.equal(await entering, false);
  assert.deepEqual(states, []);
  assert.deepEqual(diagnostics, []);
  dom.window.close();
});
