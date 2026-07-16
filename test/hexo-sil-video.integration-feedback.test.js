'use strict';

const { assert, test, wait } = require('./helpers/hexo-sil-video-fixture');
const { browserPlayer } = require('./helpers/hexo-sil-video-browser-fixture');

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
