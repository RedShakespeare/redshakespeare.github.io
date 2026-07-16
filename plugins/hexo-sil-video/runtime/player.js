import { selector } from './shared.js';
import { createDiagnostics } from './diagnostics.js';
import { createPlayerInstance } from './player-instance.js';

function showFallbackError(player, message) {
  player.dataset.silVideoError = 'true';
  const header = player.querySelector('[data-sil-video-fallback-status]');
  const status = player.querySelector('[data-sil-video-status]');
  if (header) header.hidden = false;
  if (status) status.textContent = message;
}

function refreshBlocked(player, record) {
  if (record?.status === 'initialising' || record?.status === 'destroying') return true;
  if (record?.status !== 'ready' && player.dataset.silVideoReady !== 'true') return false;
  record?.instance?.refreshTheme();
  return true;
}

function recordInitialisationFailure({ player, records, source, instance, diagnostics, error }) {
  const cleanup = instance?.destroy?.() || Promise.resolve();
  cleanup.catch(destroyError => diagnostics.report('initialise.cleanup', destroyError));
  const message = `播放器初始化失败：${error.message}`;
  records.set(player, {
    ...(records.get(player) || {}),
    source,
    status: 'failed',
    error: { source, scope: 'initialise', message }
  });
  showFallbackError(player, message);
  diagnostics.report('initialise', error);
}

export function refreshOnePlayer({ player, records, diagnostics, createInstance = createPlayerInstance }) {
  if (!player?.matches?.(selector)) return;
  const record = records.get(player);
  if (refreshBlocked(player, record)) return;

  const source = player.dataset.silVideoModel || '';
  const previousFailure = record?.error;
  if (previousFailure?.source === source) return;
  if (previousFailure) records.delete(player);
  records.set(player, { source, status: 'initialising', instance: null, promise: null, error: null });
  let instance = null;
  try {
    instance = createInstance({ player });
    instance.mount();
    records.set(player, { source, status: 'ready', instance, promise: null, error: null });
    instance.refreshTheme();
  } catch (error) {
    recordInitialisationFailure({ player, records, source, instance, diagnostics, error });
  }
}

export function createVideoRuntime({
  windowRef,
  documentRef,
  ElementRef,
  MutationObserverRef,
  queueMicrotaskRef,
  diagnostics = createDiagnostics(),
  createInstance = createPlayerInstance
}) {
  const records = new Map();
  const dirtyPlayers = new Set();
  let runtimeDestroyed = false;
  let refreshScheduled = false;
  let destroyPromise = null;

  function playersWithin(root) {
    if (!root) return [];
    const players = root.matches?.(selector) ? [root] : [];
    if (root.querySelectorAll) players.push(...root.querySelectorAll(selector));
    return players;
  }

  function refreshPlayer(player) {
    refreshOnePlayer({ player, records, diagnostics, createInstance });
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
    queueMicrotaskRef(flushDirtyPlayers);
  }

  function refresh(root = documentRef) {
    playersWithin(root).forEach(refreshPlayer);
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
      if (!instance || record.status === 'destroying') continue;
      const pending = instance.destroy();
      records.set(player, { ...record, status: 'destroying', promise: pending });
      pending.then(() => {
        if (records.get(player)?.promise !== pending) return;
        records.delete(player);
        if (!runtimeDestroyed && player.isConnected) refreshPlayer(player);
      }, error => diagnostics.report('destroy', error));
    }
  }

  function observeMutations(mutations) {
    const added = [];
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) destroyRemoved(node);
      for (const node of mutation.addedNodes) {
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
    destroy() {
      if (destroyPromise) return destroyPromise;
      destroyPromise = (async () => {
        runtimeDestroyed = true;
        observer.disconnect();
        dirtyPlayers.clear();
        windowRef.removeEventListener('resize', refreshThemes);
        documentRef.removeEventListener('inside', handleInside);
        documentRef.removeEventListener('inside:theme', refreshThemes);
        const pending = Array.from(records.values(), record =>
          record.status === 'destroying' ? record.promise : record.instance?.destroy()
        ).filter(Boolean);
        const results = await Promise.allSettled(pending);
        for (const result of results) {
          if (result.status === 'rejected') diagnostics.report('runtime.destroy', result.reason);
        }
        records.clear();
        delete windowRef.__hexoSilVideoRefresh;
        delete windowRef.__hexoSilVideoRuntime;
      })();
      return destroyPromise;
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
