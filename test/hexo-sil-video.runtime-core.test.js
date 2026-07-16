'use strict';

const { assert, test, JSDOM, loadRuntime } = require('./helpers/hexo-sil-video-runtime-fixture');

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

test('player controllers destroy sequentially in reverse order while reporting failures', async () => {
  const { destroyControllersInReverse } = await loadRuntime('controller-lifecycle.js');
  const calls = [];
  let releaseLast;
  const lastPending = new Promise(resolve => { releaseLast = resolve; });
  const controllers = [
    { async destroy() { calls.push('first'); } },
    { async destroy() { calls.push('middle'); throw new Error('middle failed'); } },
    { async destroy() { calls.push('last:start'); await lastPending; calls.push('last:end'); } }
  ];
  const diagnostics = [];
  const destroying = destroyControllersInReverse(controllers, { report: (...args) => diagnostics.push(args) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['last:start']);
  releaseLast();
  await destroying;
  assert.deepEqual(calls, ['last:start', 'last:end', 'middle', 'first']);
  assert.equal(diagnostics[0][0], 'destroy');
  assert.equal(diagnostics[0][1].message, 'middle failed');
});

test('fullscreen action queue serializes work and becomes idle after completion', async () => {
  const { createFullscreenActionQueue } = await loadRuntime('fullscreen-action-queue.js');
  const queue = createFullscreenActionQueue();
  const calls = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const first = queue.enqueue(async () => { calls.push('first:start'); await blocked; calls.push('first:end'); });
  const second = queue.enqueue(() => { calls.push('second'); });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['first:start']);
  release();
  await Promise.all([first, second, queue.wait()]);
  assert.deepEqual(calls, ['first:start', 'first:end', 'second']);
  await queue.wait();
});

test('player runtime module imports without browser globals or startup side effects', async () => {
  const runtime = await loadRuntime('player.js');
  assert.equal(typeof runtime.createVideoRuntime, 'function');
  assert.equal(typeof runtime.refreshOnePlayer, 'function');
});

test('production runtime services expose the complete non-optional contract', async () => {
  const { assertRuntimeServices, createRuntimeServices } = await loadRuntime('runtime-services.js');
  const dom = new JSDOM('<!doctype html><body><aside><p></p></aside></body>', { pretendToBeVisual: true });
  const player = dom.window.document.querySelector('aside');
  const status = dom.window.document.querySelector('p');
  const services = createRuntimeServices({ player, status, windowRef: dom.window });
  assert.deepEqual(Object.keys(services).sort(), ['clock', 'diagnostics', 'state', 'ui']);
  assert.equal(typeof services.clock.requestAnimationFrame, 'function');
  assert.equal(typeof services.diagnostics.report, 'function');
  assert.equal(typeof services.state.set, 'function');
  assert.equal(typeof services.ui.controlsOpen, 'function');
  assert.equal(assertRuntimeServices(services), services);
  assert.throws(() => createRuntimeServices(), /需要 player、status 和 windowRef/);
  assert.throws(() => assertRuntimeServices({ ...services, ui: {} }), /服务不完整：ui/);
  services.state.destroy();
  services.ui.destroy();
  dom.window.close();
});

test('media projection directly maps volume and repeat state to UI', async () => {
  const { createMediaProjection } = await loadRuntime('media-projection.js');
  const dom = new JSDOM('<!doctype html><body><aside><video></video><input><span data-current></span><span data-duration></span><button data-play></button><button data-mute></button><button data-repeat></button></aside></body>');
  const document = dom.window.document;
  const player = document.querySelector('aside');
  const video = document.querySelector('video');
  const progress = document.querySelector('input');
  const volume = document.createElement('input');
  video.volume = 0.4;
  video.loop = true;
  const projection = createMediaProjection({
    player, video, progress, volume,
    current: document.querySelector('[data-current]'),
    duration: document.querySelector('[data-duration]'),
    play: document.querySelector('[data-play]'),
    mute: document.querySelector('[data-mute]'),
    repeat: document.querySelector('[data-repeat]'),
    onPlaybackStateChange() {}
  });
  projection.volume();
  projection.repeat();
  assert.equal(player.dataset.silVideoVolumeLevel, 'medium');
  assert.equal(volume.getAttribute('aria-valuetext'), '40%');
  assert.equal(player.dataset.silVideoLoop, 'true');
  dom.window.close();
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

test('video runtime destroy is idempotent and reports instance cleanup failures', async () => {
  const { createVideoRuntime } = await loadRuntime('player.js');
  const dom = new JSDOM('<!doctype html><body><aside class="sil-video-player" data-sil-video-player data-sil-video-model="model"></aside></body>');
  let destroyCalls = 0;
  const diagnostics = [];
  class Observer {
    observe() {}
    disconnect() {}
  }
  const runtime = createVideoRuntime({
    windowRef: dom.window,
    documentRef: dom.window.document,
    ElementRef: dom.window.Element,
    MutationObserverRef: Observer,
    queueMicrotaskRef: queueMicrotask,
    diagnostics: { report: (...args) => diagnostics.push(args) },
    createInstance: () => ({
      mount() {},
      refreshTheme() {},
      async destroy() { destroyCalls += 1; throw new Error('cleanup failed'); }
    })
  });
  const first = runtime.destroy();
  const second = runtime.destroy();
  assert.equal(first, second);
  await first;
  assert.equal(destroyCalls, 1);
  assert.equal(diagnostics[0][0], 'runtime.destroy');
  assert.equal(diagnostics[0][1].message, 'cleanup failed');
  assert.equal(dom.window.__hexoSilVideoRuntime, undefined);
  dom.window.close();
});

test('runtime destroy prevents refresh from orphaning instances created during teardown', async () => {
  const { createVideoRuntime } = await loadRuntime('player.js');
  const dom = new JSDOM('<!doctype html><body><aside class="sil-video-player" data-sil-video-player data-sil-video-model="one"></aside></body>');
  const firstPlayer = dom.window.document.querySelector('aside');
  const secondPlayer = dom.window.document.createElement('aside');
  secondPlayer.className = 'sil-video-player';
  secondPlayer.dataset.silVideoPlayer = '';
  secondPlayer.dataset.silVideoModel = 'two';
  let release;
  let instances = 0;
  class Observer { observe() {} disconnect() {} }
  const runtime = createVideoRuntime({
    windowRef: dom.window,
    documentRef: dom.window.document,
    ElementRef: dom.window.Element,
    MutationObserverRef: Observer,
    queueMicrotaskRef: queueMicrotask,
    createInstance: ({ player }) => {
      instances += 1;
      return {
      mount() {},
      refreshTheme() {},
      destroy() {
        if (player === firstPlayer) return new Promise(resolve => { release = resolve; });
        return Promise.resolve();
      }
      };
    }
  });
  const destroying = runtime.destroy();
  dom.window.document.body.append(secondPlayer);
  runtime.refresh();
  release();
  await destroying;
  assert.equal(instances, 1);
  assert.equal(dom.window.__hexoSilVideoRuntime, undefined);
  dom.window.close();
});

test('runtime singleton remains authoritative until asynchronous teardown finishes', async () => {
  const { createVideoRuntime } = await loadRuntime('player.js');
  const dom = new JSDOM('<!doctype html><body><aside class="sil-video-player" data-sil-video-player data-sil-video-model="one"></aside></body>');
  let release;
  class Observer { observe() {} disconnect() {} }
  const runtime = createVideoRuntime({
    windowRef: dom.window, documentRef: dom.window.document, ElementRef: dom.window.Element,
    MutationObserverRef: Observer, queueMicrotaskRef: queueMicrotask,
    createInstance: () => ({ mount() {}, refreshTheme() {}, destroy() { return new Promise(resolve => { release = resolve; }); } })
  });
  const destroying = runtime.destroy();
  const same = createVideoRuntime({
    windowRef: dom.window, documentRef: dom.window.document, ElementRef: dom.window.Element,
    MutationObserverRef: Observer, queueMicrotaskRef: queueMicrotask, createInstance: () => { throw new Error('new runtime created'); }
  });
  assert.equal(same, runtime);
  release();
  await destroying;
  assert.equal(dom.window.__hexoSilVideoRuntime, undefined);
  dom.window.close();
});

test('refresh replaces a ready instance when its model source changes', async () => {
  const { createVideoRuntime } = await loadRuntime('player.js');
  const dom = new JSDOM('<!doctype html><body><aside class="sil-video-player" data-sil-video-player data-sil-video-model="one"></aside></body>');
  const player = dom.window.document.querySelector('aside');
  const calls = [];
  class Observer { observe() {} disconnect() {} }
  let source = 'one';
  const runtime = createVideoRuntime({
    windowRef: dom.window, documentRef: dom.window.document, ElementRef: dom.window.Element,
    MutationObserverRef: Observer, queueMicrotaskRef: queueMicrotask,
    createInstance: () => { const created = source; return { mount() { calls.push(`mount:${created}`); }, refreshTheme() {}, async destroy() { calls.push(`destroy:${created}`); } }; }
  });
  player.dataset.silVideoModel = 'two';
  source = 'two';
  runtime.refresh();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['mount:one', 'destroy:one', 'mount:two']);
  await runtime.destroy();
  dom.window.close();
});

test('a player removed before its scheduled refresh is never initialised', async () => {
  const { createVideoRuntime } = await loadRuntime('player.js');
  const dom = new JSDOM('<!doctype html><body></body>');
  let observeMutations;
  let instances = 0;
  class Observer {
    constructor(callback) { observeMutations = callback; }
    observe() {}
    disconnect() {}
  }
  const runtime = createVideoRuntime({
    windowRef: dom.window,
    documentRef: dom.window.document,
    ElementRef: dom.window.Element,
    MutationObserverRef: Observer,
    queueMicrotaskRef: queueMicrotask,
    createInstance: () => { instances += 1; return { mount() {}, refreshTheme() {}, async destroy() {} }; }
  });
  const player = dom.window.document.createElement('aside');
  player.className = 'sil-video-player';
  player.dataset.silVideoPlayer = '';
  player.dataset.silVideoModel = 'model';
  observeMutations([{ removedNodes: [player], addedNodes: [player] }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(instances, 0);
  await runtime.destroy();
  dom.window.close();
});

test('removed player recovers when destroy fails and the node reconnects', async () => {
  const { createVideoRuntime } = await loadRuntime('player.js');
  const dom = new JSDOM('<!doctype html><body><aside class="sil-video-player" data-sil-video-player data-sil-video-model="model"></aside></body>');
  const player = dom.window.document.querySelector('aside');
  const diagnostics = [];
  let observeMutations;
  let instances = 0;
  class Observer {
    constructor(callback) { observeMutations = callback; }
    observe() {}
    disconnect() {}
  }
  const runtime = createVideoRuntime({
    windowRef: dom.window,
    documentRef: dom.window.document,
    ElementRef: dom.window.Element,
    MutationObserverRef: Observer,
    queueMicrotaskRef: queueMicrotask,
    diagnostics: { report: (...args) => diagnostics.push(args) },
    createInstance: () => {
      const current = ++instances;
      return {
        mount() {},
        refreshTheme() {},
        async destroy() { if (current === 1) throw new Error('removed cleanup failed'); }
      };
    }
  });
  player.remove();
  observeMutations([{ removedNodes: [player], addedNodes: [] }]);
  dom.window.document.body.append(player);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(instances, 2);
  assert.equal(diagnostics[0][0], 'destroy');
  assert.equal(diagnostics[0][1].message, 'removed cleanup failed');
  await runtime.destroy();
  dom.window.close();
});
