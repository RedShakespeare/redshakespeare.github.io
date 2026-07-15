export const STATE_CHANNELS = Object.freeze(['media', 'subtitles', 'fullscreen']);

const LEVELS = Object.freeze({ error: 3, loading: 2, info: 1 });

export function createStateCoordinator({ player, status } = {}) {
  const channels = new Map();
  let sequence = 0;

  function project() {
    const entries = Array.from(channels.values()).filter(Boolean);
    const errors = entries.filter(entry => entry.error);
    const pool = errors.length ? errors : entries;
    pool.sort((left, right) => (LEVELS[right.level] || 0) - (LEVELS[left.level] || 0) || right.sequence - left.sequence);
    const current = pool[0];
    if (status) status.textContent = current?.message || '';
    if (player) {
      if (errors.length) player.dataset.silVideoError = 'true';
      else delete player.dataset.silVideoError;
    }
    return current || null;
  }

  function validate(channel) {
    if (!STATE_CHANNELS.includes(channel)) throw new Error(`未知视频状态频道：${channel}`);
  }

  function clear(channel) {
    validate(channel);
    channels.delete(channel);
    project();
  }

  function set(channel, message = '', options = {}) {
    validate(channel);
    if (!message) {
      clear(channel);
      return null;
    }
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
    get(channel) {
      validate(channel);
      return channels.get(channel) || null;
    },
    snapshot() {
      return Object.fromEntries(Array.from(channels, ([key, value]) => [key, { ...value }]));
    },
    destroy() {
      channels.clear();
      project();
    }
  };
}
