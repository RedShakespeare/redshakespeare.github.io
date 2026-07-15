'use strict';

function createVideoDemandRegistry() {
  let demanded = false;

  function declaresVideo(item) {
    if (!item) return false;
    if (item.video !== undefined && item.video !== false) return true;
    return /{%\s*video(?:\s|%})/.test(String(item._content || ''));
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
