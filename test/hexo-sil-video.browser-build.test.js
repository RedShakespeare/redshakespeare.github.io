'use strict';

const { assert, path, resetRuntimeCache, RUNTIME_ROUTES, runtimeRouteData, test } = require('./helpers/hexo-sil-video-fixture');
const { createBrowserBuild } = require('../plugins/hexo-sil-video/lib/browser-build');

test('runtime route builder emits split core/subtitle bundles, module worker, WASM variants, and fallback font', async () => {
  const routes = await runtimeRouteData();
  const sizes = Object.fromEntries(routes.map(route => [route.path, route.data.length]));
  const budgets = {
    [RUNTIME_ROUTES.script]: 39000,
    [RUNTIME_ROUTES.subtitles]: 42000,
    [RUNTIME_ROUTES.worker]: 130000,
    [RUNTIME_ROUTES.wasm]: 2300000,
    [RUNTIME_ROUTES.modernWasm]: 2400000,
    [RUNTIME_ROUTES.defaultFont]: 180000
  };
  assert.ok(routes.every(route => Buffer.isBuffer(route.data)));
  assert.doesNotMatch(routes[0].data.subarray(0, 24).toString('utf8'), /^\{"0":/);
  assert.ok(sizes[RUNTIME_ROUTES.script] > 10000);
  assert.ok(sizes[RUNTIME_ROUTES.subtitles] > 10000);
  assert.equal(routes.find(route => route.path === RUNTIME_ROUTES.script).data.includes(Buffer.from('JASSUB')), false);
  assert.equal(routes.find(route => route.path === RUNTIME_ROUTES.script).data.includes(Buffer.from('import(')), true);
  assert.ok(sizes[RUNTIME_ROUTES.worker] > 10000);
  assert.ok(sizes[RUNTIME_ROUTES.wasm] > 1000000);
  assert.ok(sizes[RUNTIME_ROUTES.modernWasm] > 1000000);
  assert.ok(sizes[RUNTIME_ROUTES.defaultFont] > 10000);
  for (const [route, budget] of Object.entries(budgets)) assert.ok(sizes[route] <= budget, `${route} exceeds ${budget} bytes`);
  for (const route of [RUNTIME_ROUTES.script, RUNTIME_ROUTES.subtitles, RUNTIME_ROUTES.worker]) {
    const script = routes.find(entry => entry.path === route).data.toString('utf8');
    const mapRoute = routes.find(entry => entry.path === `${route}.map`);
    assert.equal(mapRoute.internal, true);
    assert.match(script, new RegExp(`sourceMappingURL=${path.basename(route).replace(/\./g, '\\.') }\\.map`));
    const sourceMap = JSON.parse(mapRoute.data.toString('utf8'));
    assert.equal(sourceMap.sourcesContent, undefined);
    assert.equal(sourceMap.sources.some(source => path.isAbsolute(source)), false);
  }
});

test('runtime route cache returns defensive copies and resets between generations', async () => {
  const first = await runtimeRouteData();
  first[0].path = 'mutated.js';
  const cached = await runtimeRouteData();
  assert.equal(cached[0].path, RUNTIME_ROUTES.script);
  assert.notEqual(cached[0], first[0]);
  assert.notEqual(cached[0].data, first[0].data);

  resetRuntimeCache();
  const rebuilt = await runtimeRouteData();
  assert.deepEqual(rebuilt.map(entry => entry.path), cached.map(entry => entry.path));
  assert.notEqual(rebuilt[0], cached[0]);
  assert.notEqual(rebuilt[0].data, cached[0].data);
});

test('runtime artifact reset causes a real rebuild rather than only new wrappers', async () => {
  let builds = 0;
  const fakeEsbuild = {
    build(options) {
      builds += 1;
      const jsPath = options.outfile || 'bundle.js';
      return Promise.resolve({ outputFiles: [
        { path: jsPath, contents: Buffer.from(`build-${builds}`) },
        { path: `${jsPath}.map`, contents: Buffer.from('{}') }
      ] });
    },
    transformSync() { return { code: 'bootstrap' }; }
  };
  const builder = createBrowserBuild({
    pluginDir: require('node:path').join(__dirname, '..', 'plugins', 'hexo-sil-video'),
    routes: { script: 'core.js', subtitles: 'subtitles.js', worker: 'worker.js', wasm: 'worker.wasm', modernWasm: 'modern.wasm', defaultFont: 'font.woff2' },
    esbuildRef: fakeEsbuild
  });
  await builder.runtimeRouteArtifacts();
  await builder.runtimeRouteArtifacts();
  assert.equal(builds, 3);
  builder.resetRuntimeCache();
  await builder.runtimeRouteArtifacts();
  assert.equal(builds, 6);
});
