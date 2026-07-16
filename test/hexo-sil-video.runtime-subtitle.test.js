'use strict';

const { assert, test, createRuntimeServices, loadRuntime, subtitleDom, model, moduleRuntime, rendererFactory } = require('./helpers/hexo-sil-video-runtime-fixture');

test('subtitle downloads reject oversized responses before conversion', async () => {
  const { loadSubtitleText, MAX_SUBTITLE_BYTES } = await loadRuntime('subtitles.js');
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    headers: new Headers({ 'content-length': String(MAX_SUBTITLE_BYTES + 1) }),
    async arrayBuffer() { throw new Error('body should not be read'); }
  });
  try {
    await assert.rejects(loadSubtitleText({ url: '/large.srt', format: 'srt' }), /4 MiB/);
  } finally {
    global.fetch = previousFetch;
  }
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
