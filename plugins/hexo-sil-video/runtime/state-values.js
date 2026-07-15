export const FULLSCREEN_UI_HIDE_DELAY = 2500;
export const VOLUME_CLOSE_DELAY = 800;

export function volumeLevel(volume, muted = false) {
  const value = Math.max(0, Math.min(1, Number(volume) || 0));
  if (muted || value === 0) return 'muted';
  if (value <= 1 / 3) return 'low';
  if (value <= 2 / 3) return 'medium';
  return 'high';
}
