'use strict';

const { test, expect } = require('@playwright/test');

const CORE_PATH = '/js/hexo-sil-video.js';
const STYLE_PATH = '/css/hexo-sil-video.css';
const SUBTITLE_PATHS = [
  '/js/hexo-sil-video-subtitles.js',
  '/js/hexo-sil-video-worker.js',
  '/wasm/hexo-sil-video.wasm',
  '/wasm/hexo-sil-video-modern.wasm',
  '/fonts/hexo-sil-video-default.woff2',
  '/test/default.ass'
];

function observeRequests(page) {
  const paths = [];
  page.on('request', request => paths.push(new URL(request.url()).pathname));
  return paths;
}

function count(paths, pathname) {
  return paths.filter(value => value === pathname).length;
}

async function waitEnhanced(page, count = 1) {
  await expect(page.locator('[data-sil-video-player][data-sil-video-enhanced="true"]')).toHaveCount(count);
}

async function dispatchTouch(locator, type, x, y, pointerId = 1) {
  await locator.evaluate((element, event) => {
    element.dispatchEvent(new PointerEvent(event.type, {
      bubbles: true,
      cancelable: true,
      clientX: event.x,
      clientY: event.y,
      pointerId: event.pointerId,
      pointerType: 'touch',
      isPrimary: true
    }));
  }, { type, x, y, pointerId });
}

test('plain pages request no video skin, core, or subtitle resources', async ({ page }) => {
  const requests = observeRequests(page);
  await page.goto('/plain');
  await page.waitForTimeout(200);
  expect(requests).not.toContain(STYLE_PATH);
  expect(requests).not.toContain(CORE_PATH);
  for (const pathname of SUBTITLE_PATHS) expect(requests).not.toContain(pathname);
});

test('initial and Inside-style inserted players load the skin and core once', async ({ page }) => {
  const initialRequests = observeRequests(page);
  await page.goto('/video-no-subtitles');
  await waitEnhanced(page);
  expect(count(initialRequests, STYLE_PATH)).toBe(1);
  expect(count(initialRequests, CORE_PATH)).toBe(1);
  expect(initialRequests.indexOf(STYLE_PATH)).toBeLessThan(initialRequests.indexOf(CORE_PATH));

  const dynamicRequests = observeRequests(page);
  await page.goto('/dynamic');
  await page.waitForTimeout(100);
  expect(dynamicRequests).not.toContain(STYLE_PATH);
  expect(dynamicRequests).not.toContain(CORE_PATH);
  await page.evaluate(() => window.insertVideo());
  await waitEnhanced(page);
  await page.evaluate(() => window.insertVideo());
  await waitEnhanced(page, 2);
  expect(count(dynamicRequests, STYLE_PATH)).toBe(1);
  expect(count(dynamicRequests, CORE_PATH)).toBe(1);
  expect(dynamicRequests.indexOf(STYLE_PATH)).toBeLessThan(dynamicRequests.indexOf(CORE_PATH));
});

test('players without subtitles never initialise subtitle resources or menu semantics', async ({ page }) => {
  const requests = observeRequests(page);
  await page.goto('/video-no-subtitles');
  await waitEnhanced(page);
  const player = page.locator('[data-sil-video-player]');
  const button = page.locator('[data-sil-video-action="subtitles"]');
  await expect(button).toBeDisabled();
  await expect(button).not.toHaveAttribute('aria-haspopup', /.+/);
  await expect(button).not.toHaveAttribute('aria-controls', /.+/);
  await expect(button).not.toHaveAttribute('aria-expanded', /.+/);
  await player.focus();
  await page.locator('[data-sil-video-action="play"]').click();
  await page.waitForTimeout(200);
  for (const pathname of SUBTITLE_PATHS) expect(requests).not.toContain(pathname);
});

test('default subtitles remain pending until interaction and Chromium starts Worker/WASM lazily', async ({ page, browserName }) => {
  const requests = observeRequests(page);
  await page.goto('/video-subtitles');
  await waitEnhanced(page);
  for (const pathname of SUBTITLE_PATHS) expect(requests).not.toContain(pathname);

  await page.locator('[data-sil-video-player]').focus();
  await expect.poll(() => requests.includes('/js/hexo-sil-video-subtitles.js')).toBe(true);
  await expect.poll(() => requests.includes('/test/default.ass')).toBe(true);

  const player = page.locator('[data-sil-video-player]');
  await expect(player).toHaveAttribute('data-sil-video-enhanced', 'true');
  await expect(page.locator('video')).not.toHaveAttribute('controls', /.+/);
  if (browserName === 'chromium') {
    await expect.poll(() => requests.includes('/js/hexo-sil-video-worker.js')).toBe(true);
    await expect.poll(() => requests.some(pathname => pathname === '/wasm/hexo-sil-video.wasm' || pathname === '/wasm/hexo-sil-video-modern.wasm')).toBe(true);
  } else {
    const capable = await page.evaluate(() => typeof Worker !== 'undefined'
      && typeof WebAssembly !== 'undefined'
      && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function');
    await expect.poll(async () => {
      const pressed = await page.locator('[data-sil-video-action="subtitles"]').getAttribute('aria-pressed');
      const status = await page.locator('[data-sil-video-status]').textContent();
      return capable ? pressed === 'true' : status === '当前浏览器不支持高级字幕渲染。';
    }).toBe(true);
  }
});

test('the first play event activates a pending default without blocking playback', async ({ page }) => {
  const requests = observeRequests(page);
  await page.goto('/video-subtitles');
  await waitEnhanced(page);
  for (const pathname of SUBTITLE_PATHS) expect(requests).not.toContain(pathname);
  await page.evaluate(() => document.querySelector('video').play());
  await expect.poll(() => page.evaluate(() => document.querySelector('video').paused)).toBe(false);
  await expect.poll(() => requests.includes('/js/hexo-sil-video-subtitles.js')).toBe(true);
});

test('subtitle relationships are unique while Tab, arrows, and Escape keep native focus behaviour', async ({ page }) => {
  await page.goto('/video-two-subtitles');
  await waitEnhanced(page, 2);
  const buttons = page.locator('[data-sil-video-action="subtitles"]');
  const first = buttons.nth(0);
  const second = buttons.nth(1);
  const firstMenu = await first.getAttribute('aria-controls');
  const secondMenu = await second.getAttribute('aria-controls');
  expect(firstMenu).toBeTruthy();
  expect(secondMenu).toBeTruthy();
  expect(firstMenu).not.toBe(secondMenu);
  await expect(first).toHaveAttribute('aria-haspopup', 'menu');

  await first.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(`#${firstMenu}`)).toBeVisible();
  await page.keyboard.press('Tab');
  const option = page.locator(`#${firstMenu} [data-sil-video-track="-1"]`);
  await expect(option).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(option).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator(`#${firstMenu}`)).toBeHidden();
  await expect(first).not.toBeFocused();
});

test('desktop shortcuts, wheel input, fullscreen focus, and HUD hiding retain their timing', async ({ page }) => {
  await page.goto('/video-no-subtitles');
  await waitEnhanced(page);
  const player = page.locator('[data-sil-video-player]');
  const stage = page.locator('[data-sil-video-stage]');
  const viewport = page.locator('[data-sil-video-viewport]');
  const feedback = page.locator('[data-sil-video-feedback]');
  const feedbackText = page.locator('[data-sil-video-feedback-text]');

  await expect(feedback).toHaveAttribute('role', 'status');
  await expect(feedback).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('[data-sil-video-progress]')).toHaveAttribute('aria-valuetext', '0:20/1:40');
  await expect(page.locator('[data-sil-video-volume]')).toHaveAttribute('aria-valuetext', '80%');

  await player.focus();
  await page.keyboard.press('ArrowUp');
  await expect(feedbackText).toHaveText('85%');
  await viewport.hover();
  await page.mouse.wheel(0, -100);
  await expect(feedbackText).toHaveText('90%');

  await page.locator('[data-sil-video-action="fullscreen"]').click();
  await expect(stage).toBeFocused();
  await page.evaluate(() => document.querySelector('video').play());
  await expect(stage).toHaveAttribute('data-sil-video-ui-hidden', 'true', { timeout: 3500 });
  await stage.dispatchEvent('pointermove', { pointerType: 'mouse' });
  await expect(stage).not.toHaveAttribute('data-sil-video-ui-hidden', /.+/);
  await page.evaluate(() => document.exitFullscreen());
  await expect(player).toBeFocused();
});

test('touch previews, brightness updates, and double taps preserve every HUD update', async ({ page }) => {
  await page.goto('/video-no-subtitles');
  await waitEnhanced(page);
  const viewport = page.locator('[data-sil-video-viewport]');
  const feedbackText = page.locator('[data-sil-video-feedback-text]');
  const box = await viewport.boundingBox();
  expect(box).toBeTruthy();
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  await dispatchTouch(viewport, 'pointerdown', centerX, centerY, 1);
  await dispatchTouch(viewport, 'pointermove', centerX + box.width / 4, centerY, 1);
  await expect(feedbackText).toHaveText('0:35/1:40');
  await dispatchTouch(viewport, 'pointermove', centerX + box.width / 2, centerY, 1);
  await expect(feedbackText).toHaveText('0:50/1:40');
  await dispatchTouch(viewport, 'pointerup', centerX + box.width / 2, centerY, 1);
  await expect(feedbackText).toHaveText('0:50/1:40');

  await dispatchTouch(viewport, 'pointerdown', box.x + box.width / 4, centerY, 2);
  await dispatchTouch(viewport, 'pointermove', box.x + box.width / 4, centerY - box.height / 4, 2);
  await expect(feedbackText).toHaveText('150%');
  await dispatchTouch(viewport, 'pointermove', box.x + box.width / 4, box.y, 2);
  await expect(feedbackText).toHaveText('200%');
  await dispatchTouch(viewport, 'pointerup', box.x + box.width / 4, box.y, 2);
  await page.waitForTimeout(550);

  await viewport.evaluate((element, point) => {
    const tap = pointerId => {
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, pointerId, pointerType: 'touch', isPrimary: true }));
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, pointerId, pointerType: 'touch', isPrimary: true }));
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y }));
    };
    tap(3);
    tap(4);
  }, { x: box.x + box.width * 0.8, y: centerY });
  await expect(feedbackText).toHaveText('1:05/1:40');
});
