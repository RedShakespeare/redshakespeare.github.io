'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  BUILTIN_SKINS,
  PLAYER_SCRIPT,
  mergeMusic,
  normaliseAudio,
  parseMusicTagArgs,
  registerAudioPlugin,
  renderAudioPlayer,
  toAudioConfig
} = require('hexo-sil-audio');
const { createAssetCapability } = require('hexo-sil-assets');

const baseDir = path.resolve(__dirname, '..');
const runtime = {
  baseDir,
  root: '/',
  assetsEnabled: true,
  assetCapability: createAssetCapability({ baseDir }),
  media: { prefix: 'files', sourceDir: 'files', url: '' }
};

function post(overrides = {}) {
  return { source: 'source/_posts/music.md', path: '2026/music/', title: 'Article Title', ...overrides };
}

function mockHexo({ root = '/', audio = {} } = {}) {
  const calls = { filters: [], generators: [], injectors: [], tags: [], logs: [] };
  return {
    base_dir: baseDir,
    source_dir: path.join(baseDir, 'source'),
    sil: { assets: createAssetCapability({ baseDir }) },
    log: { warn: message => calls.logs.push(message) },
    config: { root, audio: { assets: { enabled: true }, media: { prefix: 'files' }, ...audio } },
    extend: {
      filter: { register: (name, fn) => calls.filters.push({ name, fn }) },
      generator: { register: (name, fn) => calls.generators.push({ name, fn }) },
      injector: { register: (position, value) => calls.injectors.push({ position, value }) },
      tag: { register: (name, fn, options) => calls.tags.push({ name, fn, options }) }
    },
    calls
  };
}

test('audio configuration uses one prefix and optional legacy or external overrides', () => {
  assert.deepEqual(toAudioConfig({}).assets, { enabled: false });
  assert.deepEqual(toAudioConfig({}).media, { prefix: 'files', sourceDir: 'files', url: '' });
  assert.deepEqual(toAudioConfig({}).skin, { builtin: 'ephesus', override: '' });
  assert.deepEqual(toAudioConfig({ audio: { assets: { enabled: true }, media: { prefix: 'audio', source_dir: 'legacy/audio', url: 'https://media.example.test/audio' } } }).media, {
    prefix: 'audio', sourceDir: 'legacy/audio', url: 'https://media.example.test/audio/'
  });
  assert.deepEqual(toAudioConfig({ audio: { skin: { builtin: false, override: '/css/player.css' } } }).skin, {
    builtin: false, override: '/css/player.css'
  });
  assert.throws(() => toAudioConfig({ audio: { skin: { builtin: 'inside' } } }), /skin\.builtin/);
  assert.throws(() => toAudioConfig({ audio: { skin: { override: 'css/player.css' } } }), /root-relative CSS path/);
  assert.throws(() => toAudioConfig({ audio: { media: { object_prefix: 'files' } } }), /media\.prefix/);
  assert.throws(() => toAudioConfig({ audio: { media: { url: 'https://example.test/files?token=secret' } } }), /query string/);
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

test('media.url replaces the local player and download location', async () => {
  const external = await normaliseAudio(post(), { file: 'podcast/Minecraft-08-Minecraft.mp3' }, {
    ...runtime,
    media: { ...runtime.media, url: 'https://media.example.test/assets/' }
  });
  assert.equal(external.playerAudio, 'https://media.example.test/assets/podcast/Minecraft-08-Minecraft.mp3');
});

test('enabled integration safely falls back to legacy local files when the capability is absent', async () => {
  let warnings = 0;
  const legacy = await normaliseAudio(post(), { file: 'podcast/Minecraft-08-Minecraft.mp3' }, {
    ...runtime,
    assetCapability: null,
    onMissingAssets: () => { warnings += 1; }
  });
  assert.equal(legacy.length, 4117599);
  assert.equal(legacy.duration, '04:14');
  assert.equal(legacy.playerAudio, '/files/podcast/Minecraft-08-Minecraft.mp3');
  assert.equal(warnings, 1);
});

test('an installed but broken manifest capability fails instead of falling back', async () => {
  await assert.rejects(normaliseAudio(post(), { file: 'podcast/Minecraft-08-Minecraft.mp3' }, {
    ...runtime,
    assetCapability: { getObject: () => { throw new Error('Asset manifest error: broken manifest.'); } }
  }), /broken manifest/);
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

test('Ephesus skin owns the player appearance while the core retains interaction state', async () => {
  const css = await fs.readFile(BUILTIN_SKINS.ephesus.sourcePath, 'utf8');
  assert.equal(BUILTIN_SKINS.ephesus.outputPath, 'css/hexo-sil-audio.css');
  assert.match(css, /--sil-audio-surface:#fff/);
  assert.match(css, /--sil-audio-surface:#000/);
  assert.match(css, /--sil-audio-ink:#8064a2/);
  assert.match(css, /--sil-audio-stack-gap:1rem/);
  assert.match(css, /--sil-audio-coordinate-inset-left:calc\(var\(--sil-audio-stack-gap\) \+ var\(--sil-audio-accent-border-width\)\)/);
  assert.match(css, /--sil-audio-coordinate-inset-right:calc\(var\(--sil-audio-stack-gap\) \+ var\(--sil-audio-border-width\)\)/);
  assert.match(css, /sil-audio-player__header \{ display:flex;flex-wrap:nowrap/);
  assert.match(css, /sil-audio-player__controls \{ display:none;min-height:2\.25rem;grid-template-columns:minmax\(0,1fr\) minmax\(0,8fr\) minmax\(0,1fr\);align-items:center;margin:var\(--sil-audio-stack-gap\) calc\(0px - var\(--sil-audio-coordinate-inset-right\)\) 0 calc\(0px - var\(--sil-audio-coordinate-inset-left\)\)/);
  assert.match(css, /sil-audio-player__footer \{ display:grid;min-height:2\.25rem;grid-template-columns:repeat\(5,minmax\(0,1fr\)\);align-items:center;margin:0 calc\(0px - var\(--sil-audio-coordinate-inset-right\)\) 0 calc\(0px - var\(--sil-audio-coordinate-inset-left\)\);padding:var\(--sil-audio-stack-gap\) 0 0/);
  assert.match(css, /sil-audio-player__progress \{ grid-column:2;width:100%;min-width:0/);
  assert.match(css, /sil-audio-player__range \{ box-sizing:border-box;width:100%;height:1\.75rem;margin:0;border:0;padding:0/);
  assert.match(css, /sil-audio-player__current \{ grid-column:1;justify-self:center;text-align:center/);
  assert.match(css, /sil-audio-player__duration \{ grid-column:5;justify-self:center;text-align:center/);
  assert.match(css, /@keyframes sil-audio-player-title-scroll/);
  assert.match(css, /@keyframes sil-audio-player-spin/);
  assert.doesNotMatch(css, /podcast-player/);
  assert.match(PLAYER_SCRIPT, /silAudioLoading/);
  assert.match(PLAYER_SCRIPT, /音频加载失败，请尝试下载音频。/);
  assert.match(PLAYER_SCRIPT, /silAudioTitleOverflow/);
  assert.doesNotMatch(PLAYER_SCRIPT, /sil-audio-player__volume/);
  assert.doesNotMatch(PLAYER_SCRIPT, /--inside-/);
  assert.match(PLAYER_SCRIPT, /document\.addEventListener\('inside:theme'/);
  assert.match(PLAYER_SCRIPT, /const playerRefreshers = new WeakMap\(\);/);
  assert.match(PLAYER_SCRIPT, /window\.addEventListener\('resize',scheduleRefresh\)/);
  assert.doesNotMatch(PLAYER_SCRIPT, /window\.addEventListener\('resize',syncTitle\)/);
  assert.equal((PLAYER_SCRIPT.match(/window\.addEventListener\('resize'/g) || []).length, 1);
  assert.match(PLAYER_SCRIPT, /function observeMutations\(records\)/);
  assert.match(PLAYER_SCRIPT, /node\.matches\(selector\)\|\|node\.querySelector\(selector\)/);
  assert.match(PLAYER_SCRIPT, /new MutationObserver\(observeMutations\)/);
});

test('audio player has symmetric progress controls and a three-button footer', () => {
  const player = renderAudioPlayer({ playerAudio: '/files/music/example.mp3', type: 'audio/mpeg', duration: '03:21', title: 'A very long audio title' });
  assert.match(player, /sil-audio-player__meta-text">A very long audio title/);
  assert.match(player, /sil-audio-player__controls[\s\S]*sil-audio-player__progress[\s\S]*sil-audio-player__footer/);
  assert.match(player, /sil-audio-player__footer[\s\S]*sil-audio-player__current[\s\S]*sil-audio-player__volume-button[\s\S]*sil-audio-player__play-button[\s\S]*sil-audio-player__download[\s\S]*sil-audio-player__duration/);
  assert.match(player, /sil-audio-player__download[\s\S]*aria-label="下载音频"/);
  assert.doesNotMatch(player, /sil-audio-player__volume" type="range"/);
});

test('music plugin injects shared assets once, renders tags inline, and avoids duplicate defaults', async () => {
  const hexo = mockHexo();
  registerAudioPlugin(hexo);
  assert.deepEqual(hexo.calls.injectors.map(call => call.position), ['head_end', 'body_end']);
  assert.equal(hexo.calls.generators[0].name, 'hexo-sil-audio-skin');
  assert.match(hexo.calls.injectors[0].value, /href="\/css\/hexo-sil-audio\.css"/);
  const skinRoute = await hexo.calls.generators[0].fn();
  assert.equal(skinRoute.path, 'css/hexo-sil-audio.css');
  assert.match(skinRoute.data.toString(), /sil-audio-player__footer/);
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

test('custom skin overrides load after Ephesus and can replace it entirely', () => {
  const layered = mockHexo({ root: '/blog/', audio: { skin: { builtin: 'ephesus', override: '/css/audio-local.css' } } });
  registerAudioPlugin(layered);
  assert.deepEqual(layered.calls.injectors.map(call => call.position), ['head_end', 'head_end', 'body_end']);
  assert.match(layered.calls.injectors[0].value, /href="\/blog\/css\/hexo-sil-audio\.css"/);
  assert.match(layered.calls.injectors[1].value, /href="\/blog\/css\/audio-local\.css"/);
  assert.equal(layered.calls.generators.length, 1);

  const replacement = mockHexo({ audio: { skin: { builtin: false, override: '/css/my-audio-skin.css' } } });
  registerAudioPlugin(replacement);
  assert.deepEqual(replacement.calls.injectors.map(call => call.position), ['head_end', 'body_end']);
  assert.match(replacement.calls.injectors[0].value, /href="\/css\/my-audio-skin\.css"/);
  assert.equal(replacement.calls.generators.length, 0);
});
