'use strict';

// hexo-theme-inside generates its own sitemap.xml, whose entries include
// unrendered static pages. Keep the configured hexo-generator-sitemap output
// (ep-sitemap.xml) as the site's single authoritative sitemap instead.
hexo.extend.filter.register('before_generate', function () {
  const inside = hexo.extend.generator.get('inside');
  if (!inside) return;

  hexo.extend.generator.register('inside', async function (locals) {
    const routes = await inside.call(this, locals);
    return routes.filter(route => route?.path !== 'sitemap.xml');
  });
});
