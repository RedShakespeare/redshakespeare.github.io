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

export function createNoopDiagnostics() {
  return { report() {} };
}

export function createTestRuntimeServices(overrides = {}) {
  const clock = overrides.clock ? createRuntimeClock(overrides.windowRef || globalThis, overrides.clock) : createRuntimeClock(overrides.windowRef || globalThis);
  return {
    clock,
    diagnostics: overrides.diagnostics || createNoopDiagnostics(),
    state: overrides.state || { set() {}, clear() {}, destroy() {} },
    ui: overrides.ui || {
      setVolumeOpen() {}, setSubtitleMenuOpen() {}, controlsOpen: () => false,
      volumeOpen: () => false, subtitleMenuOpen: () => false, destroy() {}
    }
  };
}

export function createRuntimeServices({ player, status, windowRef, overrides = {} } = {}) {
  const base = createTestRuntimeServices({ windowRef, ...overrides });
  return {
    clock: base.clock,
    diagnostics: overrides.diagnostics || createDiagnostics(),
    state: overrides.state || createStateCoordinator({ player, status }),
    ui: overrides.ui || createUiCoordinator({ player })
  };
}

export function resolveRuntimeServices(services, overrides = {}) {
  return services || createTestRuntimeServices(overrides);
}
