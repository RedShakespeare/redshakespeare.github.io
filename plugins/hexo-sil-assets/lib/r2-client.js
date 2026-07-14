'use strict';

// Cloudflare R2 transport used by the hexo-sil-assets maintenance CLI.

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { Readable } = require('node:stream');

const SERVICE = 's3';
const REGION = 'auto';
const MULTIPART_THRESHOLD = 8 * 1024 * 1024;
const PART_SIZE = 8 * 1024 * 1024;

function r2Error(message) {
  return new Error(`R2 asset client: ${message}`);
}

function requiredEnvironment(env = process.env) {
  const accountId = String(env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = String(env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(env.R2_BUCKET || 'ephesus-files').trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw r2Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET are required.');
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: String(env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, '')
  };
}

function awsEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKey(key) {
  const value = String(key || '').replace(/^\/+/, '');
  if (!value || value.split('/').some(segment => !segment || segment === '.' || segment === '..')) throw r2Error('object key must be a safe, non-empty relative path.');
  return value.split('/').map(awsEncode).join('/');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function signingKey(secret, date) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, 'aws4_request');
}

function amzDate(value = new Date()) {
  return value.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalQuery(query = {}) {
  return Object.entries(query).flatMap(([name, value]) => {
    const entries = Array.isArray(value) ? value : [value];
    return entries.map(item => [awsEncode(name), awsEncode(item == null ? '' : item)]);
  }).sort((left, right) => left[0] === right[0] ? left[1].localeCompare(right[1]) : left[0].localeCompare(right[0]))
    .map(([name, value]) => `${name}=${value}`).join('&');
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlUnescape(value) {
  return String(value || '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

async function responseError(response) {
  const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
  return r2Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
}

class R2Client {
  constructor(config = requiredEnvironment()) {
    this.config = config;
  }

  url(key, query = {}) {
    const queryString = canonicalQuery(query);
    const objectPath = key == null || key === '' ? '' : `/${encodeKey(key)}`;
    return `${this.config.endpoint}/${awsEncode(this.config.bucket)}${objectPath}${queryString ? `?${queryString}` : ''}`;
  }

  async request(method, key, options = {}) {
    const query = options.query || {};
    const url = new URL(this.url(key, query));
    const now = options.now || new Date();
    const timestamp = amzDate(now);
    const date = timestamp.slice(0, 8);
    const body = options.body == null ? null : options.body;
    const payloadHash = options.unsignedPayload ? 'UNSIGNED-PAYLOAD' : sha256(body || '');
    const headers = new Headers(options.headers || {});
    headers.set('host', url.host);
    headers.set('x-amz-content-sha256', payloadHash);
    headers.set('x-amz-date', timestamp);
    const headerEntries = Array.from(headers.entries()).map(([name, value]) => [name.toLowerCase(), String(value).trim().replace(/\s+/g, ' ')]).sort((left, right) => left[0].localeCompare(right[0]));
    const canonicalHeaders = headerEntries.map(([name, value]) => `${name}:${value}\n`).join('');
    const signedHeaders = headerEntries.map(([name]) => name).join(';');
    const canonicalRequest = [method, url.pathname, canonicalQuery(query), canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', timestamp, scope, sha256(canonicalRequest)].join('\n');
    const signature = hmac(signingKey(this.config.secretAccessKey, date), stringToSign, 'hex');
    headers.set('authorization', `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
    const response = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : body,
      duplex: body && typeof body.pipe === 'function' ? 'half' : undefined,
      signal: options.signal
    });
    if (!response.ok) throw await responseError(response);
    return response;
  }

  async headObject(key) {
    const response = await this.request('HEAD', key);
    return {
      size: Number(response.headers.get('content-length')),
      type: response.headers.get('content-type') || 'application/octet-stream',
      sha256: String(response.headers.get('x-amz-meta-sha256') || '').toLowerCase(),
      etag: String(response.headers.get('etag') || '').replaceAll('"', '')
    };
  }

  async putBuffer(key, body, metadata = {}) {
    const headers = { 'content-type': metadata.type || 'application/octet-stream' };
    if (metadata.sha256) headers['x-amz-meta-sha256'] = metadata.sha256;
    await this.request('PUT', key, { body, headers });
  }

  async createMultipartUpload(key, metadata = {}) {
    const headers = { 'content-type': metadata.type || 'application/octet-stream' };
    if (metadata.sha256) headers['x-amz-meta-sha256'] = metadata.sha256;
    const response = await this.request('POST', key, { query: { uploads: '' }, headers });
    const xml = await response.text();
    const match = xml.match(/<UploadId>([^<]+)<\/UploadId>/i);
    if (!match) throw r2Error('multipart create response did not include UploadId.');
    return xmlUnescape(match[1]);
  }

  async uploadPart(key, uploadId, partNumber, body) {
    const response = await this.request('PUT', key, { query: { partNumber, uploadId }, body });
    const etag = response.headers.get('etag');
    if (!etag) throw r2Error(`multipart part ${partNumber} did not return an ETag.`);
    return etag.replaceAll('"', '');
  }

  async completeMultipartUpload(key, uploadId, parts) {
    const body = `<CompleteMultipartUpload>${parts.map(part => `<Part><PartNumber>${part.number}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
    await this.request('POST', key, { query: { uploadId }, body, headers: { 'content-type': 'application/xml' } });
  }

  async abortMultipartUpload(key, uploadId) {
    await this.request('DELETE', key, { query: { uploadId } });
  }

  async uploadFile(key, filePath, metadata) {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw r2Error(`${filePath} must be a regular file.`);
    if (stat.size < MULTIPART_THRESHOLD) {
      await this.putBuffer(key, await fsp.readFile(filePath), metadata);
      return;
    }
    const uploadId = await this.createMultipartUpload(key, metadata);
    try {
      const descriptor = await fsp.open(filePath, 'r');
      try {
        const parts = [];
        for (let offset = 0, number = 1; offset < stat.size; offset += PART_SIZE, number += 1) {
          const length = Math.min(PART_SIZE, stat.size - offset);
          const buffer = Buffer.allocUnsafe(length);
          await descriptor.read(buffer, 0, length, offset);
          parts.push({ number, etag: await this.uploadPart(key, uploadId, number, buffer) });
        }
        await this.completeMultipartUpload(key, uploadId, parts);
      } finally {
        await descriptor.close();
      }
    } catch (error) {
      await this.abortMultipartUpload(key, uploadId).catch(() => undefined);
      throw error;
    }
  }

  async deleteObject(key) {
    await this.request('DELETE', key);
  }

  async getObject(key) {
    const response = await this.request('GET', key, { unsignedPayload: true });
    if (!response.body) throw r2Error(`${key} returned an empty response body.`);
    return Readable.fromWeb(response.body);
  }

  async list(prefix = '') {
    const items = [];
    let token = '';
    do {
      const query = { 'list-type': '2', prefix };
      if (token) query['continuation-token'] = token;
      const response = await this.request('GET', '', { query, unsignedPayload: true });
      const xml = await response.text();
      for (const match of xml.matchAll(/<Contents>\s*<Key>([^<]+)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/gi)) {
        items.push({ key: xmlUnescape(match[1]), size: Number(match[2]) });
      }
      const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/i);
      token = next ? xmlUnescape(next[1]) : '';
    } while (token);
    return items;
  }
}

function createR2Client(config) {
  return new R2Client(config);
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath).on('error', reject).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex')));
  });
}

module.exports = {
  MULTIPART_THRESHOLD,
  PART_SIZE,
  R2Client,
  awsEncode,
  createR2Client,
  hashFile,
  requiredEnvironment,
  r2Error
};
