'use strict';

const fs = require('fs');
const path = require('path');
const { generateTree } = require('../tools/hxh-tree');

// 生成器：让 Hexo 直接把 tree.json 输出到 public/
hexo.extend.generator.register('hxh_tree_json', function () {
  const rootAbs = path.join(hexo.base_dir, 'source', 'files', 'hxh_civ');
  if (!fs.existsSync(rootAbs)) return [];
  const tree = generateTree(rootAbs);

  return [
    {
      path: 'files/hxh_civ/tree.json',
      data: JSON.stringify(tree, null, 2),
    },
  ];
});
