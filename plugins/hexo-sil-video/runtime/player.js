import { selector } from './shared.js';
import { createDiagnostics } from './diagnostics.js';
import { createPlayerInstance } from './player-instance.js';

export function createVideoRuntime({
  windowRef = window,
  documentRef = document,
  ElementRef = Element,
  MutationObserverRef = MutationObserver
} = {}) {
  const records = new Map();
  const dirtyPlayers = new Set();
  const diagnostics = createDiagnostics();
  let runtimeDestroyed = false;
  let refreshScheduled = false;

function showFallbackError(player, message) {
  player.dataset.silVideoError = 'true';
  const header = player.querySelector('[data-sil-video-fallback-status]');
  const status = player.querySelector('[data-sil-video-status]');
  if (header) header.hidden = false;
  if (status) status.textContent = message;
}

function recordFailure(player, source, scope, error, message = error.message) {
  const previous = records.get(player)?.error;
  if (previous && previous.source === source) return;
  records.set(player, { ...(records.get(player) || {}), source, status: 'failed', error: { source, scope, message } });
  showFallbackError(player, message);
  diagnostics.report(scope, error);
}

function initialise(player) {
  const record = records.get(player);
  if (record?.status === 'initialising' || record?.status === 'ready' || record?.status === 'destroying' || player.dataset.silVideoReady === 'true') return;
  const source = player.dataset.silVideoModel || '';
  const previousFailure = record?.error;
  if (previousFailure && previousFailure.source === source) return;
  if (previousFailure) records.delete(player);
  records.set(player, { source, status: 'initialising', instance: null, promise: null, error: null });
  let instance = null;
  try {
    instance = createPlayerInstance({ player });
    instance.mount();
    records.set(player, { source, status: 'ready', instance, promise: null, error: null });
    instance.refreshTheme();
  } catch (error) {
    const cleanup = instance?.destroy?.() || Promise.resolve();
    cleanup.catch(destroyError => console.error(destroyError));
    recordFailure(player, source, 'initialise', error, `播放器初始化失败：${error.message}`);
  }
}

function refreshPlayer(player) {
  if (!player?.matches?.(selector)) return;
  initialise(player);
  records.get(player)?.instance?.refreshTheme();
}

function playersWithin(root) {
  if (!root) return [];
  const players = root.matches?.(selector) ? [root] : [];
  if (root.querySelectorAll) players.push(...root.querySelectorAll(selector));
  return players;
}

function flushDirtyPlayers() {
  refreshScheduled = false;
  if (runtimeDestroyed) {
    dirtyPlayers.clear();
    return;
  }
  const pending = Array.from(dirtyPlayers);
  dirtyPlayers.clear();
  pending.forEach(refreshPlayer);
}

function schedulePlayers(players) {
  for (const player of players) dirtyPlayers.add(player);
  if (refreshScheduled || dirtyPlayers.size === 0) return;
  refreshScheduled = true;
  queueMicrotask(flushDirtyPlayers);
}

function refresh(root = documentRef) {
  playersWithin(root).forEach(player => {
    initialise(player);
    records.get(player)?.instance?.refreshTheme();
  });
}

function refreshThemes() {
  for (const record of records.values()) record.instance?.refreshTheme();
}

function handleInside(event) {
  const root = event?.detail?.root;
  if (root?.querySelectorAll || root?.matches) schedulePlayers(playersWithin(root));
  else refresh();
}

function destroyRemoved(node) {
  if (!(node instanceof ElementRef)) return;
  const players = node.matches(selector) ? [node] : Array.from(node.querySelectorAll(selector));
  for (const player of players) {
    const record = records.get(player);
    const instance = record?.instance;
    if (!instance) continue;
    if (record.status === 'destroying') continue;
    const pending = instance.destroy();
    records.set(player, { ...record, status: 'destroying', promise: pending });
    pending.then(() => {
      if (records.get(player)?.promise !== pending) return;
      records.delete(player);
      if (!runtimeDestroyed && player.isConnected) initialise(player);
    }, error => console.error(error));
  }
}

function observeMutations(records) {
  const added = [];
  for (const record of records) {
    for (const node of record.removedNodes) destroyRemoved(node);
    for (const node of record.addedNodes) {
      if (node instanceof ElementRef) added.push(...playersWithin(node));
    }
  }
  schedulePlayers(added);
}

  if (windowRef.__hexoSilVideoRuntime) {
    windowRef.__hexoSilVideoRuntime.refresh();
    return windowRef.__hexoSilVideoRuntime;
  }
  const observer = new MutationObserverRef(observeMutations);
  const runtime = {
    refresh,
    async destroy() {
      runtimeDestroyed = true;
      observer.disconnect();
      dirtyPlayers.clear();
      windowRef.removeEventListener('resize', refreshThemes);
      documentRef.removeEventListener('inside', handleInside);
      documentRef.removeEventListener('inside:theme', refreshThemes);
      const pending = Array.from(records.values(), record => record.instance ? record.instance.destroy() : record.promise).filter(Boolean);
      await Promise.allSettled(pending);
      delete windowRef.__hexoSilVideoRefresh;
      delete windowRef.__hexoSilVideoRuntime;
    }
  };
  windowRef.__hexoSilVideoRuntime = runtime;
  windowRef.__hexoSilVideoRefresh = refresh;
  windowRef.addEventListener('resize', refreshThemes);
  documentRef.addEventListener('inside', handleInside);
  documentRef.addEventListener('inside:theme', refreshThemes);
  observer.observe(documentRef.body, { childList: true, subtree: true });
  refresh();
  return runtime;
}

createVideoRuntime();
