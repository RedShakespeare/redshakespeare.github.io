'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const skin = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'skins', 'ephesus.css'), 'utf8');

test('video skin keeps the runtime state projection selectors and theme tokens', () => {
  for (const selector of [
    '.sil-video-player[data-sil-video-theme="dark"]',
    '.sil-video-player[data-sil-video-enhanced="true"] .sil-video-player__toolbar',
    '.sil-video-player[data-sil-video-playing="true"]',
    '.sil-video-player[data-sil-video-ended="true"]',
    '.sil-video-player[data-sil-video-media-error="true"]',
    '.sil-video-player__loading',
    '.sil-video-player[data-sil-video-volume-level="muted"]',
    '.sil-video-player[data-sil-video-volume-open="true"]',
    '.sil-video-player__feedback[data-sil-video-feedback-visible="true"]',
    '.sil-video-player__stage:fullscreen[data-sil-video-ui-hidden="true"]'
  ]) assert.match(skin, new RegExp(selector.replace(/[.[\]"=]/g, '\\$&')));
  for (const token of ['--sil-video-surface', '--sil-video-ink', '--sil-video-buffered', '--sil-video-border', '--sil-video-focus']) {
    assert.match(skin, new RegExp(`${token}:[^;]+;`));
  }
});

test('video skin keeps native fallback and reduced-motion contracts', () => {
  assert.match(skin, /\.sil-video-player \[data-sil-video-controls\]\[hidden\] \{ display:none \}/);
  assert.match(skin, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(skin, /@media \(pointer:coarse\)/);
  assert.match(skin, /touch-action:none/);
});
