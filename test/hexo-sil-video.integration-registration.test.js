'use strict';

const {
  assert,
  createVideoDemandRegistry,
  mockHexo,
  path,
  post,
  registerVideoPlugin,
  RUNTIME_ROUTES,
  test,
  videoData
} = require('./helpers/hexo-sil-video-fixture');

test('video demand registry seeds cached Front Matter and raw video tags per generation', () => {
  const demand = createVideoDemandRegistry();
  demand.seed([{ video: { file: 'demo.mp4' } }]);
  assert.equal(demand.hasDemand(), true);
  demand.reset();
  demand.seed([{ _content: '正文 {% video file=demo.mp4 %}' }]);
  assert.equal(demand.hasDemand(), true);
  demand.reset();
  demand.seed([{ _content: '```nunjucks\n{% video file=demo.mp4 %}\n```\n<!-- {% video file=demo.mp4 %} -->' }]);
  assert.equal(demand.hasDemand(), false);
  demand.seed([{ _content: '正文\n<!--\n{% video file=commented.mp4 %}\n-->\n~~~html\n{% video file=fenced.mp4 %}\n~~~' }]);
  assert.equal(demand.hasDemand(), false);
  demand.seed([{ _content: '<!-- ignored --> 正文 {% video file=visible.mp4 %}' }]);
  assert.equal(demand.hasDemand(), true);
});
test('plugin registers skin, runtime assets, tag, and duplicate-safe post injection', async () => {
  const hexo = mockHexo();
  registerVideoPlugin(hexo);
  assert.deepEqual(hexo.calls.generators.map(call => call.name), ['hexo-sil-video-skin', 'hexo-sil-video-runtime']);
  assert.deepEqual(hexo.calls.filters.map(call => call.name), ['before_generate', 'after_post_render']);
  assert.deepEqual(hexo.calls.injectors.map(call => call.position), ['body_end']);
  assert.match(hexo.calls.injectors[0].value, /^<script>[\s\S]+<\/script>$/);
  assert.match(hexo.calls.injectors[0].value, /\/css\/hexo-sil-video\.css/);
  assert.match(hexo.calls.injectors[0].value, /\/js\/hexo-sil-video\.js/);
  assert.doesNotMatch(hexo.calls.injectors[0].value, /<link rel="stylesheet"/);
  assert.equal(hexo.calls.tags[0].name, 'video');
  assert.equal(hexo.calls.tags[0].options.async, true);
  assert.deepEqual(await hexo.calls.generators[0].fn(), []);
  assert.deepEqual(await hexo.calls.generators[1].fn(), []);
  const article = post({ video: videoData(), content: '<p>Body</p>' });
  const renderFilter = hexo.calls.filters.find(call => call.name === 'after_post_render').fn;
  await renderFilter(article);
  assert.match(article.content, /^<!-- hexo-sil-video:start -->/);
  assert.match(article.content, /<p>Body<\/p>$/);
  await renderFilter(article);
  assert.equal((article.content.match(/hexo-sil-video:start/g) || []).length, 1);

  const routes = await hexo.calls.generators[1].fn();
  assert.deepEqual(routes.filter(route => !route.internal).map(route => route.path), Object.values(RUNTIME_ROUTES));
  assert.deepEqual(routes.filter(route => route.internal).map(route => route.path), [
    `${RUNTIME_ROUTES.script}.map`,
    `${RUNTIME_ROUTES.subtitles}.map`,
    `${RUNTIME_ROUTES.worker}.map`
  ]);
  assert.ok(routes.every(route => route.data.length > 0));
  hexo.model = name => ({ toArray: () => name === 'Post' ? [{ video: videoData() }] : [] });
  hexo.calls.filters.find(call => call.name === 'before_generate').fn();
  assert.ok((await hexo.calls.generators[1].fn()).length > 0);
  hexo.model = undefined;
  hexo.calls.filters.find(call => call.name === 'before_generate').fn();
  assert.deepEqual(await hexo.calls.generators[0].fn(), []);
  assert.deepEqual(await hexo.calls.generators[1].fn(), []);

  const tagHexo = mockHexo();
  registerVideoPlugin(tagHexo);
  await tagHexo.calls.tags[0].fn.call(post({ video: videoData() }), []);
  assert.ok((await tagHexo.calls.generators[1].fn()).length > 0);
});
