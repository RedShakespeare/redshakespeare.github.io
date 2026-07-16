'use strict';

function createPathConfig() {
  function normaliseRelativeDirectory(value, fallback, field) {
    const raw = String(value == null ? fallback : value).trim();
    if (!raw || raw.startsWith('/') || /[^\x21-\x7E]/.test(raw) || /[\\%?#]/.test(raw)) {
      throw new Error(`Video configuration error: ${field} must be an ASCII relative directory.`);
    }
    const directory = raw.replace(/^\/+|\/+$/g, '');
    const segments = directory.split('/');
    if (!directory || segments.some(segment => !segment || segment === '.' || segment === '..')) {
      throw new Error(`Video configuration error: ${field} must be a non-empty relative directory.`);
    }
    return directory;
  }

  function normaliseRelativeFile(value, field, errorFactory = message => new Error(`Video configuration error: ${message}`)) {
    const file = String(value || '').trim();
    if (!file) throw errorFactory(`${field} must be a non-empty relative path.`);
    if (/[^\x21-\x7E]/.test(file)) throw errorFactory(`${field} must use an ASCII path.`);
    if (file.startsWith('/') || /[\\%?#]/.test(file)) {
      throw errorFactory(`${field} must be a plain relative path below video.media.prefix.`);
    }
    const segments = file.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
      throw errorFactory(`${field} must not contain empty, dot, or parent path segments.`);
    }
    return file;
  }

  function normaliseHttpsUrl(value, field, errorFactory = message => new Error(`Video configuration error: ${message}`), trailingSlash = false) {
    const source = String(value || '').trim();
    if (!source) return '';
    if (/[^\x21-\x7E]/.test(source)) throw errorFactory(`${field} must be an ASCII absolute HTTPS URL.`);
    let url;
    try { url = new URL(source); } catch { throw errorFactory(`${field} must be an ASCII absolute HTTPS URL.`); }
    if (url.protocol !== 'https:') throw errorFactory(`${field} must use HTTPS.`);
    if (url.username || url.password) throw errorFactory(`${field} must not contain credentials.`);
    if (trailingSlash && (url.search || url.hash)) throw errorFactory(`${field} must not contain a query string or fragment.`);
    if (trailingSlash) url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
    return url.href;
  }

  function rootPublicPath(root, file) {
    const prefix = String(root || '/').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    return `/${[prefix, String(file || '').replace(/^\/+/, '')].filter(Boolean).join('/')}`;
  }

  function mediaFileUrl(root, media, file) {
    if (media.url) {
      const encoded = file.split('/').map(segment => encodeURIComponent(segment)).join('/');
      return new URL(encoded, media.url).href;
    }
    return rootPublicPath(root, `${media.prefix}/${file}`);
  }

  return { mediaFileUrl, normaliseHttpsUrl, normaliseRelativeDirectory, normaliseRelativeFile, rootPublicPath };
}

module.exports = { createPathConfig };
