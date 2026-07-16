'use strict';

const {
  assert,
  browserPlayer,
  buildBrowserBundle,
  createVideoDemandRegistry,
  FULLSCREEN_UI_HIDE_DELAY,
  JSDOM,
  mockHexo,
  path,
  post,
  registerVideoPlugin,
  renderVideoPlayer,
  RUNTIME_ROUTES,
  test,
  touchPointer,
  touchTap,
  videoData,
  wait
} = require('./helpers/hexo-sil-video-fixture');

test('video demand registry seeds cached Front Matter and raw video tags per generation', () => {
  const demand = createVideoDemandRegistry();
  demand.seed([{ video: { file: 'demo.mp4' } }]);
  assert.equal(demand.hasDemand(), true);
  demand.reset();
  demand.seed([{ _content: '正文 {% video file=demo.mp4 %}' }]);
  assert.equal(demand.hasDemand(), true);
  demand.reset();
  demand.seed([{ _content: '```nunjucks\n{% video file=demo.mp4 %}\n```\n<!-- {% video file=demo.mp4 %} -->' }]);
  assert.equal(demand.hasDemand(), false);
  demand.seed([{ _content: '正文\n<!--\n{% video file=commented.mp4 %}\n-->\n~~~html\n{% video file=fenced.mp4 %}\n~~~' }]);
  assert.equal(demand.hasDemand(), false);
  demand.seed([{ _content: '<!-- ignored --> 正文 {% video file=visible.mp4 %}' }]);
  assert.equal(demand.hasDemand(), true);
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

test('browser runtime deduplicates scoped refreshes and avoids full-document scans for unrelated mutations', async () => {
  const fixture = await browserPlayer();
  const { dom, window, document, player } = fixture;
  try {
    await wait(0);
    await wait(0);
    const nativeMatches = player.matches.bind(player);
    let matchCalls = 0;
    player.matches = value => {
      matchCalls += 1;
      return nativeMatches(value);
    };
    const event = () => new window.CustomEvent('inside', { detail: { root: player } });
    document.dispatchEvent(event());
    document.dispatchEvent(event());
    await Promise.resolve();
    assert.equal(matchCalls, 3);

    const nativeQuerySelectorAll = document.querySelectorAll.bind(document);
    let documentScans = 0;
    document.querySelectorAll = value => {
      documentScans += 1;
      return nativeQuerySelectorAll(value);
    };
    document.body.append(document.createElement('div'));
    await wait(0);
    await wait(0);
    assert.equal(documentScans, 0);
  } finally {
    dom.window.close();
  }
});

test('Inside root refresh recovers only players in the declared subtree', async () => {
  const markup = renderVideoPlayer({
    title: 'Scoped recovery', source: '/video.mp4', type: 'video/mp4', poster: '', preload: 'metadata',
    aspectRatio: '16/9', subtitles: [], fonts: {}, fallbackFont: '',
    runtime: { subtitles: '/subtitles.js', worker: '/worker.js', wasm: '/worker.wasm', modernWasm: '/modern.wasm', defaultFont: '/font.woff2' }
  });
  const dom = new JSDOM(`<!doctype html><body><section id="first">${markup}</section><section id="second">${markup}</section></body>`, {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/'
  });
  try {
    dom.window.TextDecoder = TextDecoder;
    dom.window.console.error = () => {};
    const players = Array.from(dom.window.document.querySelectorAll('[data-sil-video-player]'));
    const models = players.map(player => player.dataset.silVideoModel);
    players.forEach(player => { player.dataset.silVideoModel = 'invalid'; });
    dom.window.eval((await buildBrowserBundle(path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'runtime', 'browser-entry.js'), 'iife')).toString('utf8'));
    assert.ok(players.every(player => player.dataset.silVideoReady === undefined));
    players.forEach((player, index) => { player.dataset.silVideoModel = models[index]; });
    const root = dom.window.document.querySelector('#first');
    dom.window.document.dispatchEvent(new dom.window.CustomEvent('inside', { detail: { root } }));
    await wait(0);
    assert.equal(players[0].dataset.silVideoReady, 'true');
    assert.equal(players[1].dataset.silVideoReady, undefined);
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
    dom.window.eval((await buildBrowserBundle(path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'runtime', 'browser-entry.js'), 'iife')).toString('utf8'));
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

    const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    stage.dispatchEvent(enter);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(enter.defaultPrevented, true);
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

test('browser runtime omits playback feedback for failures, controls, and double clicks', async () => {
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

test('browser runtime shows playback HUD for Space and handles it while progress retains focus', async () => {
  const fixture = await browserPlayer();
  const { dom, window, document, progress, feedback, calls } = fixture;
  try {
    progress.focus();
    progress.value = '50';
    progress.dispatchEvent(new window.Event('input', { bubbles: true }));
    const playEvent = new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    progress.dispatchEvent(playEvent);
    await wait(0);
    assert.equal(playEvent.defaultPrevented, true);
    assert.equal(document.activeElement, progress);
    assert.equal(calls.play, 1);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'playback-play');
    assert.equal(feedback.dataset.silVideoFeedbackVisible, 'true');

    const pauseEvent = new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    progress.dispatchEvent(pauseEvent);
    assert.equal(pauseEvent.defaultPrevented, true);
    assert.equal(calls.pause, 1);
    assert.equal(feedback.dataset.silVideoFeedbackKind, 'playback-pause');
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
