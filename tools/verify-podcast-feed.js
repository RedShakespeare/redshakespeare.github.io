'use strict';

const Hexo = require('hexo');
const { toPodcastConfig } = require('../scripts/hexo-sil-podcast');
const {
  childElement,
  childElements,
  elementText,
  inspectArtworkBuffer,
  parseXmlDocument,
  resolveHttpsUrl,
  validateAppleCategory,
  validateArtworkMetadata
} = require('../scripts/podcast-rss');

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const RFC_2822_DATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$/;

function header(response, name) {
  return response.headers && response.headers.get(name) || '';
}

function isSuccess(response) {
  return response.status >= 200 && response.status < 300;
}

function isRedirect(response) {
  return response.status >= 300 && response.status < 400;
}

function assertValue(value, label) {
  if (!String(value || '').trim()) throw new Error(`${label} is required.`);
  return String(value).trim();
}

function assertRfc2822(value, label) {
  if (!RFC_2822_DATE.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} must use RFC 2822 with a numeric timezone.`);
}

async function request(url, init = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  if (typeof fetchImpl !== 'function') throw new Error('A Fetch implementation is required to verify the published feed.');
  let target = resolveHttpsUrl(url, null, 'Published resource URL must be an ASCII HTTPS URL.');
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response;
    try {
      response = await fetchImpl(target, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new Error(`request failed for ${target}: ${error.message}`);
    }
    if (!isRedirect(response)) return { url: target, response };
    if (redirects === MAX_REDIRECTS) throw new Error(`too many redirects for ${target}.`);
    const location = header(response, 'location');
    if (!location) throw new Error(`redirect response from ${target} has no Location header.`);
    target = resolveHttpsUrl(location, target, 'Redirect target must be an ASCII HTTPS URL.');
  }
  throw new Error(`too many redirects for ${url}.`);
}

async function ensureHead(url, options) {
  const result = await request(url, { method: 'HEAD' }, options);
  if (!isSuccess(result.response)) throw new Error(`HEAD ${result.url} returned HTTP ${result.response.status}.`);
  return result;
}

function parseChannel(root) {
  if (!root || root.name !== 'rss' || root.attributes.version !== '2.0') throw new Error('RSS root must be <rss version="2.0">.');
  if (!root.attributes['xmlns:itunes'] || !root.attributes['xmlns:content']) throw new Error('RSS root must declare the itunes and content namespaces.');
  const channel = childElement(root, 'channel');
  if (!channel) throw new Error('RSS feed must contain one channel.');
  return channel;
}

function readChannel(channel) {
  const required = ['title', 'link', 'description', 'language', 'itunes:title', 'itunes:author', 'itunes:summary', 'itunes:explicit', 'itunes:type'];
  const values = {};
  for (const name of required) values[name] = assertValue(elementText(childElement(channel, name)), `Channel <${name}>`);
  if (!['true', 'false'].includes(values['itunes:explicit'])) throw new Error('Channel <itunes:explicit> must be true or false.');
  if (values['itunes:type'] !== 'episodic') throw new Error('Channel <itunes:type> must be episodic.');
  try {
    if (Intl.getCanonicalLocales(values.language).length !== 1) throw new Error('invalid language');
  } catch {
    throw new Error('Channel <language> must be a valid language tag.');
  }
  resolveHttpsUrl(values.link, null, 'Channel <link> must be an ASCII HTTPS URL.');
  const owner = childElement(channel, 'itunes:owner');
  assertValue(elementText(childElement(owner || {}, 'itunes:name')), 'Channel <itunes:owner><itunes:name>');
  const ownerEmail = assertValue(elementText(childElement(owner || {}, 'itunes:email')), 'Channel <itunes:owner><itunes:email>');
  if (!/^\S+@\S+\.\S+$/.test(ownerEmail)) throw new Error('Channel <itunes:owner><itunes:email> must be a valid public contact address.');
  const category = childElement(channel, 'itunes:category');
  if (!category) throw new Error('Channel <itunes:category> is required.');
  const subcategory = childElement(category, 'itunes:category');
  validateAppleCategory({ text: category.attributes.text, subcategory: subcategory && subcategory.attributes.text });
  const image = childElement(channel, 'itunes:image');
  const imageUrl = resolveHttpsUrl(image && image.attributes.href, null, 'Channel <itunes:image> must use an ASCII HTTPS URL.');
  const selfLink = childElement(channel, 'atom:link');
  if (!selfLink || selfLink.attributes.rel !== 'self' || selfLink.attributes.type !== 'application/rss+xml') {
    throw new Error('Channel <atom:link> must identify this RSS feed as application/rss+xml.');
  }
  resolveHttpsUrl(selfLink.attributes.href, null, 'Channel <atom:link> must use an ASCII HTTPS URL.');
  return { imageUrl, values };
}

function readItems(channel) {
  const entries = [];
  const seenGuids = new Set();
  const seenAudio = new Set();
  for (const item of childElements(channel, 'item')) {
    const title = assertValue(elementText(childElement(item, 'title')), 'Item <title>');
    const link = assertValue(elementText(childElement(item, 'link')), `Item ${title} <link>`);
    resolveHttpsUrl(link, null, `Item ${title} <link> must use an ASCII HTTPS URL.`);
    const guid = assertValue(elementText(childElement(item, 'guid')), `Item ${title} <guid>`);
    if (seenGuids.has(guid)) throw new Error(`Item ${title} duplicates GUID ${guid}.`);
    seenGuids.add(guid);
    assertRfc2822(assertValue(elementText(childElement(item, 'pubDate')), `Item ${title} <pubDate>`), `Item ${title} <pubDate>`);
    const explicit = assertValue(elementText(childElement(item, 'itunes:explicit')), `Item ${title} <itunes:explicit>`);
    if (!['true', 'false'].includes(explicit)) throw new Error(`Item ${title} <itunes:explicit> must be true or false.`);
    const enclosure = childElement(item, 'enclosure');
    if (!enclosure) throw new Error(`Item ${title} requires one <enclosure>.`);
    const audioUrl = resolveHttpsUrl(enclosure.attributes.url, null, `Item ${title} enclosure URL must use ASCII HTTPS.`);
    if (seenAudio.has(audioUrl)) throw new Error(`Item ${title} duplicates enclosure URL ${audioUrl}.`);
    seenAudio.add(audioUrl);
    const length = Number(enclosure.attributes.length);
    if (!Number.isSafeInteger(length) || length <= 0) throw new Error(`Item ${title} enclosure length must be a positive byte count.`);
    const type = String(enclosure.attributes.type || '');
    if (!/^audio\/[a-z0-9.+-]+$/i.test(type)) throw new Error(`Item ${title} enclosure type must be an audio MIME type.`);
    const image = childElement(item, 'itunes:image');
    entries.push({ title, audioUrl, length, type: type.toLowerCase(), imageUrl: image && resolveHttpsUrl(image.attributes.href, null, `Item ${title} artwork must use ASCII HTTPS.`) });
  }
  if (!entries.length) throw new Error('RSS feed must contain at least one published item.');
  return entries;
}

async function verifyArtwork(url, options) {
  const head = await ensureHead(url, options);
  const contentType = header(head.response, 'content-type').toLowerCase().split(';')[0];
  if (!['image/png', 'image/jpeg'].includes(contentType)) throw new Error(`artwork ${head.url} returned unsupported Content-Type ${contentType || '(missing)'}.`);
  const sample = await request(head.url, { method: 'GET', headers: { Range: 'bytes=0-65535' } }, options);
  if (![200, 206].includes(sample.response.status)) throw new Error(`artwork ${sample.url} returned HTTP ${sample.response.status}.`);
  validateArtworkMetadata(inspectArtworkBuffer(Buffer.from(await sample.response.arrayBuffer()), `Artwork ${sample.url}`), `Artwork ${sample.url}`);
}

async function verifyEnclosure(entry, options) {
  const head = await ensureHead(entry.audioUrl, options);
  const contentLength = Number(header(head.response, 'content-length'));
  if (!Number.isSafeInteger(contentLength) || contentLength !== entry.length) {
    throw new Error(`enclosure ${head.url} Content-Length ${header(head.response, 'content-length') || '(missing)'} does not match RSS length ${entry.length}.`);
  }
  const contentType = header(head.response, 'content-type').toLowerCase().split(';')[0];
  if (contentType !== entry.type) throw new Error(`enclosure ${head.url} Content-Type ${contentType || '(missing)'} does not match RSS type ${entry.type}.`);
  const range = await request(head.url, { method: 'GET', headers: { Range: 'bytes=0-0' } }, options);
  if (range.response.status !== 206) throw new Error(`enclosure ${range.url} must return HTTP 206 for a byte-range request; received ${range.response.status}.`);
  const contentRange = header(range.response, 'content-range');
  if (!new RegExp(`^bytes 0-0/${entry.length}$`).test(contentRange)) throw new Error(`enclosure ${range.url} returned invalid Content-Range ${contentRange || '(missing)'}.`);
}

async function verifyPublishedFeed(feedUrl, options = {}) {
  const errors = [];
  let channel;
  let channelInfo;
  let items;
  let resolvedFeedUrl;
  try {
    const head = await ensureHead(feedUrl, options);
    resolvedFeedUrl = head.url;
    const feed = await request(head.url, { method: 'GET' }, options);
    if (!isSuccess(feed.response)) throw new Error(`GET ${feed.url} returned HTTP ${feed.response.status}.`);
    const contentType = header(feed.response, 'content-type').toLowerCase();
    if (!/(?:application|text)\/(?:rss\+xml|xml)(?:;|$)/.test(contentType)) throw new Error(`feed ${feed.url} returned unsupported Content-Type ${contentType || '(missing)'}.`);
    channel = parseChannel(parseXmlDocument(await feed.response.text(), `Feed ${feed.url}`));
    channelInfo = readChannel(channel);
    items = readItems(channel);
  } catch (error) {
    return { feedUrl, resolvedFeedUrl, errors: [error.message], checks: 0 };
  }

  const artworkUrls = [...new Set([channelInfo.imageUrl, ...items.map(item => item.imageUrl).filter(Boolean)])];
  for (const imageUrl of artworkUrls) {
    try {
      await verifyArtwork(imageUrl, options);
    } catch (error) {
      errors.push(error.message);
    }
  }
  for (const item of items) {
    try {
      await verifyEnclosure(item, options);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { feedUrl, resolvedFeedUrl, errors, checks: artworkUrls.length + items.length + 1 };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const urlIndex = args.indexOf('--url');
  if (args.includes('--help')) return { help: true };
  if (urlIndex === -1) {
    if (args.length) throw new Error(`Unknown argument: ${args[0]}`);
    return {};
  }
  if (urlIndex !== 0 || args.length !== 2 || !args[1]) throw new Error('Usage: npm run verify:podcast -- --url https://example.com/podcast.xml');
  return { url: args[1] };
}

async function configuredFeedUrl(cwd = process.cwd()) {
  const hexo = new Hexo(cwd, { silent: true });
  await hexo.init();
  const config = toPodcastConfig(hexo.config);
  if (config.dryRun) throw new Error('podcast.dry_run is true; publish the feed first or supply --url to verify an existing public feed.');
  return resolveHttpsUrl(config.path, hexo.config.url, 'Podcast configuration does not resolve to an ASCII HTTPS feed URL.');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: npm run verify:podcast [-- --url https://example.com/podcast.xml]');
    return;
  }
  const feedUrl = args.url ? resolveHttpsUrl(args.url, null, 'Feed URL must be an ASCII HTTPS URL.') : await configuredFeedUrl();
  const result = await verifyPublishedFeed(feedUrl);
  if (result.errors.length) {
    for (const error of result.errors) console.error(`Podcast verification failed: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Podcast verification passed: ${result.resolvedFeedUrl || feedUrl} (${result.checks} resource checks).`);
}

if (require.main === module) main().catch(error => { console.error(`Podcast verification failed: ${error.message}`); process.exitCode = 1; });

module.exports = {
  DEFAULT_TIMEOUT_MS,
  configuredFeedUrl,
  parseArgs,
  request,
  verifyPublishedFeed
};
