'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sax = require('sax');

const APPLE_PODCAST_CATEGORIES = Object.freeze({
  Arts: ['Books', 'Design', 'Fashion & Beauty', 'Food', 'Performing Arts', 'Visual Arts'],
  Business: ['Careers', 'Entrepreneurship', 'Investing', 'Management', 'Marketing', 'Non-Profit'],
  Comedy: ['Comedy Interviews', 'Improv', 'Stand-Up'],
  Education: ['Courses', 'How To', 'Language Learning', 'Self-Improvement'],
  Fiction: ['Comedy Fiction', 'Drama', 'Science Fiction'],
  Government: [],
  History: [],
  'Health & Fitness': ['Alternative Health', 'Fitness', 'Medicine', 'Mental Health', 'Nutrition', 'Sexuality'],
  'Kids & Family': ['Education for Kids', 'Parenting', 'Pets & Animals', 'Stories for Kids'],
  Leisure: ['Animation & Manga', 'Automotive', 'Aviation', 'Crafts', 'Games', 'Hobbies', 'Home & Garden', 'Video Games'],
  Music: ['Music Commentary', 'Music History', 'Music Interviews'],
  News: ['Business News', 'Daily News', 'Entertainment News', 'News Commentary', 'Politics', 'Sports News', 'Tech News'],
  'Religion & Spirituality': ['Buddhism', 'Christianity', 'Hinduism', 'Islam', 'Judaism', 'Religion', 'Spirituality'],
  Science: ['Astronomy', 'Chemistry', 'Earth Sciences', 'Life Sciences', 'Mathematics', 'Natural Sciences', 'Nature', 'Physics', 'Social Sciences'],
  'Society & Culture': ['Documentary', 'Personal Journals', 'Philosophy', 'Places & Travel', 'Relationships'],
  Sports: ['Baseball', 'Basketball', 'Cricket', 'Fantasy Sports', 'Football', 'Golf', 'Hockey', 'Rugby', 'Running', 'Soccer', 'Swimming', 'Tennis', 'Volleyball', 'Wilderness', 'Wrestling'],
  Technology: [],
  'True Crime': [],
  'TV & Film': ['After Shows', 'Film History', 'Film Interviews', 'Film Reviews', 'TV Reviews']
});

function isAsciiUrl(value) {
  return /^[\x21-\x7E]+$/.test(String(value || ''));
}

function resolveHttpsUrl(value, baseUrl, message) {
  const source = String(value == null ? '' : value).trim();
  if (!isAsciiUrl(source)) throw new Error(message || 'URL must be a non-empty ASCII HTTPS URL.');
  let url;
  try {
    url = baseUrl ? new URL(source, baseUrl) : new URL(source);
  } catch {
    throw new Error(message || 'URL must be a non-empty ASCII HTTPS URL.');
  }
  if (url.protocol !== 'https:' || !url.hostname) throw new Error(message || 'URL must use HTTPS.');
  return url.href;
}

function validateAppleCategory(category = {}) {
  const text = String(category.text || '').trim();
  const subcategory = String(category.subcategory || '').trim();
  if (!text) throw new Error('Podcast configuration error: category.text is required when dry_run is false.');
  if (!Object.prototype.hasOwnProperty.call(APPLE_PODCAST_CATEGORIES, text)) {
    throw new Error(`Podcast configuration error: category.text must exactly match an Apple Podcasts category; received ${text}.`);
  }
  if (subcategory && !APPLE_PODCAST_CATEGORIES[text].includes(subcategory)) {
    throw new Error(`Podcast configuration error: category.subcategory must be valid for ${text}; received ${subcategory}.`);
  }
}

function validateFeedConfig(config, siteUrl) {
  for (const field of ['title', 'description', 'author', 'email', 'language', 'image']) {
    if (!String(config[field] || '').trim()) throw new Error(`Podcast configuration error: ${field} is required when dry_run is false.`);
  }
  if (!/^\S+@\S+\.\S+$/.test(config.email)) throw new Error('Podcast configuration error: email must be a valid public contact address.');
  if (!Number.isSafeInteger(config.limit) || config.limit < 0) throw new Error('Podcast configuration error: limit must be a non-negative integer.');
  try {
    if (Intl.getCanonicalLocales(config.language).length !== 1) throw new Error('invalid language');
  } catch {
    throw new Error('Podcast configuration error: language must be a valid language tag.');
  }
  validateAppleCategory(config.category);
  resolveHttpsUrl(siteUrl, null, 'Podcast configuration error: site url must be an absolute ASCII HTTPS URL.');
  resolveHttpsUrl(config.path, siteUrl, 'Podcast configuration error: path must resolve to an ASCII HTTPS URL.');
  resolveHttpsUrl(config.link, siteUrl, 'Podcast configuration error: link must resolve to an ASCII HTTPS URL.');
  resolveHttpsUrl(config.image, siteUrl, 'Podcast configuration error: image must resolve to an ASCII HTTPS URL.');
}

function inspectArtworkBuffer(value, label = 'Artwork') {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= 26 && buffer.subarray(0, 8).equals(png) && buffer.subarray(12, 16).toString('ascii') === 'IHDR') {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const colorType = buffer[25];
    let alpha = colorType === 4 || colorType === 6;
    for (let offset = 8; offset + 12 <= buffer.length;) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
      if (type === 'tRNS') alpha = true;
      if (type === 'IDAT' || type === 'IEND' || offset + length + 12 > buffer.length) break;
      offset += length + 12;
    }
    return { format: 'PNG', width, height, alpha };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    for (let offset = 2; offset + 9 < buffer.length;) {
      while (buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset++];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { format: 'JPEG', height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5), alpha: false };
      }
      offset += length;
    }
  }
  throw new Error(`${label} must be a readable PNG or JPEG image.`);
}

function validateArtworkMetadata(metadata, label = 'Artwork') {
  if (metadata.width !== metadata.height) throw new Error(`${label} must be square; received ${metadata.width}x${metadata.height}.`);
  if (metadata.width < 1400 || metadata.width > 3000) throw new Error(`${label} must be 1400-3000px; received ${metadata.width}px.`);
  if (metadata.alpha) throw new Error(`${label} must not contain an alpha channel or PNG transparency.`);
}

function localArtworkPath(imageUrl, siteUrl, runtime) {
  if (!runtime || !runtime.baseDir) return null;
  const target = new URL(imageUrl);
  const site = new URL(siteUrl);
  if (target.origin !== site.origin) return null;
  const rootName = String(runtime.root || '/').replace(/^\/+|\/+$/g, '');
  const root = rootName ? `/${rootName}/` : '/';
  let pathname = decodeURIComponent(target.pathname);
  if (root !== '/') {
    if (!pathname.startsWith(root)) return null;
    pathname = pathname.slice(root.length);
  } else {
    pathname = pathname.replace(/^\/+/, '');
  }
  if (!pathname) return null;
  const sourceRoot = path.resolve(runtime.baseDir, runtime.sourceDir || 'source');
  const targetPath = path.resolve(sourceRoot, pathname);
  const relative = path.relative(sourceRoot, targetPath);
  return relative.startsWith('..') || path.isAbsolute(relative) ? null : targetPath;
}

async function validateLocalArtwork(imageUrl, siteUrl, runtime, label) {
  const file = localArtworkPath(imageUrl, siteUrl, runtime);
  if (!file) return;
  let source;
  try {
    source = await fs.readFile(file);
  } catch {
    throw new Error(`${label} must exist in the site source directory: ${file}.`);
  }
  validateArtworkMetadata(inspectArtworkBuffer(source, label), label);
}

async function validatePublicationArtwork(imageUrl, entries, siteUrl, runtime) {
  await validateLocalArtwork(imageUrl, siteUrl, runtime, 'Podcast channel artwork');
  await Promise.all(entries.filter(({ episode }) => episode.image)
    .map(({ episode }) => validateLocalArtwork(episode.image, siteUrl, runtime, 'Podcast episode artwork')));
}

function assertWellFormedXml(xml, label = 'Podcast RSS feed') {
  const parser = sax.parser(true, { trim: false, normalize: false });
  let failure;
  parser.onerror = error => { failure = error; parser.error = null; parser.resume(); };
  parser.write(String(xml)).close();
  if (failure) throw new Error(`${label} is not well-formed XML: ${failure.message}`);
}

function parseXmlDocument(xml, label = 'Podcast RSS feed') {
  const parser = sax.parser(true, { trim: false, normalize: false });
  let root = null;
  const stack = [];
  let failure;
  parser.onopentag = node => {
    const element = { name: node.name, attributes: { ...node.attributes }, children: [], text: '' };
    if (stack.length) stack[stack.length - 1].children.push(element);
    else root = element;
    stack.push(element);
  };
  const appendText = value => { if (stack.length) stack[stack.length - 1].text += value; };
  parser.ontext = appendText;
  parser.oncdata = appendText;
  parser.onclosetag = () => stack.pop();
  parser.onerror = error => { failure = error; parser.error = null; parser.resume(); };
  parser.write(String(xml)).close();
  if (failure || !root || stack.length) throw new Error(`${label} is not well-formed XML${failure ? `: ${failure.message}` : '.'}`);
  return root;
}

function childElements(node, name) {
  return (node.children || []).filter(child => child.name === name);
}

function childElement(node, name) {
  return childElements(node, name)[0] || null;
}

function elementText(node) {
  return String(node && node.text || '').trim();
}

module.exports = {
  APPLE_PODCAST_CATEGORIES,
  assertWellFormedXml,
  childElement,
  childElements,
  elementText,
  inspectArtworkBuffer,
  parseXmlDocument,
  resolveHttpsUrl,
  validateAppleCategory,
  validateArtworkMetadata,
  validateFeedConfig,
  validatePublicationArtwork
};
