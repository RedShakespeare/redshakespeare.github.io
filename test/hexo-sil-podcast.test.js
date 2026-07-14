'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildFeed,
  normaliseEpisode,
  registerPlugin,
  renderPlayer,
  toPodcastConfig
} = require('hexo-sil-podcast');
const { createAssetCapability } = require('hexo-sil-assets');

const siteUrl = 'https://www.ephesus.top/';
const baseDir = path.resolve(__dirname, '..');

function config(overrides = {}) {
  const mediaOverrides = overrides.media || {};
  const rest = { ...overrides };
  delete rest.media;
  return toPodcastConfig({
    url: siteUrl,
    title: 'Ephesus',
    description: 'Roguelike Temple',
    author: 'Silencess',
    podcast: {
      dry_run: false,
      path: 'podcast.xml',
      title: 'Ephesus',
      description: 'Roguelike Temple',
      author: 'Silencess',
      email: 'silencess.m@gmail.com',
      language: 'zh-CN',
      link: '/',
      image: 'https://cdn.example.test/podcast-cover.jpg',
      category: { text: 'Leisure', subcategory: 'Games' },
      explicit: false,
      limit: 0,
      assets: { enabled: true },
      media: {
        prefix: 'files',
        ...mediaOverrides
      },
      ...rest
    }
  });
}

function runtime(overrides = {}) {
  return {
    baseDir,
    root: '/',
    assetsEnabled: true,
    assetCapability: createAssetCapability({ baseDir }),
    media: config().media,
    ...overrides
  };
}

function post(overrides = {}) {
  return {
    source: 'source/_posts/episode-one.md',
    path: '2026/episode-one/',
    permalink: 'https://www.ephesus.top/2026/episode-one/',
    title: 'Episode & One',
    date: new Date('2026-07-10T12:00:00Z'),
    content: '<p>Show notes &amp; details</p>',
    podcast: {
      audio: 'https://dl.ephesus.top/files/podcast/episode-001.mp3',
      type: 'audio/mpeg',
      length: 12345678,
      duration: '00:42:10',
      episode: 1,
      season: 1,
      summary: 'Summary & details'
    },
    ...overrides
  };
}

function localPost(overrides = {}) {
  return post({
    podcast: {
      file: 'podcast/Minecraft-08-Minecraft.mp3',
      episode: 1,
      season: 1,
      summary: 'Local test episode'
    },
    ...overrides
  });
}

function mockHexo(dryRun) {
  const calls = { filters: [], generators: [], injectors: [], logs: [] };
  return {
    base_dir: baseDir,
    source_dir: path.join(baseDir, 'source'),
    sil: { assets: createAssetCapability({ baseDir }) },
    config: {
      url: siteUrl,
      root: '/',
      title: 'Ephesus',
      description: 'Roguelike Temple',
      author: 'Silencess',
      podcast: {
        dry_run: dryRun,
        assets: { enabled: true },
        email: 'silencess.m@gmail.com',
        image: 'https://cdn.example.test/podcast-cover.jpg',
        category: { text: 'Leisure', subcategory: 'Games' }
      }
    },
    log: {
      info: message => calls.logs.push(message),
      warn: message => calls.logs.push(message)
    },
    extend: {
      filter: { register: (name, fn) => calls.filters.push({ name, fn }) },
      generator: { register: (name, fn) => calls.generators.push({ name, fn }) },
      injector: { register: (position, value) => calls.injectors.push({ position, value }) }
    },
    calls
  };
}

test('buildFeed writes one stable, escaped legacy podcast item', async () => {
  const feed = await buildFeed([post()], config(), siteUrl, new Date('2026-07-13T00:00:00Z'));

  assert.match(feed, /<rss version="2\.0"/);
  assert.match(feed, /<title>Episode &amp; One<\/title>/);
  assert.match(feed, /<content:encoded><!\[CDATA\[<p>Show notes &amp; details<\/p>\]\]><\/content:encoded>/);
  assert.match(feed, /<enclosure url="https:\/\/dl\.ephesus\.top\/files\/podcast\/episode-001\.mp3" length="12345678" type="audio\/mpeg"\/>/);
  assert.match(feed, /<guid isPermaLink="false">https:\/\/dl\.ephesus\.top\/files\/podcast\/episode-001\.mp3<\/guid>/);
  assert.match(feed, /<itunes:explicit>false<\/itunes:explicit>/);
  assert.match(feed, /<lastBuildDate>Fri, 10 Jul 2026 12:00:00 \+0000<\/lastBuildDate>/);
  assert.doesNotMatch(feed, /2026-07-13/);
});

test('legacy episode validation rejects a non-HTTPS audio URL', async () => {
  const invalid = post({ podcast: { ...post().podcast, audio: 'http://example.com/episode.mp3' } });
  await assert.rejects(normaliseEpisode(invalid, siteUrl, false), /must use HTTPS/);
});

test('buildFeed rejects an invalid public contact address', async () => {
  await assert.rejects(buildFeed([post()], config({ email: 'not-an-email' }), siteUrl), /valid public contact address/);
});

test('buildFeed rejects unsupported Apple categories and empty published catalogues', async () => {
  await assert.rejects(buildFeed([post()], config({ category: { text: 'Leisure', subcategory: 'Computer Games' } }), siteUrl), /category\.subcategory/);
  await assert.rejects(buildFeed([], config(), siteUrl), /at least one published episode/);
});

test('buildFeed rejects duplicated audio URLs and GUIDs', async () => {
  const first = post();
  const second = post({
    source: 'source/_posts/episode-two.md',
    path: '2026/episode-two/',
    title: 'Episode Two',
    podcast: { ...first.podcast, episode: 2 }
  });
  await assert.rejects(buildFeed([first, second], config(), siteUrl), /duplicate podcast\.audio URL/);
});

test('ordinary article music cannot create an empty published podcast feed', async () => {
  const musicArticle = post({
    source: 'source/_posts/music.md',
    title: 'Music Article',
    podcast: false,
    music: { file: 'podcast/Minecraft-08-Minecraft.mp3' }
  });
  await assert.rejects(buildFeed([musicArticle], config(), siteUrl, new Date('2026-07-13T00:00:00Z')), /at least one published episode/);
});

test('local file mode derives metadata and resolves RSS URLs from the site', async () => {
  const episode = await normaliseEpisode(localPost(), siteUrl, false, runtime());

  assert.equal(episode.type, 'audio/mpeg');
  assert.equal(episode.length, 4117599);
  assert.equal(episode.duration, '04:14');
  assert.equal(episode.audio, 'https://www.ephesus.top/files/podcast/Minecraft-08-Minecraft.mp3');
  assert.equal(episode.playerAudio, '/files/podcast/Minecraft-08-Minecraft.mp3');
  assert.match(renderPlayer(episode), /src="\/files\/podcast\/Minecraft-08-Minecraft\.mp3"/);

  const feed = await buildFeed([localPost()], config(), siteUrl, new Date('2026-07-13T00:00:00Z'), runtime());
  assert.match(feed, /enclosure url="https:\/\/www\.ephesus\.top\/files\/podcast\/Minecraft-08-Minecraft\.mp3" length="4117599" type="audio\/mpeg"/);
});

test('podcast prefix inherits audio and media.url replaces player and RSS locations', async () => {
  const inherited = toPodcastConfig({ audio: { media: { prefix: 'media' } }, podcast: {} });
  assert.equal(inherited.media.prefix, 'media');
  assert.equal(inherited.media.sourceDir, 'media');
  const externalConfig = config({ media: { url: 'https://media.example.test/podcast/' } });
  const episode = await normaliseEpisode(localPost(), siteUrl, false, {
    ...runtime(),
    media: externalConfig.media
  });
  assert.equal(episode.playerAudio, 'https://media.example.test/podcast/podcast/Minecraft-08-Minecraft.mp3');
  assert.equal(episode.audio, episode.playerAudio);
});

test('podcast file mode also falls back to legacy local audio without the asset capability', async () => {
  let warnings = 0;
  const episode = await normaliseEpisode(localPost(), siteUrl, false, {
    ...runtime(),
    assetCapability: null,
    onMissingAssets: () => { warnings += 1; }
  });
  assert.equal(episode.length, 4117599);
  assert.equal(episode.audio, 'https://www.ephesus.top/files/podcast/Minecraft-08-Minecraft.mp3');
  assert.equal(warnings, 1);
});

test('removed media fields fail with their prefix replacement', () => {
  assert.throws(() => config({ media: { object_prefix: 'files' } }), /media\.prefix/);
  assert.throws(() => config({ media: { public_path: 'files' } }), /media\.prefix/);
});

test('publication mode rejects the temporary favicon and accepts a local compliant cover', async () => {
  await assert.rejects(buildFeed([post()], config({ image: 'favicon.png' }), siteUrl, new Date('2026-07-13T00:00:00Z'), runtime()), /1400-3000px/);

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hexo-sil-podcast-cover-'));
  const sourceDir = path.join(temp, 'source');
  const jpeg = (width, height) => Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00]);
  const png = (width, height, colorType) => Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]), Buffer.from('IHDR'),
    Buffer.from([width >> 24, width >> 16, width >> 8, width, height >> 24, height >> 16, height >> 8, height, 0x08, colorType, 0x00, 0x00, 0x00]),
    Buffer.alloc(4), Buffer.alloc(4), Buffer.from('IEND'), Buffer.alloc(4)
  ]);
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'podcast-cover.jpg'), jpeg(1400, 1400));
  await fs.writeFile(path.join(sourceDir, 'wide.jpg'), jpeg(1500, 1400));
  await fs.writeFile(path.join(sourceDir, 'transparent.png'), png(1400, 1400, 6));
  try {
    const feed = await buildFeed([post()], config({ image: 'podcast-cover.jpg' }), siteUrl, new Date('2026-07-13T00:00:00Z'), runtime({ baseDir: temp, sourceDir: 'source' }));
    assert.match(feed, /https:\/\/www\.ephesus\.top\/podcast-cover\.jpg/);
    await assert.rejects(buildFeed([post()], config({ image: 'wide.jpg' }), siteUrl, new Date('2026-07-13T00:00:00Z'), runtime({ baseDir: temp, sourceDir: 'source' })), /must be square/);
    await assert.rejects(buildFeed([post()], config({ image: 'transparent.png' }), siteUrl, new Date('2026-07-13T00:00:00Z'), runtime({ baseDir: temp, sourceDir: 'source' })), /must not contain an alpha channel/);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('local file mode rejects legacy fields and paths outside the configured directory', async () => {
  await assert.rejects(
    normaliseEpisode(localPost({ podcast: { file: 'podcast/Minecraft-08-Minecraft.mp3', type: 'audio/mpeg' } }), siteUrl, false, runtime()),
    /cannot be combined with legacy fields/
  );
  await assert.rejects(
    normaliseEpisode(localPost({ podcast: { file: '../outside.mp3' } }), siteUrl, false, runtime()),
    /must not contain empty, dot, or parent path segments/
  );
});

test('renderPlayer delegates legacy episodes to the shared audio component', async () => {
  const html = renderPlayer(await normaliseEpisode(post(), siteUrl, false));
  assert.match(html, /<!-- hexo-sil-audio:start -->/);
  assert.match(html, /class="sil-audio-player" data-sil-audio-player/);
  assert.match(html, /<audio class="sil-audio-player__audio" controls preload="metadata">/);
  assert.match(html, /data-sil-audio-action="play"/);
  assert.match(html, /class="sil-audio-player__range sil-audio-player__progress"/);
  assert.match(html, /sil-audio-player__header[\s\S]*sil-audio-player__status[\s\S]*sil-audio-player__meta/);
  assert.match(html, /class="sil-audio-player__footer"/);
  assert.match(html, /sil-audio-player__footer[\s\S]*sil-audio-player__volume-button[\s\S]*sil-audio-player__play-button[\s\S]*sil-audio-player__download/);
  assert.doesNotMatch(html, /sil-audio-player__volume-control/);
  assert.match(html, /Episode &amp; One/);
  assert.doesNotMatch(html, /第 1 集/);
  assert.doesNotMatch(html, /podcast-player/);
  assert.doesNotMatch(html, /<span[^>]*>播客<\/span>/);
});

test('dry run registers the podcast filter but never the RSS generator', () => {
  const hexo = mockHexo(true);
  registerPlugin(hexo);

  assert.equal(hexo.calls.filters.length, 1);
  assert.equal(hexo.calls.injectors.length, 0);
  assert.equal(hexo.calls.generators.length, 0);
  assert.match(hexo.calls.logs.join('\n'), /podcast\.xml will not be generated/);
});

test('the registered asynchronous filter injects a player before the article body', async () => {
  const hexo = mockHexo(true);
  registerPlugin(hexo);
  const data = post({ content: 'Article body' });

  await hexo.calls.filters[0].fn(data);

  assert.match(data.content, /^<!-- hexo-sil-audio:start -->/);
  assert.match(data.content, /<audio class="sil-audio-player__audio" controls preload="metadata">/);
  assert.match(data.content, /data-sil-audio-action="play"/);
  assert.match(data.content, /Article body$/);
});

test('published mode registers an asynchronous podcast RSS generator', async () => {
  const hexo = mockHexo(false);
  registerPlugin(hexo);

  assert.equal(hexo.calls.generators.length, 1);
  assert.equal(hexo.calls.generators[0].name, 'podcast');

  const route = await hexo.calls.generators[0].fn({ posts: [post()] });
  assert.equal(route.path, 'podcast.xml');
  assert.match(route.data, /<item>/);
});
