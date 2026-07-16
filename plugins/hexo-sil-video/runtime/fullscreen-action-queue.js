export function createFullscreenActionQueue() {
  let pending = null;
  function enqueue(action) {
    let result;
    if (pending) result = pending.then(action, action);
    else {
      try { result = Promise.resolve(action()); } catch (error) { result = Promise.reject(error); }
    }
    pending = result.catch(() => {});
    return result;
  }
  return { enqueue, wait: () => pending || Promise.resolve() };
}
