'use strict';

function createVideoDemandRegistry() {
  let demanded = false;

  function consumeFence(line, state) {
    const trimmed = line.trim();
    if (state.comment) return false;
    const marker = trimmed.match(/^(`{3,}|~{3,})/);
    if (!state.fence) {
      if (!marker) return false;
      state.fence = { character: marker[1][0], length: marker[1].length };
      return true;
    }
    if (marker && marker[1][0] === state.fence.character
      && marker[1].length >= state.fence.length
      && !trimmed.slice(marker[1].length).trim()) state.fence = null;
    return true;
  }

  function stripComments(line, state) {
    let visible = line;
    while (visible) {
      if (state.comment) {
        const end = visible.indexOf('-->');
        if (end < 0) return '';
        visible = visible.slice(end + 3);
        state.comment = false;
      }
      const start = visible.indexOf('<!--');
      if (start < 0) break;
      const end = visible.indexOf('-->', start + 4);
      if (end < 0) {
        state.comment = true;
        return visible.slice(0, start);
      }
      visible = `${visible.slice(0, start)}${visible.slice(end + 3)}`;
    }
    return visible;
  }

  function declaresVideo(item) {
    if (!item) return false;
    if (item.video !== undefined && item.video !== false) return true;
    const source = String(item._content || '');
    const state = { fence: '', comment: false };
    for (const line of source.split(/\r?\n/)) {
      if (consumeFence(line, state) || state.fence) continue;
      const visible = stripComments(line, state);
      if (/{%\s*video(?:\s|%})/.test(visible)) return true;
    }
    return false;
  }

  return {
    reset() { demanded = false; },
    mark() { demanded = true; },
    seed(items = []) {
      if (!demanded && Array.from(items).some(declaresVideo)) demanded = true;
    },
    hasDemand() { return demanded; }
  };
}

module.exports = { createVideoDemandRegistry };
