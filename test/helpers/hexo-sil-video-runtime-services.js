'use strict';

function createClock(windowRef, overrides = {}) {
  return {
    now: overrides.now || (() => Date.now()),
    setTimeout: overrides.setTimeout || ((handler, delay) => windowRef.setTimeout(handler, delay)),
    clearTimeout: overrides.clearTimeout || (timer => windowRef.clearTimeout(timer)),
    requestAnimationFrame: overrides.requestAnimationFrame || (handler => windowRef.requestAnimationFrame(handler)),
    cancelAnimationFrame: overrides.cancelAnimationFrame || (frame => windowRef.cancelAnimationFrame(frame))
  };
}

function createRuntimeServices(windowRef, overrides = {}) {
  return {
    clock: createClock(windowRef, overrides.clock),
    diagnostics: overrides.diagnostics || { report() {} },
    state: overrides.state || { set() {}, clear() {}, destroy() {} },
    ui: overrides.ui || {
      setVolumeOpen() {},
      setSubtitleMenuOpen() {},
      controlsOpen: () => false,
      volumeOpen: () => false,
      subtitleMenuOpen: () => false,
      destroy() {}
    }
  };
}

module.exports = { createRuntimeServices };
