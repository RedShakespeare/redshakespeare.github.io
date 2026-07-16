export function createOrientationController(windowRef) {
  let generation = 0;
  function unlockNative() {
    try {
      windowRef?.screen?.orientation?.unlock?.();
    } catch {
      // The browser may expose orientation information without allowing explicit unlocks.
    }
  }
  return {
    async lockLandscape() {
      const current = ++generation;
      try {
        await windowRef?.screen?.orientation?.lock?.('landscape');
      } catch {
        // Orientation locking is best-effort and commonly unavailable outside Android fullscreen.
      }
      if (current !== generation) unlockNative();
    },
    unlock() {
      generation += 1;
      unlockNative();
    }
  };
}
