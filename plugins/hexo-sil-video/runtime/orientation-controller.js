export function createOrientationController(windowRef) {
  return {
    async lockLandscape() {
      try {
        await windowRef?.screen?.orientation?.lock?.('landscape');
      } catch {
        // Orientation locking is best-effort and commonly unavailable outside Android fullscreen.
      }
    },
    unlock() {
      try {
        windowRef?.screen?.orientation?.unlock?.();
      } catch {
        // The browser may expose orientation information without allowing explicit unlocks.
      }
    }
  };
}
