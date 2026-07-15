import contract from '../lib/player-contract.js';

const { PLAYER_VIEW_SELECTORS } = contract;
export const VIEW_FIELDS = Object.freeze(['player', ...Object.keys(PLAYER_VIEW_SELECTORS)]);

export function createPlayerView(player) {
  const refs = {
    player,
    ...Object.fromEntries(Object.entries(PLAYER_VIEW_SELECTORS).map(([field, selector]) => [field, player.querySelector(selector)]))
  };
  const missing = VIEW_FIELDS.filter(field => !refs[field]);
  if (missing.length) {
    const error = new Error(`播放器视图结构缺失：${missing.join('、')}`);
    error.code = 'SIL_VIDEO_VIEW_MISSING';
    error.fields = missing;
    throw error;
  }
  return Object.freeze(refs);
}
