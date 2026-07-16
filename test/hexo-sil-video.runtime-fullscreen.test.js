'use strict';

const { assert, test, JSDOM, createRuntimeServices, loadRuntime, subtitleDom, model, moduleRuntime, rendererFactory } = require('./helpers/hexo-sil-video-runtime-fixture');

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
