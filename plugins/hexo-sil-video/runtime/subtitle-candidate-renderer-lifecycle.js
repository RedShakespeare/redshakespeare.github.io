export function createCandidateRendererLifecycle({ createRenderer, destroyRenderer, isCurrent }) {
  let candidate = null;
  let cancellation = null;

  async function cancel() {
    const current = candidate;
    if (!current) return;
    candidate = null;
    const currentCancellation = cancellation;
    cancellation = null;
    const cleanup = destroyRenderer(current);
    if (currentCancellation) cleanup.then(currentCancellation.resolve, currentCancellation.reject);
    await cleanup;
  }

  async function create(args, token) {
    const current = createRenderer(args);
    candidate = current;
    let resolveCancellation;
    let rejectCancellation;
    const currentCancellation = {
      promise: new Promise((resolve, reject) => {
        resolveCancellation = resolve;
        rejectCancellation = reject;
      }),
      resolve: resolveCancellation,
      reject: rejectCancellation
    };
    cancellation = currentCancellation;
    try {
      await Promise.race([current.ready, currentCancellation.promise]);
      if (candidate !== current || !isCurrent(token)) {
        await destroyRenderer(current);
        if (cancellation === currentCancellation) cancellation = null;
        return null;
      }
      candidate = null;
      cancellation = null;
      return current;
    } catch (error) {
      if (candidate === current) candidate = null;
      if (cancellation === currentCancellation) cancellation = null;
      await destroyRenderer(current);
      throw error;
    }
  }

  return { cancel, create };
}
