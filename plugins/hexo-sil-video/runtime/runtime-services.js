import { createDiagnostics } from './diagnostics.js';
import { createStateCoordinator } from './state-coordinator.js';
import { createUiCoordinator } from './ui-coordinator.js';

const SERVICE_METHODS = Object.freeze({
  clock: ['now', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  diagnostics: ['report'],
  state: ['set', 'clear', 'destroy'],
  ui: ['setVolumeOpen', 'setSubtitleMenuOpen', 'controlsOpen', 'volumeOpen', 'subtitleMenuOpen', 'destroy']
});

export function assertRuntimeServices(services) {
  if (!services || typeof services !== 'object') throw new TypeError('视频运行时服务缺失。');
  for (const [service, methods] of Object.entries(SERVICE_METHODS)) {
    if (!services[service] || methods.some(method => typeof services[service][method] !== 'function')) {
      throw new TypeError(`视频运行时服务不完整：${service}`);
    }
  }
  return services;
}

export function createRuntimeClock(windowRef = globalThis, overrides = {}) {
  const source = windowRef || globalThis;
  return {
    now: overrides.now || (() => Date.now()),
    setTimeout: overrides.setTimeout || ((handler, delay) => source.setTimeout(handler, delay)),
    clearTimeout: overrides.clearTimeout || (timer => source.clearTimeout(timer)),
    requestAnimationFrame: overrides.requestAnimationFrame || (handler => source.requestAnimationFrame(handler)),
    cancelAnimationFrame: overrides.cancelAnimationFrame || (frame => source.cancelAnimationFrame(frame))
  };
}

export function createRuntimeServices({ player, status, windowRef, overrides = {} } = {}) {
  if (!player || !status || !windowRef) throw new TypeError('创建视频运行时服务需要 player、status 和 windowRef。');
  return assertRuntimeServices({
    clock: overrides.clock ? createRuntimeClock(windowRef, overrides.clock) : createRuntimeClock(windowRef),
    diagnostics: overrides.diagnostics || createDiagnostics(),
    state: overrides.state || createStateCoordinator({ player, status }),
    ui: overrides.ui || createUiCoordinator({ player })
  });
}
