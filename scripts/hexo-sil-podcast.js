'use strict';

const {
  AUDIO_MIME_TYPES,
  PLAYER_END,
  PLAYER_SCRIPT,
  PLAYER_START,
  formatDuration,
  normaliseLocalAudio,
  renderAudioPlayer
} = require('./hexo-sil-audio');

const EPISODE_TYPES = new Set(['full', 'trailer', 'bonus']);
const DURATION_PATTERN = /^(?:\d{1,3}:)?[0-5]\d:[0-5]\d$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function podcastError(post, message) {
  const identifier = post && (post.source || post.path || post.title) || 'unknown post';
  return new Error(`Podcast metadata error in ${identifier}: ${message}`);
}

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function cdata(value) {
  return `<![CDATA[${String(value == null ? '' : value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function stripHtml(value) {
  return String(value == null ? '' : value)
    .replace(/<!--[^]*?-->/g, ' ').replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function removePlayerMarkup(value) {
  return String(value == null ? '' : value).replace(new RegExp(`${PLAYER_START}[\\s\\S]*?${PLAYER_END}\\s*`, 'g'), '');
}

function toAbsoluteUrl(value, siteUrl, message) {
  try {
    return new URL(String(value), siteUrl).href;
  } catch {
    throw new Error(message || 'Invalid URL.');
  }
}

function normaliseRelativeDirectory(value, fallback, field) {
  const directory = String(value == null ? fallback : value).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = directory.split('/');
  if (!directory || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Podcast configuration error: ${field} must be a non-empty relative directory.`);
  }
  return directory;
}

function toPodcastConfig(siteConfig = {}) {
  const raw = isObject(siteConfig.podcast) ? siteConfig.podcast : {};
  const category = isObject(raw.category) ? raw.category : {};
  const media = isObject(raw.media) ? raw.media : {};
  const feedPath = String(raw.path || 'podcast.xml').replace(/^\/+/, '');
  if (!feedPath || feedPath.includes('..')) throw new Error('Podcast configuration error: path must be a site-relative file path.');
  return {
    dryRun: raw.dry_run === undefined ? true : raw.dry_run === true,
    path: feedPath,
    title: String(raw.title || siteConfig.title || ''),
    description: String(raw.description || siteConfig.description || ''),
    author: String(raw.author || siteConfig.author || ''),
    email: String(raw.email || siteConfig.email || ''),
    language: String(raw.language || 'zh-CN'),
    link: String(raw.link || '/'),
    image: String(raw.image || 'favicon.png'),
    category: { text: String(category.text || ''), subcategory: String(category.subcategory || '') },
    explicit: raw.explicit === true,
    limit: raw.limit == null ? 0 : Number(raw.limit),
    media: {
      sourceDir: normaliseRelativeDirectory(media.source_dir, 'source/files', 'media.source_dir'),
      publicPath: normaliseRelativeDirectory(media.public_path, 'files', 'media.public_path'),
      url: String(media.url || '')
    }
  };
}

function validateFeedConfig(config) {
  for (const field of ['title', 'description', 'author', 'email', 'language', 'image']) {
    if (!config[field]) throw new Error(`Podcast configuration error: ${field} is required when dry_run is false.`);
  }
  if (!/^\S+@\S+\.\S+$/.test(config.email)) throw new Error('Podcast configuration error: email must be a valid public contact address.');
  if (!Number.isSafeInteger(config.limit) || config.limit < 0) throw new Error('Podcast configuration error: limit must be a non-negative integer.');
}

function hasPodcastMetadata(post) {
  return post && post.podcast !== undefined && post.podcast !== false;
}

function validateEpisodeFields(post, data, audio, type, length, duration, siteUrl, defaultExplicit, playerAudio) {
  const episode = data.episode == null ? null : Number(data.episode);
  if (episode !== null && (!Number.isSafeInteger(episode) || episode <= 0)) throw podcastError(post, '`podcast.episode` must be a positive integer.');
  const season = data.season == null ? null : Number(data.season);
  if (season !== null && (!Number.isSafeInteger(season) || season <= 0)) throw podcastError(post, '`podcast.season` must be a positive integer.');
  const episodeType = String(data.episode_type || 'full').toLowerCase();
  if (!EPISODE_TYPES.has(episodeType)) throw podcastError(post, '`podcast.episode_type` must be full, trailer, or bonus.');
  const guid = String(data.guid || audio);
  if (!guid) throw podcastError(post, '`podcast.guid` must not be empty.');
  const image = data.image ? toAbsoluteUrl(data.image, siteUrl, '`podcast.image` must be a valid URL.') : '';
  return {
    title: String(post.title || ''), audio, playerAudio, type, length, duration, episode, season, episodeType,
    explicit: data.explicit === undefined ? defaultExplicit : data.explicit === true,
    summary: String(data.summary || ''), guid, image
  };
}

function normaliseRemoteEpisode(post, siteUrl, defaultExplicit) {
  const data = post.podcast;
  const audio = String(data.audio || '');
  if (!audio) throw podcastError(post, '`podcast.audio` is required.');
  if (/[^\x21-\x7E]/.test(audio)) throw podcastError(post, '`podcast.audio` must use an ASCII URL.');
  let audioUrl;
  try {
    audioUrl = new URL(audio);
  } catch {
    throw podcastError(post, '`podcast.audio` must be an absolute HTTPS URL.');
  }
  if (audioUrl.protocol !== 'https:') throw podcastError(post, '`podcast.audio` must use HTTPS.');
  const type = String(data.type || '');
  if (!/^audio\/[a-z0-9.+-]+$/i.test(type)) throw podcastError(post, '`podcast.type` must be an audio MIME type.');
  const length = Number(data.length);
  if (!Number.isSafeInteger(length) || length <= 0) throw podcastError(post, '`podcast.length` must be a positive integer byte count.');
  const duration = String(data.duration || '');
  if (!DURATION_PATTERN.test(duration)) throw podcastError(post, '`podcast.duration` must be MM:SS or HH:MM:SS.');
  return validateEpisodeFields(post, data, audioUrl.href, type, length, duration, siteUrl, defaultExplicit, audioUrl.href);
}

function localAudioUrl(post, file, url) {
  if (!url || /[^\x21-\x7E]/.test(url)) throw podcastError(post, '`podcast.media.url` must be an absolute HTTPS URL when `podcast.file` is used.');
  let base;
  try {
    base = new URL(url.endsWith('/') ? url : `${url}/`);
  } catch {
    throw podcastError(post, '`podcast.media.url` must be an absolute HTTPS URL when `podcast.file` is used.');
  }
  if (base.protocol !== 'https:') throw podcastError(post, '`podcast.media.url` must use HTTPS when `podcast.file` is used.');
  return new URL(file, base).href;
}

async function normaliseLocalEpisode(post, siteUrl, defaultExplicit, runtime) {
  const data = post.podcast;
  const legacyFields = ['audio', 'type', 'length', 'duration'].filter(field => Object.prototype.hasOwnProperty.call(data, field));
  if (legacyFields.length) throw podcastError(post, '`podcast.file` cannot be combined with legacy fields: ' + legacyFields.join(', ') + '.');
  let local;
  try {
    local = await normaliseLocalAudio(post, data.file, runtime);
  } catch (error) {
    throw new Error(error.message.replace(/^Audio metadata error/, 'Podcast metadata error'));
  }
  const audio = localAudioUrl(post, local.file, runtime.media.url);
  return validateEpisodeFields(post, data, audio, local.type, local.length, local.duration, siteUrl, defaultExplicit, local.playerAudio);
}

async function normaliseEpisode(post, siteUrl, defaultExplicit, runtime) {
  if (!isObject(post.podcast)) throw podcastError(post, '`podcast` must be a mapping.');
  return Object.prototype.hasOwnProperty.call(post.podcast, 'file')
    ? normaliseLocalEpisode(post, siteUrl, defaultExplicit, runtime)
    : normaliseRemoteEpisode(post, siteUrl, defaultExplicit);
}

function renderPlayer(episode) {
  return renderAudioPlayer(episode);
}

function formatRfc2822(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid publication date: ${value}`);
  return date.toUTCString().replace('GMT', '+0000');
}

async function getPublishedEpisodes(posts, siteUrl, defaultExplicit, now = new Date(), runtime) {
  const source = Array.isArray(posts) ? posts : posts.toArray();
  const entries = await Promise.all(source.filter(post => hasPodcastMetadata(post) && post.draft !== true && post.published !== false)
    .filter(post => { const date = new Date(post.date); return !Number.isNaN(date) && date <= now; })
    .map(async post => ({ post, episode: await normaliseEpisode(post, siteUrl, defaultExplicit, runtime) })));
  return entries.sort((left, right) => new Date(right.post.date) - new Date(left.post.date));
}

function assertUniqueEpisodes(entries) {
  const audioUrls = new Set();
  const guids = new Set();
  for (const { episode } of entries) {
    if (audioUrls.has(episode.audio)) throw new Error(`Podcast metadata error: duplicate podcast.audio URL: ${episode.audio}`);
    if (guids.has(episode.guid)) throw new Error(`Podcast metadata error: duplicate podcast.guid: ${episode.guid}`);
    audioUrls.add(episode.audio); guids.add(episode.guid);
  }
}

function postUrl(post, siteUrl) {
  return toAbsoluteUrl(post.permalink || post.path || '', siteUrl, 'Podcast post must have a valid permalink.');
}

function buildItem(post, episode, siteUrl) {
  const showNotes = removePlayerMarkup(post.content || '');
  const description = stripHtml(episode.summary || post.excerpt || showNotes || post.title);
  const lines = [
    '  <item>', `    <title>${escapeXml(post.title || '')}</title>`, `    <link>${escapeXml(postUrl(post, siteUrl))}</link>`,
    `    <guid isPermaLink="false">${escapeXml(episode.guid)}</guid>`, `    <pubDate>${formatRfc2822(post.date)}</pubDate>`,
    `    <description>${escapeXml(description)}</description>`, `    <content:encoded>${cdata(showNotes || description)}</content:encoded>`,
    `    <enclosure url="${escapeXml(episode.audio)}" length="${episode.length}" type="${escapeXml(episode.type)}"/>`,
    `    <itunes:duration>${escapeXml(episode.duration)}</itunes:duration>`, `    <itunes:episodeType>${escapeXml(episode.episodeType)}</itunes:episodeType>`,
    `    <itunes:explicit>${episode.explicit ? 'yes' : 'no'}</itunes:explicit>`
  ];
  if (episode.season !== null) lines.push(`    <itunes:season>${episode.season}</itunes:season>`);
  if (episode.episode !== null) lines.push(`    <itunes:episode>${episode.episode}</itunes:episode>`);
  if (episode.image) lines.push(`    <itunes:image href="${escapeXml(episode.image)}"/>`);
  lines.push('  </item>');
  return lines.join('\n');
}

async function buildFeed(posts, config, siteUrl, now = new Date(), runtime) {
  validateFeedConfig(config);
  const entries = await getPublishedEpisodes(posts, siteUrl, config.explicit, now, runtime);
  assertUniqueEpisodes(entries);
  const limited = config.limit > 0 ? entries.slice(0, config.limit) : entries;
  const channelUrl = toAbsoluteUrl(config.link, siteUrl, 'Podcast configuration error: link must be a valid URL.');
  const imageUrl = toAbsoluteUrl(config.image, siteUrl, 'Podcast configuration error: image must be a valid URL.');
  const feedUrl = toAbsoluteUrl(config.path, siteUrl, 'Podcast configuration error: path must be a valid URL.');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">', '<channel>',
    `  <title>${escapeXml(config.title)}</title>`, `  <link>${escapeXml(channelUrl)}</link>`, `  <description>${escapeXml(config.description)}</description>`, `  <language>${escapeXml(config.language)}</language>`,
    `  <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`, `  <itunes:title>${escapeXml(config.title)}</itunes:title>`, `  <itunes:author>${escapeXml(config.author)}</itunes:author>`, `  <itunes:summary>${escapeXml(config.description)}</itunes:summary>`,
    '  <itunes:owner>', `    <itunes:name>${escapeXml(config.author)}</itunes:name>`, `    <itunes:email>${escapeXml(config.email)}</itunes:email>`, '  </itunes:owner>',
    `  <itunes:explicit>${config.explicit ? 'yes' : 'no'}</itunes:explicit>`, '  <itunes:type>episodic</itunes:type>', `  <itunes:image href="${escapeXml(imageUrl)}"/>`,
    '  <image>', `    <url>${escapeXml(imageUrl)}</url>`, `    <title>${escapeXml(config.title)}</title>`, `    <link>${escapeXml(channelUrl)}</link>`, '  </image>', '  <generator>hexo-sil-podcast</generator>'
  ];
  if (config.category.text) {
    lines.push(`  <itunes:category text="${escapeXml(config.category.text)}">`);
    if (config.category.subcategory) lines.push(`    <itunes:category text="${escapeXml(config.category.subcategory)}"/>`);
    lines.push('  </itunes:category>');
  }
  if (limited.length) lines.push(`  <lastBuildDate>${formatRfc2822(limited[0].post.date)}</lastBuildDate>`);
  lines.push(...limited.map(({ post, episode }) => buildItem(post, episode, siteUrl)), '</channel>', '</rss>', '');
  return lines.join('\n');
}

function warnAboutArtwork(hexo, config) {
  if (config.image === 'favicon.png') hexo.log.warn('Podcast cover uses favicon.png. Replace it with a 1400-3000px square image before submitting to podcast directories.');
}

function registerPlugin(hexo) {
  const config = toPodcastConfig(hexo.config);
  const siteUrl = hexo.config.url;
  const runtime = { baseDir: hexo.base_dir || process.cwd(), root: hexo.config.root || '/', media: config.media };
  hexo.extend.filter.register('before_post_render', async function (data) {
    if (!hasPodcastMetadata(data)) return data;
    data.content = `${renderPlayer(await normaliseEpisode(data, siteUrl, config.explicit, runtime))}\n\n${data.content || ''}`;
    return data;
  });
  if (config.dryRun) {
    hexo.log.info('Podcast dry run enabled: player preview is active and podcast.xml will not be generated.');
    return;
  }
  validateFeedConfig(config);
  warnAboutArtwork(hexo, config);
  hexo.extend.generator.register('podcast', async locals => ({ path: config.path, data: await buildFeed(locals.posts, config, siteUrl, new Date(), runtime) }));
}

if (typeof hexo !== 'undefined') registerPlugin(hexo);

module.exports = {
  AUDIO_MIME_TYPES, PLAYER_END, PLAYER_SCRIPT, PLAYER_START, buildFeed, formatDuration,
  getPublishedEpisodes, hasPodcastMetadata, normaliseEpisode, registerPlugin, renderPlayer, toPodcastConfig, validateFeedConfig
};
