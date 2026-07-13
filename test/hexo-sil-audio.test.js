'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  PLAYER_SCRIPT,
  PLAYER_STYLE,
  mergeMusic,
  normaliseAudio,
  parseMusicTagArgs,
  registerAudioPlugin,
  renderAudioPlayer,
  toAudioConfig
} = require('../scripts/hexo-sil-audio');

const baseDir = path.resolve(__dirname, '..');
const runtime = { baseDir, root: '/', media: { sourceDir: 'source/files', publicPath: 'files' } };

function post(overrides = {}) {
  return { source: 'source/_posts/music.md', path: '2026/music/', title: 'Article Title', ...overrides };
}

function mockHexo() {
  const calls = { filters: [], injectors: [], tags: [] };
  return {
    base_dir: baseDir,
    config: { root: '/', audio: { media: { source_dir: 'source/files', public_path: '/files/' } } },
    extend: {
      filter: { register: (name, fn) => calls.filters.push({ name, fn }) },
      injector: { register: (position, value) => calls.injectors.push({ position, value }) },
      tag: { register: (name, fn, options) => calls.tags.push({ name, fn, options }) }
    },
    calls
  };
}

test('audio configuration has independent local media defaults', () => {
  assert.deepEqual(toAudioConfig({}).media, { sourceDir: 'source/files', publicPath: 'files' });
  assert.deepEqual(toAudioConfig({ audio: { media: { source_dir: 'source/audio', public_path: '/audio/' } } }).media, {
    sourceDir: 'source/audio', publicPath: 'audio'
  });
});

test('local music derives its player path and uses the requested title priority', async () => {
  const explicit = await normaliseAudio(post(), { file: 'podcast/Minecraft-08-Minecraft.mp3', title: 'Custom title' }, runtime);
  assert.equal(explicit.title, 'Custom title');
  assert.equal(explicit.type, 'audio/mpeg');
  assert.equal(explicit.duration, '04:14');
  assert.equal(explicit.playerAudio, '/files/podcast/Minecraft-08-Minecraft.mp3');

  const articleTitle = await normaliseAudio(post(), { file: 'podcast/Minecraft-08-Minecraft.mp3' }, runtime);
  assert.equal(articleTitle.title, 'Article Title');
  const embeddedTitle = await normaliseAudio(post({ title: '' }), { file: 'podcast/Minecraft-08-Minecraft.mp3' }, runtime);
  assert.equal(embeddedTitle.title, 'Minecraft');
});

test('HTTPS music can omit MIME type and waits for browser metadata duration', async () => {
  const audio = await normaliseAudio(post(), { audio: 'https://media.example.test/sound.ogg' }, runtime);
  assert.equal(audio.type, 'audio/ogg');
  assert.equal(audio.duration, '');
  assert.equal(audio.title, 'Article Title');
  assert.match(renderAudioPlayer(audio), /--:--/);
});

test('music validation rejects ambiguous sources and unsafe local paths', async () => {
  await assert.rejects(normaliseAudio(post(), { file: 'a.mp3', audio: 'https://example.com/a.mp3' }, runtime), /exactly one/);
  await assert.rejects(normaliseAudio(post(), { file: '../a.mp3' }, runtime), /must not contain empty, dot, or parent/);
  await assert.rejects(normaliseAudio(post(), { audio: 'http://example.com/a.mp3' }, runtime), /must use HTTPS/);
});

test('music tag arguments support quoted values and override the Front Matter source', () => {
  const values = parseMusicTagArgs(['file=music/one.mp3', 'title=A song title']);
  assert.deepEqual(values, { file: 'music/one.mp3', title: 'A song title' });
  assert.deepEqual(mergeMusic({ audio: 'https://example.com/old.mp3', title: 'Old' }, values), {
    file: 'music/one.mp3', title: 'A song title'
  });
  assert.throws(() => parseMusicTagArgs(['file=one.mp3', 'unknown=yes']), /does not support/);
});

test('audio player owns the former podcast colours, layout, and load-state behaviour', () => {
  assert.match(PLAYER_STYLE, /--sil-audio-surface:#fff/);
  assert.match(PLAYER_STYLE, /--sil-audio-surface:#000/);
  assert.match(PLAYER_STYLE, /--sil-audio-ink:#8064a2/);
  assert.match(PLAYER_STYLE, /--sil-audio-stack-gap:1rem/);
  assert.match(PLAYER_STYLE, /sil-audio-player__header \{ display:flex;flex-wrap:nowrap/);
  assert.match(PLAYER_STYLE, /sil-audio-player__footer \{ display:flex;flex-wrap:nowrap/);
  assert.match(PLAYER_STYLE, /@keyframes sil-audio-player-spin/);
  assert.doesNotMatch(PLAYER_STYLE, /podcast-player/);
  assert.match(PLAYER_SCRIPT, /silAudioLoading/);
  assert.match(PLAYER_SCRIPT, /音频加载失败，请尝试下载音频。/);
  assert.match(PLAYER_SCRIPT, /document\.addEventListener\('inside:theme'/);
});

test('music plugin injects shared assets once, renders tags inline, and avoids duplicate defaults', async () => {
  const hexo = mockHexo();
  registerAudioPlugin(hexo);
  assert.deepEqual(hexo.calls.injectors.map(call => call.position), ['head_end', 'body_end']);
  assert.equal(hexo.calls.tags[0].name, 'music');
  assert.equal(hexo.calls.tags[0].options.async, true);
  assert.equal(hexo.calls.filters[0].name, 'after_post_render');

  const defaultPost = post({ music: { file: 'podcast/Minecraft-08-Minecraft.mp3' }, content: '<p>Body</p>' });
  await hexo.calls.filters[0].fn(defaultPost);
  assert.match(defaultPost.content, /^<!-- hexo-sil-audio:start -->/);
  assert.match(defaultPost.content, /<p>Body<\/p>$/);

  const inlinePost = post({ music: { file: 'podcast/Minecraft-08-Minecraft.mp3' }, content: '<!-- hexo-sil-audio:start -->inline<!-- hexo-sil-audio:end -->' });
  await hexo.calls.filters[0].fn(inlinePost);
  assert.equal((inlinePost.content.match(/hexo-sil-audio:start/g) || []).length, 1);

  const inlineHtml = await hexo.calls.tags[0].fn.call(post({ music: { file: 'podcast/Minecraft-08-Minecraft.mp3' } }), ['title="Placed track"']);
  assert.match(inlineHtml, /Placed track/);
  assert.match(inlineHtml, /Minecraft-08-Minecraft\.mp3/);
});
