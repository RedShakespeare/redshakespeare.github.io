const FALLBACK_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function objectKey(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/files/')) return null;

  let key;
  try {
    key = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return null;
  }

  const segments = key.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null;
  }
  return key;
}

function fallbackType(key) {
  const extension = key.slice(key.lastIndexOf('.')).toLowerCase();
  return FALLBACK_TYPES[extension];
}

export default {
  async fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    }

    const key = objectKey(request);
    if (!key) return new Response('Not Found', { status: 404 });

    const object = await env.EPHESUS_FILES.get(key, { range: request.headers });
    if (object === null) return new Response('Not Found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');

    if (!headers.get('Content-Type') || headers.get('Content-Type') === 'application/octet-stream') {
      const type = fallbackType(key);
      if (type) headers.set('Content-Type', type);
    }

    let status = 200;
    if (object.range) {
      status = 206;
      headers.set(
        'Content-Range',
        `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`,
      );
      headers.set('Content-Length', String(object.range.length));
    } else {
      headers.set('Content-Length', String(object.size));
    }

    return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
  },
};
