'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const playerState = require('./lib/player-state');
const { createBrowserBuild } = require('./lib/browser-build');
const { createRenderer, mergeVideo, parseVideoTagArgs } = require('./lib/render');
const { createVideoConfig } = require('./lib/config');
const { createVideoModel } = require('./lib/model');
const { createVideoDemandRegistry } = require('./lib/video-demand');

const PLAYER_START = '<!-- hexo-sil-video:start -->';
const PLAYER_END = '<!-- hexo-sil-video:end -->';
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
const BUILTIN_SKINS = Object.freeze({
  ephesus: Object.freeze({
    outputPath: 'css/hexo-sil-video.css',
    sourcePath: path.join(__dirname, 'skins', 'ephesus.css')
  })
});
const RUNTIME_ROUTES = Object.freeze({
  script: 'js/hexo-sil-video.js',
  subtitles: 'js/hexo-sil-video-subtitles.js',
  worker: 'js/hexo-sil-video-worker.js',
  wasm: 'wasm/hexo-sil-video.wasm',
  modernWasm: 'wasm/hexo-sil-video-modern.wasm',
  defaultFont: 'fonts/hexo-sil-video-default.woff2'
});
const {
  bootstrapCspHash,
  buildBrowserArtifacts,
  buildBrowserBundle,
  renderBootstrapScript,
  runtimeRouteArtifacts,
  runtimeRouteData
} = createBrowserBuild({ pluginDir: __dirname, routes: RUNTIME_ROUTES });
const { renderVideoPlayer } = createRenderer({ playerStart: PLAYER_START, playerEnd: PLAYER_END });
const {
  isObject,
  mediaFileUrl,
  normaliseHttpsUrl,
  normaliseRelativeFile,
  rootPublicPath,
  runtimeOptions,
  toVideoConfig
} = createVideoConfig({ builtinSkins: BUILTIN_SKINS, fontMimeTypes: FONT_MIME_TYPES, runtimeRoutes: RUNTIME_ROUTES });
const { normaliseVideo } = createVideoModel({
  fontMimeTypes: FONT_MIME_TYPES,
  posterMimeTypes: POSTER_MIME_TYPES,
  subtitleMimeTypes: SUBTITLE_MIME_TYPES,
  videoMimeTypes: VIDEO_MIME_TYPES,
  isObject,
  mediaFileUrl,
  normaliseHttpsUrl,
  normaliseRelativeFile,
  rootPublicPath,
  runtimeOptions
});

function registerVideoPlugin(hexo) {
  const config = toVideoConfig(hexo.config);
  let warnedMissingAssets = false;
  const demand = createVideoDemandRegistry();
  const runtime = {
    baseDir: hexo.base_dir || process.cwd(),
    sourceRoot: hexo.source_dir || path.join(hexo.base_dir || process.cwd(), hexo.config.source_dir || 'source'),
    root: hexo.config.root || '/',
    assetsEnabled: config.assets.enabled,
    getAssetCapability: () => hexo.sil && hexo.sil.assets,
    onMissingAssets: () => {
      if (warnedMissingAssets) return;
      warnedMissingAssets = true;
      if (hexo.log && hexo.log.warn) hexo.log.warn('hexo-sil-video: assets integration is enabled but hexo-sil-assets is not installed; using legacy local files.');
    },
    media: config.media,
    preload: config.preload,
    aspectRatio: config.aspectRatio,
    subtitles: config.subtitles,
    routes: RUNTIME_ROUTES
  };
  const styles = [];
  if (config.skin.builtin) {
    const skin = BUILTIN_SKINS[config.skin.builtin];
    hexo.extend.generator.register('hexo-sil-video-skin', async () => {
      if (!demand.hasDemand()) return [];
      return { path: skin.outputPath, data: await fs.readFile(skin.sourcePath) };
    });
    styles.push(rootPublicPath(runtime.root, skin.outputPath));
  }
  if (config.skin.override) styles.push(rootPublicPath(runtime.root, config.skin.override));
  hexo.extend.generator.register('hexo-sil-video-runtime', async () => {
    if (!demand.hasDemand()) return [];
    return runtimeRouteData();
  });
  hexo.extend.injector.register('body_end', renderBootstrapScript({
    styles,
    script: rootPublicPath(runtime.root, RUNTIME_ROUTES.script)
  }));
  hexo.extend.tag.register('video', async function (args) {
    const output = renderVideoPlayer(await normaliseVideo(this, mergeVideo(this.video, parseVideoTagArgs(args)), runtime));
    demand.mark();
    return output;
  }, { async: true });
  hexo.extend.filter.register('before_generate', () => {
    demand.reset();
    for (const name of ['Post', 'Page']) demand.seed(hexo.model?.(name)?.toArray?.() || []);
  }, 0);
  hexo.extend.filter.register('after_post_render', async function (data) {
    if (!data) return data;
    if (String(data.content || '').includes(PLAYER_START)) {
      demand.mark();
      return data;
    }
    if (data.video === undefined || data.video === false) return data;
    data.content = `${renderVideoPlayer(await normaliseVideo(data, data.video, runtime))}\n\n${data.content || ''}`;
    demand.mark();
    return data;
  });
}

module.exports = {
  BUILTIN_SKINS,
  FONT_MIME_TYPES,
  PLAYER_END,
  PLAYER_START,
  RUNTIME_ROUTES,
  SUBTITLE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  ...playerState,
  buildBrowserBundle,
  buildBrowserArtifacts,
  bootstrapCspHash,
  mediaFileUrl,
  mergeVideo,
  normaliseVideo,
  parseVideoTagArgs,
  registerVideoPlugin,
  renderBootstrapScript,
  renderVideoPlayer,
  rootPublicPath,
  runtimeRouteData,
  runtimeRouteArtifacts,
  toVideoConfig
};
