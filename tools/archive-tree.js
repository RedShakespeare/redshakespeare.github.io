'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { shouldIgnoreArchiveName } = require('./archive-ignore');

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

function walk(directory, relativeBase) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  entries.sort((left, right) => {
    if (left.isDirectory() && !right.isDirectory()) return -1;
    if (!left.isDirectory() && right.isDirectory()) return 1;
    return left.name.localeCompare(right.name, 'zh-Hans-CN');
  });

  const children = [];
  for (const entry of entries) {
    if (shouldIgnoreArchiveName(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      children.push({ type: 'dir', name: entry.name, rel: relativePath, children: walk(absolutePath, relativePath) });
    } else if (entry.isFile()) {
      const stats = fs.statSync(absolutePath);
      children.push({
        type: 'file',
        name: entry.name,
        rel: relativePath,
        size: lfsSize(absolutePath, stats.size),
        mtime: stats.mtimeMs
      });
    }
  }
  return children;
}

function generateTree(rootPath) {
  return { generatedAt: Date.now(), children: walk(rootPath, '') };
}

module.exports = { generateTree, lfsSize, shouldIgnore: shouldIgnoreArchiveName };
