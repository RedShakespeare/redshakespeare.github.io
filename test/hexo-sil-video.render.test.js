'use strict';

const {
  assert,
  BUILTIN_SKINS,
  createStateCoordinator,
  fs,
  FULLSCREEN_UI_HIDE_DELAY,
  mergeVideo,
  normaliseVideo,
  parseVideoTagArgs,
  PLAYER_START,
  post,
  renderVideoPlayer,
  runtime,
  test,
  VOLUME_CLOSE_DELAY,
  videoData,
  volumeLevel
} = require('./helpers/hexo-sil-video-fixture');

test('rendered player exposes native fallback, custom controls, downloads, and runtime model', async () => {
  const html = renderVideoPlayer(await normaliseVideo(post(), videoData(), runtime));
  assert.match(html, new RegExp(PLAYER_START));
  assert.match(html, /<video[^>]+controls[^>]+preload="metadata"/);
  assert.match(html, /data-sil-video-action="rate"[^>]*>1×/);
  assert.doesNotMatch(html, /data-sil-video-action="repeat"/);
  assert.match(html, /data-sil-video-action="fullscreen"/);
  assert.match(html, /data-sil-video-stage tabindex="-1"/);
  assert.match(html, /data-sil-video-media-layer/);
  assert.match(html, /data-sil-video-feedback/);
  assert.match(html, /data-sil-video-feedback-text/);
  assert.match(html, /data-sil-video-loading/);
  assert.match(html, /正在加载\.\.\./);
  assert.match(html, /data-sil-video-controls[^>]*hidden/);
  assert.match(html, /aria-valuetext="0:00\/--:--"/);
  assert.match(html, /aria-valuetext="100%"/);
  assert.match(html, /sil-video-player__icon--feedback-brightness/);
  assert.match(html, /sil-video-player__icon--feedback-play/);
  assert.match(html, /sil-video-player__icon--feedback-pause/);
  assert.doesNotMatch(html, /sil-video-player__icon--once/);
  assert.doesNotMatch(html, /sil-video-player__icon--repeat/);
  assert.match(html, /sil-video-player__icon--reload/);
  assert.match(html, /sil-video-player__icon--volume-low/);
  assert.match(html, /sil-video-player__icon--volume-medium/);
  assert.match(html, /sil-video-player__icon--volume-high/);
  assert.match(html, /orient="vertical"/);
  assert.match(html, /下载简体中文字幕/);
  assert.match(html, /data-sil-video-model="[A-Za-z0-9+/=]+"/);
  assert.doesNotMatch(html, /<script class="sil-video-player__model"/);
  assert.doesNotMatch(html, /<track/);
  assert.doesNotMatch(html, /playsinline/i);
});
test('tag arguments position the default player and source overrides drop its subtitles', () => {
  assert.deepEqual(parseVideoTagArgs(['file=video/other.mp4', 'title=Other', 'download=false']), { file: 'video/other.mp4', title: 'Other', download: 'false' });
  assert.deepEqual(mergeVideo(videoData(), { url: 'https://example.test/other.mp4' }), {
    url: 'https://example.test/other.mp4',
    poster: 'video/poster.webp'
  });
  assert.throws(() => parseVideoTagArgs(['subtitle=bad.ass']), /does not support/);
});

test('disabled video downloads omit only the video toolbar link', async () => {
  const html = renderVideoPlayer(await normaliseVideo(post(), videoData({ download: false }), runtime));
  assert.doesNotMatch(html, /aria-label="下载视频"/);
  assert.match(html, /下载简体中文字幕/);
});

test('volume levels expose muted and one-to-three-wave thresholds', () => {
  assert.equal(VOLUME_CLOSE_DELAY, 800);
  assert.equal(FULLSCREEN_UI_HIDE_DELAY, 2500);
  assert.equal(volumeLevel(0, false), 'muted');
  assert.equal(volumeLevel(0.2, false), 'low');
  assert.equal(volumeLevel(1 / 3, false), 'low');
  assert.equal(volumeLevel(0.5, false), 'medium');
  assert.equal(volumeLevel(2 / 3, false), 'medium');
  assert.equal(volumeLevel(0.9, false), 'high');
  assert.equal(volumeLevel(1, true), 'muted');
});

test('status coordinator preserves channel errors and restores lower-priority state', () => {
  const player = { dataset: {} };
  const status = { textContent: '' };
  const state = createStateCoordinator({ player, status });
  state.set('media', '媒体信息');
  state.set('subtitles', '字幕加载中', { level: 'loading' });
  assert.equal(status.textContent, '字幕加载中');
  state.set('fullscreen', '无法进入全屏。', { error: true });
  state.set('media', '新媒体信息');
  assert.equal(status.textContent, '无法进入全屏。');
  assert.equal(player.dataset.silVideoError, 'true');
  state.clear('fullscreen');
  assert.equal(status.textContent, '字幕加载中');
  assert.equal(player.dataset.silVideoError, undefined);
  state.clear('subtitles');
  assert.equal(status.textContent, '新媒体信息');
  assert.throws(() => state.set('unknown', '无效'), /未知视频状态频道/);
  assert.throws(() => state.clear('unknown'), /未知视频状态频道/);
});

test('Ephesus skin and runtime retain the specified palette and interaction contract', async () => {
  const css = await fs.readFile(BUILTIN_SKINS.ephesus.sourcePath, 'utf8');
  assert.match(css, /--sil-video-surface:#fff/);
  assert.match(css, /--sil-video-ink:#8064a2/);
  assert.match(css, /--sil-video-buffered:rgba\(128,100,162,\.24\)/);
  assert.match(css, /--sil-video-buffered:color-mix\(in srgb,var\(--sil-video-ink\) 24%,transparent\)/);
  assert.match(css, /--sil-video-surface:#000/);
  assert.match(css, /--sil-video-ink:#673ab7/);
  assert.match(css, /--sil-video-buffered:rgba\(103,58,183,\.34\)/);
  assert.match(css, /--sil-video-buffered:color-mix\(in srgb,var\(--sil-video-ink\) 34%,transparent\)/);
  assert.match(css, /sil-video-player__volume-popover/);
  assert.match(css, /border-left-width:3px/);
  assert.match(css, /sil-video-player__video:focus-visible \{ outline:1px solid/);
  assert.match(css, /sil-video-player__volume \{[^}]*writing-mode:vertical-lr/);
  assert.doesNotMatch(css, /volume-control:focus-within/);
  assert.match(css, /sil-video-player__stage:fullscreen/);
  assert.match(css, /sil-video-player__stage:fullscreen \{[^}]*--sil-video-buffered:rgba\(103,58,183,\.42\)/);
  assert.match(css, /sil-video-player__stage:fullscreen \{[^}]*--sil-video-buffered:color-mix\(in srgb,var\(--sil-video-ink\) 42%,transparent\)/);
  assert.match(css, /sil-video-player__feedback \{[^}]*color:var\(--sil-video-ink\)/);
  assert.match(css, /data-sil-video-feedback-visible/);
  assert.match(css, /sil-video-player__media-layer \{[^}]*filter:brightness/);
  assert.match(css, /data-sil-video-feedback-kind="brightness"/);
  assert.match(css, /data-sil-video-feedback-kind="playback-play"[^}]*border-radius:50%/);
  assert.match(css, /data-sil-video-feedback-kind="playback-pause"[^}]*background:rgba\(0,0,0,\.58\)/);
  assert.match(css, /@media \(pointer:coarse\) \{[\s\S]*touch-action:none/);
  assert.match(css, /data-sil-video-fullscreen="true"[^}]*sil-video-player__subtitle-control/);
  assert.doesNotMatch(css, /@media screen and \(max-width:430px\) \{\s*\.sil-video-player__toolbar/);
  assert.match(css, /data-sil-video-ui-hidden/);
  assert.match(css, /data-sil-video-controls\]\[hidden\] \{ display:none \}/);
  assert.match(css, /--sil-video-range-buffered,var\(--sil-video-rail\)/);
  assert.doesNotMatch(css, /sil-video-player:fullscreen/);
});
