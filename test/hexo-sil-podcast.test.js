'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  buildFeed,
  normaliseEpisode,
  PLAYER_SCRIPT,
  PLAYER_STYLE,
  registerPlugin,
  renderPlayer,
  toPodcastConfig
} = require('../scripts/hexo-sil-podcast');

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
      image: 'favicon.png',
      category: { text: 'Leisure', subcategory: 'Games' },
      explicit: false,
      limit: 0,
      media: {
        source_dir: 'source/files',
        public_path: '/files/',
        url: 'https://dl.ephesus.top/files/',
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
    config: {
      url: siteUrl,
      root: '/',
      title: 'Ephesus',
      description: 'Roguelike Temple',
      author: 'Silencess',
      podcast: {
        dry_run: dryRun,
        email: 'silencess.m@gmail.com'
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

test('local file mode derives metadata and uses separate player and RSS URLs', async () => {
  const episode = await normaliseEpisode(localPost(), siteUrl, false, runtime());

  assert.equal(episode.type, 'audio/mpeg');
  assert.equal(episode.length, 4117599);
  assert.equal(episode.duration, '04:14');
  assert.equal(episode.audio, 'https://dl.ephesus.top/files/podcast/Minecraft-08-Minecraft.mp3');
  assert.equal(episode.playerAudio, '/files/podcast/Minecraft-08-Minecraft.mp3');
  assert.match(renderPlayer(episode), /src="\/files\/podcast\/Minecraft-08-Minecraft\.mp3"/);

  const feed = await buildFeed([localPost()], config(), siteUrl, new Date('2026-07-13T00:00:00Z'), runtime());
  assert.match(feed, /enclosure url="https:\/\/dl\.ephesus\.top\/files\/podcast\/Minecraft-08-Minecraft\.mp3" length="4117599" type="audio\/mpeg"/);
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

test('renderPlayer retains the theme-scoped component markup for legacy episodes', async () => {
  const html = renderPlayer(await normaliseEpisode(post(), siteUrl, false));
  assert.match(html, /class="podcast-player" data-podcast-player/);
  assert.match(html, /<audio class="podcast-player__audio" controls preload="metadata">/);
  assert.match(html, /data-podcast-action="play"/);
  assert.match(html, /class="podcast-player__range podcast-player__progress"/);
  assert.match(html, /class="podcast-player__footer"/);
  assert.match(html, /podcast-player__footer[\s\S]*podcast-player__download[\s\S]*podcast-player__volume-control/);
  assert.match(html, /podcast-player__volume-control[\s\S]*data-podcast-action="mute"/);
  assert.match(html, /Episode &amp; One/);
  assert.doesNotMatch(html, /第 1 集/);
  assert.doesNotMatch(html, /podcast-player__label/);
  assert.doesNotMatch(html, /<span[^>]*>播客<\/span>/);
});

test('custom player assets define both colour palettes and react to theme changes', () => {
  assert.match(PLAYER_STYLE, /--podcast-surface: #fff/);
  assert.match(PLAYER_STYLE, /--podcast-surface: #000/);
  assert.match(PLAYER_STYLE, /--podcast-ink: #8064a2/);
  assert.match(PLAYER_STYLE, /\.podcast-player__range \{[\s\S]*border-radius: 8px/);
  assert.match(PLAYER_STYLE, /height: \.3rem/);
  assert.match(PLAYER_STYLE, /border-radius: 99px/);
  assert.match(PLAYER_STYLE, /\.podcast-player__footer \{[\s\S]*padding: \.5rem \.45rem 0/);
  assert.match(PLAYER_STYLE, /\.podcast-player__progress \{[\s\S]*margin-right: \.2rem/);
  assert.match(PLAYER_STYLE, /podcast-player__volume-button/);
  assert.doesNotMatch(PLAYER_STYLE, /#a78bfa/);
  assert.match(PLAYER_STYLE, /::-webkit-slider-runnable-track/);
  assert.match(PLAYER_STYLE, /::-moz-range-progress/);
  assert.match(PLAYER_SCRIPT, /document\.addEventListener\('inside:theme'/);
  assert.match(PLAYER_SCRIPT, /new MutationObserver/);
});

test('dry run registers the player but never the RSS generator', () => {
  const hexo = mockHexo(true);
  registerPlugin(hexo);

  assert.equal(hexo.calls.filters.length, 1);
  assert.deepEqual(hexo.calls.injectors.map(call => call.position), ['head_end', 'body_end']);
  assert.equal(hexo.calls.generators.length, 0);
  assert.match(hexo.calls.logs.join('\n'), /podcast\.xml will not be generated/);
});

test('the registered asynchronous filter injects a player before the article body', async () => {
  const hexo = mockHexo(true);
  registerPlugin(hexo);
  const data = post({ content: 'Article body' });

  await hexo.calls.filters[0].fn(data);

  assert.match(data.content, /^<!-- podcast-player:start -->/);
  assert.match(data.content, /<audio class="podcast-player__audio" controls preload="metadata">/);
  assert.match(data.content, /data-podcast-action="play"/);
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
