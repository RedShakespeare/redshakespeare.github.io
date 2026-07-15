'use strict';

const VOLUME_CLOSE_DELAY = 800;
const FULLSCREEN_UI_HIDE_DELAY = 2500;
const STATE_CHANNELS = Object.freeze(['media', 'subtitles', 'fullscreen']);

function volumeLevel(volume, muted = false) {
  const value = Math.max(0, Math.min(1, Number(volume) || 0));
  if (muted || value === 0) return 'muted';
  if (value <= 1 / 3) return 'low';
  if (value <= 2 / 3) return 'medium';
  return 'high';
}

function createStateCoordinator({ player, status } = {}) {
  const channels = new Map();
  let sequence = 0;

  function project() {
    const entries = Array.from(channels.values()).filter(Boolean);
    const errors = entries.filter(entry => entry.error);
    const pool = errors.length ? errors : entries;
    const rank = { error: 3, loading: 2, info: 1 };
    pool.sort((a, b) => (rank[b.level] || 0) - (rank[a.level] || 0) || b.sequence - a.sequence);
    const current = pool[0];
    if (status) status.textContent = current?.message || '';
    if (player) {
      if (errors.length) player.dataset.silVideoError = 'true';
      else delete player.dataset.silVideoError;
    }
    return current || null;
  }

  function clear(channel) {
    if (!STATE_CHANNELS.includes(channel)) throw new Error(`未知视频状态频道：${channel}`);
    channels.delete(channel);
    project();
  }
  function set(channel, message = '', options = {}) {
    if (!STATE_CHANNELS.includes(channel)) throw new Error(`未知视频状态频道：${channel}`);
    if (!message) { clear(channel); return null; }
    const entry = {
      channel,
      message: String(message),
      error: options.error === true,
      level: options.error ? 'error' : (options.level || 'info'),
      sequence: ++sequence
    };
    channels.set(channel, entry);
    project();
    return entry;
  }

  return {
    set,
    clear,
    project,
    get(channel) { return channels.get(channel) || null; },
    snapshot() { return Object.fromEntries(Array.from(channels, ([key, value]) => [key, { ...value }])); },
    destroy() { channels.clear(); project(); }
  };
}

module.exports = {
  FULLSCREEN_UI_HIDE_DELAY,
  STATE_CHANNELS,
  VOLUME_CLOSE_DELAY,
  createStateCoordinator,
  volumeLevel
};
