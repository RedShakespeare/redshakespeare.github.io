'use strict';

const {
  assert,
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
  videoData,
  wait
} = require('./helpers/hexo-sil-video-fixture');
const { browserPlayer, touchPointer, touchTap } = require('./helpers/hexo-sil-video-browser-fixture');

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
