'use strict';

const { assert, path, RUNTIME_ROUTES, runtimeRouteData, test } = require('./helpers/hexo-sil-video-fixture');

test('runtime route builder emits split core/subtitle bundles, module worker, WASM variants, and fallback font', async () => {
  const routes = await runtimeRouteData();
  const sizes = Object.fromEntries(routes.map(route => [route.path, route.data.length]));
  const budgets = {
    [RUNTIME_ROUTES.script]: 36000,
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
    assert.ok(sourceMap.sourcesContent.length > 0);
    assert.equal(sourceMap.sources.some(source => path.isAbsolute(source)), false);
  }
});
