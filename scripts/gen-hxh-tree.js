'use strict';

const fs = require('fs');
const path = require('path');

function shouldIgnore(name) {
  // 你可以按需增删
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
        rel, // 相对 hxh_civ 根目录的路径（不编码）
        children: walk(abs, rel),
      });
    } else if (ent.isFile()) {
      const st = fs.statSync(abs);
      children.push({
        type: 'file',
        name: ent.name,
        rel,       // 相对路径（不编码）
        size: st.size,
        mtime: st.mtimeMs,
      });
    }
  }
  return children;
}

function generate() {
  const rootAbs = path.join(hexo.base_dir, 'source', 'files', 'hxh_civ');
  const outAbs = path.join(rootAbs, 'tree.json');

  if (!fs.existsSync(rootAbs)) {
    hexo.log.warn('[hxh_tree] missing dir: ' + rootAbs);
    return;
  }

  const tree = {
    generatedAt: Date.now(),
    children: walk(rootAbs, ''),
  };

  fs.writeFileSync(outAbs, JSON.stringify(tree, null, 2), 'utf8');
  hexo.log.info('[hxh_tree] wrote: ' + outAbs);
}

// 确保每次 hexo generate 前都会刷新
hexo.extend.filter.register('before_generate', generate);
