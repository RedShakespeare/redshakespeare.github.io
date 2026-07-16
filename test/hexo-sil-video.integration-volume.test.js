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
