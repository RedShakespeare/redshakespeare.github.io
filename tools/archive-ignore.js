'use strict';

const IGNORED_ARCHIVE_NAMES = new Set(['tree.json', 'index.html', '.DS_Store', 'Thumbs.db']);

function shouldIgnoreArchiveName(name) {
  const value = String(name || '');
  return !value || value.startsWith('.') || IGNORED_ARCHIVE_NAMES.has(value);
}

function filterArchiveTree(tree) {
  function filterChildren(children) {
    return (Array.isArray(children) ? children : [])
      .filter(entry => entry && !shouldIgnoreArchiveName(entry.name))
      .map(entry => entry.type === 'dir'
        ? { ...entry, children: filterChildren(entry.children) }
        : entry);
  }
  return { ...tree, children: filterChildren(tree && tree.children) };
}

module.exports = { IGNORED_ARCHIVE_NAMES, filterArchiveTree, shouldIgnoreArchiveName };
