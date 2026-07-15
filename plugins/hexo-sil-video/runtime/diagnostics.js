export function createDiagnostics({ logger = console } = {}) {
  return {
    report(scope, error, context = {}) {
      const cause = error instanceof Error ? error : new Error(String(error));
      try {
        logger.error(`[hexo-sil-video:${scope}] ${cause.message}`, { error: cause, ...context });
      } catch {
        // Diagnostics must never change player behaviour.
      }
    }
  };
}

