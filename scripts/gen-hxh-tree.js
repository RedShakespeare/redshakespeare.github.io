'use strict';

const fs = require('fs');
const path = require('path');

function shouldIgnore(name) {
  if (name === 'tree.json') return true;
  if (name === 'index.html') return true;
  if (name === '.DS_Store' || name === 'Thumbs.db') return true;
  if (name.startsWith('.')) return true; // 忽略隐藏文件/目录
  return false;
}

function walk(dirAbs, relBase) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });

  const children = [];
  for (const ent of entries) {
    if (shouldIgnore(ent.name)) continue;

    const abs = path.join(dirAbs, ent.name);
    const rel = relBase ? (relBase + '/' + ent.name) : ent.name;

    if (ent.isDirectory()) {
      children.push({
        type: 'dir',
        name: ent.name,
        rel,
        children: walk(abs, rel),
      });
    } else if (ent.isFile()) {
      const st = fs.statSync(abs);
      children.push({
        type: 'file',
        name: ent.name,
        rel,
        size: st.size,
        mtime: st.mtimeMs,
      });
    }
  }
  return children;
}

// 生成器：让 Hexo 直接把 tree.json 输出到 public/
hexo.extend.generator.register('hxh_tree_json', function () {
  const rootAbs = path.join(hexo.base_dir, 'source', 'files', 'hxh_civ');
  if (!fs.existsSync(rootAbs)) return [];

  const tree = {
    generatedAt: Date.now(),
    children: walk(rootAbs, ''),
  };

  return [
    {
      path: 'files/hxh_civ/tree.json',
      data: JSON.stringify(tree, null, 2),
    },
  ];
});
