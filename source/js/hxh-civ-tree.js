(() => {
  const root = document.getElementById('hxh-civ-root');
  const queryInput = document.getElementById('hxh-civ-query');
  const meta = document.getElementById('hxh-civ-meta');
  if (!root || !queryInput || !meta || root.dataset.hxhCivReady === 'true') return;

  root.dataset.hxhCivReady = 'true';

  function text(value) {
    return document.createTextNode(value);
  }

  function formatSize(size) {
    if (!Number.isFinite(size) || size < 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = size;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
  }

  function downloadUrl(rel) {
    return `/files/hxh_civ/${rel.split('/').map(encodeURIComponent).join('/')}`;
  }

  function countFiles(entries) {
    return entries.reduce((total, entry) => {
      if (entry.type === 'file') return total + 1;
      return total + countFiles(entry.children || []);
    }, 0);
  }

  function matchesName(entry, query) {
    return `${entry.name} ${entry.rel || ''}`.toLocaleLowerCase().includes(query);
  }

  function matches(entry, query) {
    if (!query || matchesName(entry, query)) return true;
    return entry.type === 'dir' && (entry.children || []).some((child) => matches(child, query));
  }

  function visibleFileCount(entries, query) {
    return entries.reduce((total, entry) => {
      if (!matches(entry, query)) return total;
      if (entry.type === 'file') return total + 1;
      const children = entry.children || [];
      return total + (matchesName(entry, query) ? countFiles(children) : visibleFileCount(children, query));
    }, 0);
  }

  function renderEntries(entries, query, nested = false) {
    const list = document.createElement('ul');
    for (const entry of entries) {
      if (!matches(entry, query)) continue;

      const item = document.createElement('li');
      if (entry.type === 'dir') {
        const details = document.createElement('details');
        details.open = !nested || Boolean(query);
        const summary = document.createElement('summary');
        summary.append(text(entry.name));
        const childQuery = query && matchesName(entry, query) ? '' : query;
        details.append(summary, renderEntries(entry.children || [], childQuery, true));
        item.append(details);
      } else if (entry.type === 'file' && typeof entry.rel === 'string') {
        const link = document.createElement('a');
        link.href = downloadUrl(entry.rel);
        link.download = '';
        link.append(text(entry.name));
        item.append(link);

        const size = formatSize(entry.size);
        if (size) {
          const detail = document.createElement('small');
          detail.append(text(` (${size})`));
          item.append(detail);
        }
      } else {
        continue;
      }
      list.append(item);
    }
    return list;
  }

  function render(tree) {
    const query = queryInput.value.trim().toLocaleLowerCase();
    root.replaceChildren(renderEntries(tree.children, query));
    const visibleFiles = visibleFileCount(tree.children, query);
    meta.textContent = query ? `找到 ${visibleFiles} 个文件。` : `共 ${countFiles(tree.children)} 个文件。`;
  }

  fetch('/files/hxh_civ/tree.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((tree) => {
      if (!tree || !Array.isArray(tree.children)) throw new Error('invalid tree');
      queryInput.disabled = false;
      queryInput.addEventListener('input', () => render(tree));
      render(tree);
    })
    .catch(() => {
      meta.textContent = '目录加载失败，请稍后重试。';
    });
})();
