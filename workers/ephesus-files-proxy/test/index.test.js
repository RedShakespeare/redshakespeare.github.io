import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { fallbackType, hxhCivPageUrl, objectKey } from '../src/index.js';

function object({ type = 'application/octet-stream', size = 4, range, body = 'data' } = {}) {
  return {
    body,
    size,
    range,
    httpEtag: '"fixture"',
    writeHttpMetadata(headers) {
      headers.set('Content-Type', type);
    }
  };
}

test('video, subtitle, and font extensions receive explicit fallback types', () => {
  assert.equal(fallbackType('files/video/demo.mp4'), 'video/mp4');
  assert.equal(fallbackType('files/video/demo.m4v'), 'video/mp4');
  assert.equal(fallbackType('files/video/demo.webm'), 'video/webm');
  assert.equal(fallbackType('files/video/demo.ass'), 'text/x-ssa; charset=utf-8');
  assert.equal(fallbackType('files/video/demo.srt'), 'application/x-subrip; charset=utf-8');
  assert.equal(fallbackType('files/video/font.ttf'), 'font/ttf');
  assert.equal(fallbackType('files/video/font.otf'), 'font/otf');
});

test('object paths remain constrained to the established files boundary', () => {
  assert.equal(objectKey(new Request('https://www.ephesus.top/files/video/demo.mp4')), 'files/video/demo.mp4');
  assert.equal(objectKey(new Request('https://www.ephesus.top/private/demo.mp4')), null);
  assert.equal(objectKey(new Request('https://www.ephesus.top/files/video//secret.mp4')), null);
});

test('worker keeps HEAD and byte-range responses suitable for video playback', async () => {
  const full = await worker.fetch(new Request('https://www.ephesus.top/files/video/demo.mp4'), {
    EPHESUS_FILES: { get: async () => object({ size: 4 }) }
  });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('Content-Type'), 'video/mp4');
  assert.equal(full.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(full.headers.get('Content-Length'), '4');

  const head = await worker.fetch(new Request('https://www.ephesus.top/files/video/demo.mp4', { method: 'HEAD' }), {
    EPHESUS_FILES: { get: async () => object({ size: 4 }) }
  });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');

  const ranged = await worker.fetch(new Request('https://www.ephesus.top/files/video/demo.mp4', { headers: { Range: 'bytes=2-4' } }), {
    EPHESUS_FILES: { get: async () => object({ size: 10, range: { offset: 2, length: 3 }, body: 'vid' }) }
  });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('Content-Range'), 'bytes 2-4/10');
  assert.equal(ranged.headers.get('Content-Length'), '3');
});

test('missing objects and hxh_civ redirects preserve existing behaviour', async () => {
  assert.match(hxhCivPageUrl(new Request('https://www.ephesus.top/files/hxh_civ/')).href, /\/hxh_civ\/$/);
  const redirect = await worker.fetch(new Request('https://www.ephesus.top/files/hxh_civ/'), { EPHESUS_FILES: { get: async () => null } });
  assert.equal(redirect.status, 302);
  const missing = await worker.fetch(new Request('https://www.ephesus.top/files/video/missing.mp4'), { EPHESUS_FILES: { get: async () => null } });
  assert.equal(missing.status, 404);
});
