import { selector } from './shared.js';
import { createRuntimeServices } from './runtime-services.js';
import { createPlayerInstance } from './player-instance.js';

const instances = new Map();
const destroying = new WeakMap();
const failures = new WeakMap();
const dirtyPlayers = new Set();
const diagnostics = createRuntimeServices().diagnostics;
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
  const previous = failures.get(player);
  if (previous && previous.source === source) return;
  failures.set(player, { source, scope, message });
  showFallbackError(player, message);
  diagnostics.report(scope, error);
}

function initialise(player) {
  if (instances.has(player) || destroying.has(player) || player.dataset.silVideoReady === 'true') return;
  const source = player.dataset.silVideoModel || '';
  const previousFailure = failures.get(player);
  if (previousFailure && previousFailure.source === source) return;
  if (previousFailure) failures.delete(player);
  let instance = null;
  try {
    instance = createPlayerInstance({ player, services: createRuntimeServices({ player, windowRef: player.ownerDocument.defaultView }) });
    instance.mount();
    instances.set(player, instance);
    failures.delete(player);
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
  instances.get(player)?.refreshTheme();
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

function refresh(root = document) {
  playersWithin(root).forEach(player => {
    initialise(player);
    instances.get(player)?.refreshTheme();
  });
}

function refreshThemes() {
  for (const instance of instances.values()) instance.refreshTheme();
}

function handleInside(event) {
  const root = event?.detail?.root;
  if (root?.querySelectorAll || root?.matches) schedulePlayers(playersWithin(root));
  else refresh();
}

function destroyRemoved(node) {
  if (!(node instanceof Element)) return;
  const players = node.matches(selector) ? [node] : Array.from(node.querySelectorAll(selector));
  for (const player of players) {
    const instance = instances.get(player);
    if (!instance) continue;
    const pending = instance.destroy();
    instances.delete(player);
    destroying.set(player, pending);
    pending.then(() => {
      if (destroying.get(player) !== pending) return;
      destroying.delete(player);
      if (!runtimeDestroyed && player.isConnected) initialise(player);
    }, error => console.error(error));
  }
}

function observeMutations(records) {
  const added = [];
  for (const record of records) {
    for (const node of record.removedNodes) destroyRemoved(node);
    for (const node of record.addedNodes) {
      if (node instanceof Element) added.push(...playersWithin(node));
    }
  }
  schedulePlayers(added);
}

if (window.__hexoSilVideoRuntime) {
  window.__hexoSilVideoRuntime.refresh();
} else {
  const observer = new MutationObserver(observeMutations);
  const runtime = {
    refresh,
    async destroy() {
      runtimeDestroyed = true;
      observer.disconnect();
      dirtyPlayers.clear();
      window.removeEventListener('resize', refreshThemes);
      document.removeEventListener('inside', handleInside);
      document.removeEventListener('inside:theme', refreshThemes);
      const pending = Array.from(instances.values(), instance => instance.destroy());
      await Promise.allSettled(pending);
      delete window.__hexoSilVideoRefresh;
      delete window.__hexoSilVideoRuntime;
    }
  };
  window.__hexoSilVideoRuntime = runtime;
  window.__hexoSilVideoRefresh = refresh;
  window.addEventListener('resize', refreshThemes);
  document.addEventListener('inside', handleInside);
  document.addEventListener('inside:theme', refreshThemes);
  observer.observe(document.body, { childList: true, subtree: true });
  refresh();
}
