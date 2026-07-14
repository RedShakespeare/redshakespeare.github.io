'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseArgs, request, verifyPublishedFeed } = require('hexo-sil-podcast/verify');

const FEED_URL = 'https://www.example.test/podcast.xml';
const IMAGE_URL = 'https://cdn.example.test/podcast-cover.jpg';
const AUDIO_URL = 'https://cdn.example.test/episode-001.mp3';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x05, 0x78, 0x05, 0x78, 0x01, 0x01, 0x11, 0x00]);

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example</title><link>https://www.example.test/</link><description>Example podcast</description><language>zh-CN</language>
    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml"/>
    <itunes:title>Example</itunes:title><itunes:author>Silencess</itunes:author><itunes:summary>Example podcast</itunes:summary>
    <itunes:owner><itunes:name>Silencess</itunes:name><itunes:email>silencess@example.test</itunes:email></itunes:owner>
    <itunes:explicit>false</itunes:explicit><itunes:type>episodic</itunes:type><itunes:image href="${IMAGE_URL}"/>
    <itunes:category text="Leisure"><itunes:category text="Games"/></itunes:category>
    <item>
      <title>Episode one</title><link>https://www.example.test/episode-one/</link><guid isPermaLink="false">episode-001</guid>
      <pubDate>Fri, 10 Jul 2026 12:00:00 +0000</pubDate><itunes:explicit>false</itunes:explicit>
      <enclosure url="${AUDIO_URL}" length="4" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

function response(status, body, headers = {}) {
  return new Response(body, { status, headers });
}

function feedFetch({ rangeStatus = 206 } = {}) {
  return async (url, init = {}) => {
    const method = init.method || 'GET';
    if (url === FEED_URL) return method === 'HEAD'
      ? response(200, null, { 'content-type': 'application/rss+xml' })
      : response(200, FEED, { 'content-type': 'application/rss+xml' });
    if (url === IMAGE_URL) return method === 'HEAD'
      ? response(200, null, { 'content-type': 'image/jpeg' })
      : response(206, JPEG, { 'content-type': 'image/jpeg', 'content-range': `bytes 0-${JPEG.length - 1}/${JPEG.length}` });
    if (url === AUDIO_URL) return method === 'HEAD'
      ? response(200, null, { 'content-type': 'audio/mpeg', 'content-length': '4' })
      : response(rangeStatus, Buffer.from([0]), { 'content-range': 'bytes 0-0/4', 'content-type': 'audio/mpeg' });
    throw new Error(`Unexpected URL ${url}`);
  };
}

test('published feed verifier accepts an RSS feed with reachable artwork and byte-range audio', async () => {
  const result = await verifyPublishedFeed(FEED_URL, { fetchImpl: feedFetch() });
  assert.equal(result.errors.length, 0);
  assert.equal(result.resolvedFeedUrl, FEED_URL);
  assert.equal(result.checks, 3);
});

test('published feed verifier reports missing byte-range support without hiding other checks', async () => {
  const result = await verifyPublishedFeed(FEED_URL, { fetchImpl: feedFetch({ rangeStatus: 200 }) });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /must return HTTP 206/);
});

test('request follows secure redirects and command arguments are strict', async () => {
  const seen = [];
  const result = await request('https://origin.example.test/feed.xml', { method: 'HEAD' }, {
    fetchImpl: async url => {
      seen.push(url);
      return url === 'https://origin.example.test/feed.xml'
        ? response(302, null, { location: 'https://cdn.example.test/feed.xml' })
        : response(200, null);
    }
  });
  assert.equal(result.url, 'https://cdn.example.test/feed.xml');
  assert.deepEqual(seen, ['https://origin.example.test/feed.xml', 'https://cdn.example.test/feed.xml']);
  assert.deepEqual(parseArgs(['node', 'verify']), {});
  assert.deepEqual(parseArgs(['node', 'verify', '--url', FEED_URL]), { url: FEED_URL });
  assert.throws(() => parseArgs(['node', 'verify', '--url']), /Usage/);
});

test('published feed verifier rejects malformed XML before requesting assets', async () => {
  const fetchImpl = async (url, init = {}) => (init.method === 'HEAD'
    ? response(200, null, { 'content-type': 'application/rss+xml' })
    : response(200, '<rss>', { 'content-type': 'application/rss+xml' }));
  const result = await verifyPublishedFeed(FEED_URL, { fetchImpl });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /not well-formed XML/);
});
