'use strict';

const VIDEO_MIME_TYPES = new Map([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.ogv', 'video/ogg'],
  ['.ogg', 'video/ogg'],
  ['.mpeg', 'video/mpeg'],
  ['.mpg', 'video/mpeg']
]);

const SUBTITLE_MIME_TYPES = new Map([
  ['.ass', new Set(['text/x-ssa', 'text/x-ssa; charset=utf-8', 'text/plain', 'text/plain; charset=utf-8'])],
  ['.srt', new Set(['application/x-subrip', 'application/x-subrip; charset=utf-8', 'text/plain', 'text/plain; charset=utf-8'])]
]);

const FONT_MIME_TYPES = new Map([
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf']
]);

const POSTER_MIME_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp']
]);

module.exports = {
  FONT_MIME_TYPES,
  POSTER_MIME_TYPES,
  SUBTITLE_MIME_TYPES,
  VIDEO_MIME_TYPES
};
