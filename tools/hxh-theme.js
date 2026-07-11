'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DEFAULT_SITE_URL = 'https://www.ephesus.top/';
const DEFAULT_APPEARANCE = Object.freeze({
  accentColor: '#2a2b33',
  foregroundColor: '#363636',
  borderColor: '#e0e0e0',
  background: '#f3f6f7',
  sidebarBackground: '#2a2b33',
  cardBackground: '#ffffff',
  contentWidth: '660px',
  font: {
    url: '',
    base: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    logo: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    menu: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    label: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    code: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    print: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  },
});

const DEFAULT_DARK_APPEARANCE = Object.freeze({
  accentColor: '#2a2b33',
  foregroundColor: '#adbac7',
  borderColor: '#373e47',
  background: '#22272e',
  sidebarBackground: '#22272e',
  cardBackground: '#2d333b',
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeColor(value, fallback) {
  const color = stringOr(value, fallback);
  return /^[0-9a-f]{3,8}$/i.test(color) ? `#${color}` : color;
}

function normalizeSiteUrl(value) {
  try {
    const url = new URL(stringOr(value, DEFAULT_SITE_URL));
    if (url.protocol === 'http:') url.protocol = 'https:';
    url.pathname = url.pathname.replace(/\/?$/, '/');
    return url.toString();
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function absoluteUrl(value, siteUrl, fallback = '') {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return new URL(value, siteUrl).toString();
  } catch {
    return fallback;
  }
}

function loadYaml(filePath) {
  const value = yaml.load(fs.readFileSync(filePath, 'utf8'));
  return isObject(value) ? value : {};
}

function resolveFonts(configured) {
  const font = isObject(configured) ? configured : {};
  const base = stringOr(font.base, DEFAULT_APPEARANCE.font.base);
  return {
    url: stringOr(font.url, ''),
    base,
    logo: stringOr(font.logo, DEFAULT_APPEARANCE.font.logo),
    menu: stringOr(font.menu, base),
    label: stringOr(font.label, base),
    heading: stringOr(font.heading, base),
    code: stringOr(font.code, DEFAULT_APPEARANCE.font.code),
    print: stringOr(font.print, DEFAULT_APPEARANCE.font.print),
  };
}

function resolveAppearance(configured) {
  const appearance = isObject(configured) ? configured : {};
  const dark = isObject(appearance.darkmode) ? appearance.darkmode : {};
  const base = {
    accentColor: normalizeColor(appearance.accent_color, DEFAULT_APPEARANCE.accentColor),
    foregroundColor: stringOr(appearance.foreground_color, DEFAULT_APPEARANCE.foregroundColor),
    borderColor: stringOr(appearance.border_color, DEFAULT_APPEARANCE.borderColor),
    background: stringOr(appearance.background, DEFAULT_APPEARANCE.background),
    sidebarBackground: stringOr(appearance.sidebar_background, ''),
    cardBackground: stringOr(appearance.card_background, DEFAULT_APPEARANCE.cardBackground),
    contentWidth: stringOr(appearance.content_width, DEFAULT_APPEARANCE.contentWidth),
    font: resolveFonts(appearance.font),
  };
  base.sidebarBackground ||= base.accentColor;

  return {
    default: base,
    dark: {
      accentColor: normalizeColor(dark.accent_color, base.accentColor),
      foregroundColor: stringOr(dark.foreground_color, DEFAULT_DARK_APPEARANCE.foregroundColor),
      borderColor: stringOr(dark.border_color, DEFAULT_DARK_APPEARANCE.borderColor),
      background: stringOr(dark.background, DEFAULT_DARK_APPEARANCE.background),
      sidebarBackground: stringOr(dark.sidebar_background, DEFAULT_DARK_APPEARANCE.sidebarBackground),
      cardBackground: stringOr(dark.card_background, DEFAULT_DARK_APPEARANCE.cardBackground),
      contentWidth: base.contentWidth,
      font: base.font,
    },
  };
}

function resolveMenu(value, siteUrl) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!isObject(item)) return [];
      const label = stringOr(item.label || item.title, '');
      const url = absoluteUrl(item.url, siteUrl);
      return label && url ? [{ label, url }] : [];
    });
  }
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([label, url]) => {
    const target = absoluteUrl(url, siteUrl);
    return label && target ? [{ label, url: target }] : [];
  });
}

function resolveSns(value, siteUrl, email) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const title = stringOr(item.title, '');
    let url = stringOr(item.url, '');
    if (!url && item.icon === 'feed') url = 'atom.xml';
    if (!url && item.icon === 'email' && email) url = `mailto:${email}`;
    const target = absoluteUrl(url, siteUrl);
    return title && target ? [{
      title,
      url: target,
      icon: stringOr(item.icon, ''),
      template: stringOr(item.template, ''),
    }] : [];
  });
}

function generateHxhTheme({ root = process.cwd() } = {}) {
  const site = loadYaml(path.join(root, '_config.yml'));
  const theme = loadYaml(path.join(root, '_config.inside.yml'));
  const profile = isObject(theme.profile) ? theme.profile : {};
  const siteUrl = normalizeSiteUrl(site.url);
  const email = stringOr(profile.email || site.email, '');
  const avatar = absoluteUrl(stringOr(profile.avatar, 'avatar.jpg'), siteUrl, `${siteUrl}avatar.jpg`);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    site: {
      title: stringOr(site.title, 'Ephesus'),
      author: stringOr(site.author, ''),
      url: siteUrl,
      language: stringOr(site.language, 'en'),
    },
    profile: {
      avatar,
      bio: stringOr(profile.bio, ''),
    },
    appearance: resolveAppearance(theme.appearance),
    menu: resolveMenu(theme.menu, siteUrl),
    sns: resolveSns(theme.sns, siteUrl, email),
    footer: {
      copyright: stringOr(isObject(theme.footer) ? theme.footer.copyright : '', ''),
    },
  };
}

function writeHxhTheme(outputPath, options) {
  fs.writeFileSync(outputPath, `${JSON.stringify(generateHxhTheme(options), null, 2)}\n`);
}

function main() {
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex === -1 || !process.argv[outputIndex + 1]) {
    console.error('Usage: node tools/hxh-theme.js --output <path>');
    process.exit(1);
  }
  writeHxhTheme(process.argv[outputIndex + 1]);
}

if (require.main === module) main();

module.exports = {
  DEFAULT_APPEARANCE,
  DEFAULT_DARK_APPEARANCE,
  generateHxhTheme,
  resolveAppearance,
  writeHxhTheme,
};
