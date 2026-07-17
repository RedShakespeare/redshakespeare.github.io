'use strict';

const {
  assert,
  bootstrapCspHash,
  crypto,
  JSDOM,
  renderBootstrapScript,
  renderVideoPlayer,
  test,
  wait
} = require('./helpers/hexo-sil-video-fixture');

test('inline bootstrap stays idle without players and loads skin then core only once', async () => {
  const bootstrap = renderBootstrapScript({ styles: ['/video.css'], script: '/video.js' });
  const inline = bootstrap.match(/^<script>([\s\S]*)<\/script>$/)[1];
  assert.equal(bootstrapCspHash({ styles: ['/video.css'], script: '/video.js' }), `sha256-${crypto.createHash('sha256').update(inline).digest('base64')}`);
  const source = inline;
  const dom = new JSDOM('<!doctype html><body><main>Plain</main></body>', {
    runScripts: 'outside-only',
    url: 'https://example.test/'
  });
  try {
    dom.window.eval(source);
    assert.equal(dom.window.document.querySelectorAll('link[data-sil-video-style]').length, 0);
    assert.equal(dom.window.document.querySelectorAll('script[data-sil-video-core]').length, 0);

    const player = dom.window.document.createElement('aside');
    player.dataset.silVideoPlayer = '';
    dom.window.document.body.append(player);
    await wait(0);
    const link = dom.window.document.querySelector('link[data-sil-video-style]');
    assert.equal(link.getAttribute('href'), '/video.css');
    assert.equal(dom.window.document.querySelectorAll('link[data-sil-video-style]').length, 1);
    link.dispatchEvent(new dom.window.Event('load'));
    await wait(0);
    assert.equal(dom.window.document.querySelector('script[data-sil-video-core]').getAttribute('src'), '/video.js');
    dom.window.eval(source);

    const second = dom.window.document.createElement('aside');
    second.dataset.silVideoPlayer = '';
    dom.window.document.body.append(second);
    dom.window.document.dispatchEvent(new dom.window.Event('inside'));
    await wait(0);
    assert.equal(dom.window.document.querySelectorAll('link[data-sil-video-style]').length, 1);
    assert.equal(dom.window.document.querySelectorAll('script[data-sil-video-core]').length, 1);
  } finally {
    dom.window.close();
  }
});
test('bootstrap stylesheet failure preserves native controls and retries without another navigation event', async () => {
  const html = renderVideoPlayer({
    title: 'Fallback',
    source: '/video.mp4',
    type: 'video/mp4',
    poster: '',
    preload: 'metadata',
    aspectRatio: '16/9',
    subtitles: [],
    fonts: {},
    fallbackFont: '',
    runtime: { subtitles: '/subtitles.js' }
  });
  const bootstrap = renderBootstrapScript({ styles: ['/missing.css'], script: '/video.js' });
  const source = bootstrap.match(/^<script>([\s\S]*)<\/script>$/)[1];
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: 'outside-only', url: 'https://example.test/' });
  try {
    const diagnostics = [];
    dom.window.console.error = (...args) => diagnostics.push(args);
    dom.window.eval(source);
    await wait(0);
    const link = dom.window.document.querySelector('link[data-sil-video-style]');
    link.dispatchEvent(new dom.window.Event('error'));
    await wait(0);
    const player = dom.window.document.querySelector('[data-sil-video-player]');
    assert.equal(dom.window.document.querySelector('video').controls, true);
    assert.equal(player.dataset.silVideoError, 'true');
    assert.equal(player.querySelector('[data-sil-video-fallback-status]').hidden, false);
    assert.match(player.querySelector('[data-sil-video-status]').textContent, /原生控件/);
    assert.equal(dom.window.document.querySelectorAll('script[data-sil-video-core]').length, 0);
    assert.match(String(diagnostics[0]?.[1]?.url), /missing\.css/);
    await wait(550);
    assert.equal(dom.window.document.querySelectorAll('link[data-sil-video-style]').length, 1);
    const retry = dom.window.document.querySelector('link[data-sil-video-style]');
    retry.dispatchEvent(new dom.window.Event('load'));
    await wait(0);
    assert.equal(dom.window.document.querySelectorAll('script[data-sil-video-core]').length, 1);
    assert.equal(player.dataset.silVideoError, undefined);
    assert.equal(player.dataset.silVideoBootstrapError, undefined);
    assert.equal(player.querySelector('[data-sil-video-fallback-status]').hidden, true);
  } finally {
    dom.window.close();
  }
});

test('optional override failure does not block the required skin or player core', async () => {
  const bootstrap = renderBootstrapScript({
    styles: [
      { url: '/video.css', required: true },
      { url: '/override.css', required: false }
    ],
    script: '/video.js'
  });
  const source = bootstrap.match(/^<script>([\s\S]*)<\/script>$/)[1];
  const dom = new JSDOM('<!doctype html><body><aside data-sil-video-player></aside></body>', {
    runScripts: 'outside-only',
    url: 'https://example.test/'
  });
  try {
    dom.window.console.error = () => {};
    dom.window.eval(source);
    await wait(0);
    const styles = Array.from(dom.window.document.querySelectorAll('link[data-sil-video-style]'));
    styles.find(link => link.getAttribute('href') === '/override.css').dispatchEvent(new dom.window.Event('error'));
    styles.find(link => link.getAttribute('href') === '/video.css').dispatchEvent(new dom.window.Event('load'));
    await wait(0);
    assert.equal(dom.window.document.querySelector('script[data-sil-video-core]').getAttribute('src'), '/video.js');
    assert.equal(dom.window.document.querySelector('[data-sil-video-player]').dataset.silVideoError, undefined);
  } finally {
    dom.window.close();
  }
});
