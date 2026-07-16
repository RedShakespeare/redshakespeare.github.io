'use strict';

const {
  assert,
  FULLSCREEN_UI_HIDE_DELAY,
  test,
  wait
} = require('./helpers/hexo-sil-video-fixture');
const { browserPlayer, touchPointer, touchTap } = require('./helpers/hexo-sil-video-browser-fixture');

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
