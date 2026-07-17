'use strict';

const {
  assert,
  buildBrowserBundle,
  JSDOM,
  path,
  renderVideoPlayer,
  test,
  wait
} = require('./helpers/hexo-sil-video-fixture');
const { browserPlayer } = require('./helpers/hexo-sil-video-browser-fixture');

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

test('browser runtime shows and clears the loading HUD around playback stalls', async () => {
  const fixture = await browserPlayer();
  const { dom, window, video, player } = fixture;
  const loading = player.querySelector('[data-sil-video-loading]');
  try {
    video.paused = false;
    video.dispatchEvent(new window.Event('waiting'));
    assert.equal(loading.hidden, false);
    assert.equal(loading.querySelector('span').textContent, '正在加载...');
    video.dispatchEvent(new window.Event('playing'));
    assert.equal(loading.hidden, true);
    video.dispatchEvent(new window.Event('stalled'));
    assert.equal(loading.hidden, false);
    video.paused = true;
    video.dispatchEvent(new window.Event('pause'));
    assert.equal(loading.hidden, true);
    video.paused = true;
    video.dispatchEvent(new window.Event('waiting'));
    assert.equal(loading.hidden, true);
  } finally {
    dom.window.close();
  }
});

test('browser runtime turns media failures into a manual reload action', async () => {
  const fixture = await browserPlayer();
  const { dom, window, player, video, play, calls } = fixture;
  try {
    video.dispatchEvent(new window.Event('error'));
    assert.equal(player.dataset.silVideoMediaError, 'true');
    assert.equal(play.getAttribute('aria-label'), '重新加载');
    assert.equal(play.hasAttribute('aria-pressed'), false);
    play.click();
    assert.equal(calls.load, 1);
    assert.equal(player.dataset.silVideoMediaError, undefined);
    assert.equal(play.getAttribute('aria-label'), '播放');
    assert.equal(play.getAttribute('aria-pressed'), 'false');
    assert.equal(player.querySelector('[data-sil-video-status]').textContent, '正在加载视频…');
  } finally {
    dom.window.close();
  }
});

test('disabled downloads use a retry message instead of a missing download link', async () => {
  const fixture = await browserPlayer({ download: false });
  const { dom, window, video, player } = fixture;
  try {
    video.dispatchEvent(new window.Event('error'));
    assert.equal(player.querySelector('[data-sil-video-status]').textContent, '视频加载失败，请稍后重试。');
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

test('browser runtime rejects incomplete resource routes before mounting controllers', async () => {
  const html = renderVideoPlayer({
    title: 'Incomplete routes', source: '/video.mp4', type: 'video/mp4', poster: '', preload: 'metadata',
    aspectRatio: '16/9', subtitles: [], fonts: {}, fallbackFont: '',
    runtime: { subtitles: '/subtitles.js', wasm: '/worker.wasm', modernWasm: '/modern.wasm', defaultFont: '/font.woff2' }
  });
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/'
  });
  try {
    dom.window.TextDecoder = TextDecoder;
    dom.window.console.error = () => {};
    dom.window.eval((await buildBrowserBundle(path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'runtime', 'browser-entry.js'), 'iife')).toString('utf8'));
    const player = dom.window.document.querySelector('[data-sil-video-player]');
    assert.equal(player.dataset.silVideoReady, undefined);
    assert.equal(player.dataset.silVideoError, 'true');
    assert.equal(player.querySelector('video').controls, true);
  } finally {
    dom.window.close();
  }
});

test('browser runtime rejects stale models and missing reload view contracts', async () => {
  const markup = renderVideoPlayer({
    title: 'Contract', source: '/video.mp4', type: 'video/mp4', poster: '', preload: 'metadata',
    aspectRatio: '16/9', subtitles: [], fonts: {}, fallbackFont: '',
    runtime: { subtitles: '/subtitles.js', worker: '/worker.js', wasm: '/worker.wasm', modernWasm: '/modern.wasm', defaultFont: '/font.woff2' }
  });
  const source = markup.match(/data-sil-video-model="([A-Za-z0-9+/=]+)"/)[1];
  const stale = JSON.parse(Buffer.from(source, 'base64').toString('utf8'));
  stale.version -= 1;
  const invalidSize = JSON.parse(Buffer.from(source, 'base64').toString('utf8'));
  invalidSize.sourceSize = 0;
  const variants = [
    markup.replace(source, Buffer.from(JSON.stringify(stale)).toString('base64')),
    markup.replace(source, Buffer.from(JSON.stringify(invalidSize)).toString('base64')),
    markup.replace(/<svg class="sil-video-player__icon sil-video-player__icon--reload"[\s\S]*?<\/svg>/, '')
  ];
  const bundle = (await buildBrowserBundle(path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'runtime', 'browser-entry.js'), 'iife')).toString('utf8');
  for (const html of variants) {
    const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
      runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/'
    });
    try {
      dom.window.TextDecoder = TextDecoder;
      dom.window.console.error = () => {};
      dom.window.eval(bundle);
      const player = dom.window.document.querySelector('[data-sil-video-player]');
      assert.equal(player.dataset.silVideoReady, undefined);
      assert.equal(player.dataset.silVideoError, 'true');
      assert.equal(player.querySelector('video').controls, true);
    } finally {
      dom.window.close();
    }
  }
});
