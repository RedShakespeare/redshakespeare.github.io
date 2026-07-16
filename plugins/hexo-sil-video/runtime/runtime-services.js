import { createDiagnostics } from './diagnostics.js';
import { createStateCoordinator } from './state-coordinator.js';
import { createUiCoordinator } from './ui-coordinator.js';

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
  return {
    clock: overrides.clock ? createRuntimeClock(windowRef, overrides.clock) : createRuntimeClock(windowRef),
    diagnostics: overrides.diagnostics || createDiagnostics(),
    state: overrides.state || createStateCoordinator({ player, status }),
    ui: overrides.ui || createUiCoordinator({ player })
  };
}
