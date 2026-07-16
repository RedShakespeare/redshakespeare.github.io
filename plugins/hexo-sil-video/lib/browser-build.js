'use strict';

const crypto = require('node:crypto');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

function serialiseInlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function createBrowserBuild({ pluginDir, routes, esbuildRef = require('esbuild') }) {
  const bootstrapSource = fsSync.readFileSync(path.join(pluginDir, 'runtime', 'bootstrap.js'), 'utf8');
  let runtimeArtifactsPromise = null;
  let runtimeRouteDataPromise = null;
  const esbuild = esbuildRef;

  function cloneRoutes(entries, cloneData = true) {
    return entries.map(entry => ({ ...entry, data: cloneData ? Buffer.from(entry.data) : entry.data }));
  }

  function buildOptions(entryPoint, format, outputName, sourcemap = false) {
    return {
      entryPoints: [entryPoint],
      ...(outputName ? { outfile: outputName } : {}),
      bundle: true,
      write: false,
      format,
      platform: 'browser',
      target: ['es2020'],
      minify: true,
      legalComments: 'eof',
      ...(sourcemap ? { sourcemap: 'external', sourcesContent: true, sourceRoot: '' } : {})
    };
  }

  async function runEsbuild(entryPoint, { format, outputName, sourcemap = false }) {
    return esbuild.build(buildOptions(entryPoint, format, outputName, sourcemap));
  }

  async function buildBrowserBundle(entryPoint, format) {
    const result = await runEsbuild(entryPoint, { format, outputName: 'bundle.js' });
    return Buffer.from(result.outputFiles[0].contents);
  }

  async function buildBrowserArtifacts(entryPoint, format = 'iife', outputName = 'bundle.js') {
    const result = await runEsbuild(entryPoint, { format, outputName, sourcemap: true });
    const js = result.outputFiles.find(file => file.path.endsWith('.js'));
    const map = result.outputFiles.find(file => file.path.endsWith('.js.map'));
    return {
      js: Buffer.from(`${Buffer.from(js.contents).toString('utf8')}\n//# sourceMappingURL=${path.basename(outputName)}.map\n`),
      map: map ? Buffer.from(map.contents) : null
    };
  }

  async function runtimeRouteArtifacts() {
    if (runtimeArtifactsPromise) return cloneRoutes(await runtimeArtifactsPromise);
    const jassubRoot = path.dirname(require.resolve('jassub/package.json'));
    runtimeArtifactsPromise = Promise.all([
      buildBrowserArtifacts(path.join(pluginDir, 'runtime', 'browser-entry.js'), 'iife', path.basename(routes.script)),
      buildBrowserArtifacts(path.join(pluginDir, 'runtime', 'subtitles.js'), 'esm', path.basename(routes.subtitles)),
      buildBrowserArtifacts(path.join(jassubRoot, 'dist', 'worker', 'worker.js'), 'esm', path.basename(routes.worker))
    ]).then(([core, subtitles, worker]) => [
      { path: routes.script, data: core.js },
      { path: `${routes.script}.map`, data: core.map, internal: true },
      { path: routes.subtitles, data: subtitles.js },
      { path: `${routes.subtitles}.map`, data: subtitles.map, internal: true },
      { path: routes.worker, data: worker.js },
      { path: `${routes.worker}.map`, data: worker.map, internal: true }
    ]).catch(error => {
      runtimeArtifactsPromise = null;
      throw error;
    });
    return cloneRoutes(await runtimeArtifactsPromise);
  }

  async function runtimeRouteData({ clone = true } = {}) {
    if (runtimeRouteDataPromise) return cloneRoutes(await runtimeRouteDataPromise, clone);
    if (!runtimeArtifactsPromise) await runtimeRouteArtifacts();
    const jassubRoot = path.dirname(require.resolve('jassub/package.json'));
    runtimeRouteDataPromise = Promise.all([
      ...await runtimeArtifactsPromise,
      { path: routes.wasm, data: fs.readFile(path.join(jassubRoot, 'dist', 'wasm', 'jassub-worker.wasm')) },
      { path: routes.modernWasm, data: fs.readFile(path.join(jassubRoot, 'dist', 'wasm', 'jassub-worker-modern.wasm')) },
      { path: routes.defaultFont, data: fs.readFile(path.join(jassubRoot, 'dist', 'default.woff2')) }
    ]).then(entries => Promise.all(entries.map(async entry => ({ ...entry, data: await entry.data })))).catch(error => {
      runtimeRouteDataPromise = null;
      throw error;
    });
    return cloneRoutes(await runtimeRouteDataPromise, clone);
  }

  function resetRuntimeCache() {
    runtimeArtifactsPromise = null;
    runtimeRouteDataPromise = null;
  }

  function renderBootstrapScript({ styles = [], script }) {
    const config = serialiseInlineJson({ styles, script });
    const output = esbuild.transformSync(bootstrapSource, {
      define: { __SIL_VIDEO_BOOTSTRAP_CONFIG__: config },
      minify: true,
      target: 'es2020',
      legalComments: 'none'
    }).code.trim();
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
    resetRuntimeCache,
    runtimeRouteArtifacts,
    runtimeRouteData
  };
}

module.exports = { createBrowserBuild };
