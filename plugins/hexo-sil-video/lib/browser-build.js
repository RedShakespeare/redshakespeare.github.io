'use strict';

const crypto = require('node:crypto');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

function serialiseInlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function createBrowserBuild({ pluginDir, routes }) {
  async function buildBrowserBundle(entryPoint, format) {
    const esbuild = require('esbuild');
    const result = await esbuild.build({
      entryPoints: [entryPoint],
      outfile: 'bundle.js',
      bundle: true,
      write: false,
      format,
      platform: 'browser',
      target: ['es2020'],
      minify: true,
      legalComments: 'eof'
    });
    return Buffer.from(result.outputFiles[0].contents);
  }

  async function buildBrowserArtifacts(entryPoint, format = 'iife', outputName = 'bundle.js') {
    const esbuild = require('esbuild');
    const result = await esbuild.build({
      entryPoints: [entryPoint],
      outfile: outputName,
      bundle: true,
      write: false,
      format,
      platform: 'browser',
      target: ['es2020'],
      minify: true,
      legalComments: 'eof',
      sourcemap: 'external',
      sourcesContent: true,
      sourceRoot: ''
    });
    const js = result.outputFiles.find(file => file.path.endsWith('.js'));
    const map = result.outputFiles.find(file => file.path.endsWith('.js.map'));
    return {
      js: Buffer.from(`${Buffer.from(js.contents).toString('utf8')}\n//# sourceMappingURL=${path.basename(outputName)}.map\n`),
      map: map ? Buffer.from(map.contents) : null
    };
  }

  async function runtimeRouteArtifacts() {
    const jassubRoot = path.dirname(require.resolve('jassub/package.json'));
    const core = await buildBrowserArtifacts(path.join(pluginDir, 'runtime', 'player.js'), 'iife', path.basename(routes.script));
    const subtitles = await buildBrowserArtifacts(path.join(pluginDir, 'runtime', 'subtitles.js'), 'esm', path.basename(routes.subtitles));
    const worker = await buildBrowserArtifacts(path.join(jassubRoot, 'dist', 'worker', 'worker.js'), 'esm', path.basename(routes.worker));
    return [
      { path: routes.script, data: core.js },
      { path: `${routes.script}.map`, data: core.map, internal: true },
      { path: routes.subtitles, data: subtitles.js },
      { path: `${routes.subtitles}.map`, data: subtitles.map, internal: true },
      { path: routes.worker, data: worker.js },
      { path: `${routes.worker}.map`, data: worker.map, internal: true }
    ];
  }

  async function runtimeRouteData() {
    const jassubRoot = path.dirname(require.resolve('jassub/package.json'));
    return [
      ...await runtimeRouteArtifacts(),
      { path: routes.wasm, data: await fs.readFile(path.join(jassubRoot, 'dist', 'wasm', 'jassub-worker.wasm')) },
      { path: routes.modernWasm, data: await fs.readFile(path.join(jassubRoot, 'dist', 'wasm', 'jassub-worker-modern.wasm')) },
      { path: routes.defaultFont, data: await fs.readFile(path.join(jassubRoot, 'dist', 'default.woff2')) }
    ];
  }

  function renderBootstrapScript({ styles = [], script }) {
    const config = serialiseInlineJson({ styles, script });
    const source = fsSync.readFileSync(path.join(pluginDir, 'runtime', 'bootstrap.js'), 'utf8');
    let output = source;
    try {
      const esbuild = require('esbuild');
      output = esbuild.transformSync(source, {
        define: { __SIL_VIDEO_BOOTSTRAP_CONFIG__: config },
        minify: true,
        target: 'es2020',
        legalComments: 'none'
      }).code.trim();
    } catch {
      output = source.replace('__SIL_VIDEO_BOOTSTRAP_CONFIG__', config);
    }
    return `<script>${output}</script>`;
  }

  function bootstrapCspHash(options) {
    const html = renderBootstrapScript(options);
    const body = html.replace(/^<script>|<\/script>$/g, '');
    return `sha256-${crypto.createHash('sha256').update(body).digest('base64')}`;
  }

  return {
    bootstrapCspHash,
    buildBrowserArtifacts,
    buildBrowserBundle,
    renderBootstrapScript,
    runtimeRouteArtifacts,
    runtimeRouteData
  };
}

module.exports = { createBrowserBuild };
