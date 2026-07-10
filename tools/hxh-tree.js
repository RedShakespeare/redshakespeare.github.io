'use strict';

const fs = require('fs');
const path = require('path');

function shouldIgnore(name) {
  return name === 'tree.json' || name === 'index.html' || name === '.DS_Store' || name === 'Thumbs.db' || name.startsWith('.');
}

function lfsSize(filePath, fallback) {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(256);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    const match = buffer.subarray(0, bytesRead).toString('utf8').match(/^size (\d+)$/m);
    return match ? Number(match[1]) : fallback;
  } finally {
    fs.closeSync(descriptor);
  }
}

function walk(dirAbs, relBase) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });

  const children = [];
  for (const entry of entries) {
    if (shouldIgnore(entry.name)) continue;

    const abs = path.join(dirAbs, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      children.push({ type: 'dir', name: entry.name, rel, children: walk(abs, rel) });
    } else if (entry.isFile()) {
      const stats = fs.statSync(abs);
      children.push({
        type: 'file',
        name: entry.name,
        rel,
        size: lfsSize(abs, stats.size),
        mtime: stats.mtimeMs,
      });
    }
  }
  return children;
}

function generateTree(rootAbs) {
  return { generatedAt: Date.now(), children: walk(rootAbs, '') };
}

module.exports = { generateTree };
