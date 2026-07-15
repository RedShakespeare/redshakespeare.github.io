'use strict';

function createVideoDemandRegistry() {
  let demanded = false;

  function declaresVideo(item) {
    if (!item) return false;
    if (item.video !== undefined && item.video !== false) return true;
    const source = String(item._content || '');
    let fence = '';
    let comment = false;
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!comment && (trimmed.startsWith('```') || trimmed.startsWith('~~~'))) {
        const marker = trimmed.slice(0, 3);
        fence = fence === marker ? '' : (fence || marker);
        continue;
      }
      if (fence) continue;
      let visible = line;
      while (visible) {
        if (comment) {
          const end = visible.indexOf('-->');
          if (end < 0) { visible = ''; break; }
          visible = visible.slice(end + 3);
          comment = false;
        }
        const start = visible.indexOf('<!--');
        if (start < 0) break;
        const end = visible.indexOf('-->', start + 4);
        if (end < 0) { visible = visible.slice(0, start); comment = true; break; }
        visible = `${visible.slice(0, start)}${visible.slice(end + 3)}`;
      }
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
