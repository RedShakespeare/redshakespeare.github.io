'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MARKER = 'hexo-sil-podcast-inside';
const root = path.resolve(__dirname, '..');
const themeSource = path.join(root, 'node_modules', 'hexo-theme-inside', 'source');

function warn(message) {
  console.warn(`[${MARKER}] ${message} Podcasts will use the tag archive fallback.`);
}

function replaceOnce(source, before, after, filename) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one compatible anchor in ${filename}, found ${count}.`);
  return source.replace(before, after);
}

function apply() {
  if (!fs.existsSync(themeSource)) {
    warn('Inside theme was not found;');
    return;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(themeSource, '_manifest.json'), 'utf8'));
    const main = manifest.scripts && manifest.scripts.find(file => file.startsWith('main.'));
    if (!main) throw new Error('Inside browser bundle was not found.');

    const mainFile = path.join(themeSource, main);
    const ssrFile = path.join(themeSource, '_ssr.js');
    const mainSource = fs.readFileSync(mainFile, 'utf8');
    const ssrSource = fs.readFileSync(ssrFile, 'utf8');
    if (mainSource.includes(MARKER) && ssrSource.includes(MARKER)) return;

    const patchedMain = replaceOnce(
      replaceOnce(
        mainSource,
        'function Fy(t,e){if(1&t&&ko(0,"is-h",4),2&t){const t=Do().ngIf,e=Do();wo("size",t.postList.per_page)("count",t.postList.total)("current",t.postList.current)("indexUrl","page"===e.app.config.index?"":"page/1")}}',
        'function Fy(t,e){if(1&t&&ko(0,"is-h",4),2&t){const t=Do().ngIf,e=Do(),n="podcasts"===e.route.snapshot.routeConfig.path?"podcasts":"page";wo("size",t.postList.per_page)("count",t.postList.total)("current",t.postList.current)("url",n)("indexUrl","podcasts"===n?"podcasts":"page"===e.app.config.index?"":"page/1")}}',
        main
      ),
      'const Mv=[{path:"page/:page",component:$y,resolve:{postList:bg},data:{id:"posts"}},',
      'const Mv=[/* hexo-sil-podcast-inside */{path:"podcasts",component:$y,resolve:{postList:bg},data:{id:"podcasts"}},{path:"podcasts/:page",component:$y,resolve:{postList:bg},data:{id:"podcasts"}},{path:"page/:page",component:$y,resolve:{postList:bg},data:{id:"posts"}},',
      main
    );
    const patchedSsr = replaceOnce(
      replaceOnce(
        ssrSource,
        '("current",it_r1.postList.current)("indexUrl","page"===ctx_r3.app.config.index?"":"page/1")',
        '("current",it_r1.postList.current)("url","podcasts"===ctx_r3.route.snapshot.routeConfig.path?"podcasts":"page")("indexUrl","podcasts"===ctx_r3.route.snapshot.routeConfig.path?"podcasts":"page"===ctx_r3.app.config.index?"":"page/1")',
        '_ssr.js'
      ),
      'const routes=[{path:"page/:page",component:VPostListComponent,resolve:{postList:DataResolver},data:{id:"posts"}},',
      'const routes=[/* hexo-sil-podcast-inside */{path:"podcasts",component:VPostListComponent,resolve:{postList:DataResolver},data:{id:"podcasts"}},{path:"podcasts/:page",component:VPostListComponent,resolve:{postList:DataResolver},data:{id:"podcasts"}},{path:"page/:page",component:VPostListComponent,resolve:{postList:DataResolver},data:{id:"posts"}},',
      '_ssr.js'
    );

    fs.writeFileSync(mainFile, patchedMain);
    fs.writeFileSync(ssrFile, patchedSsr);
    console.log(`[${MARKER}] Applied the optional Inside route patch.`);
  } catch (error) {
    warn(`${error.message} No theme files were changed.`);
  }
}

apply();
