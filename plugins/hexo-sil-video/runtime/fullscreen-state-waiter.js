export function createFullscreenStateWaiter({ documentRef, clock, isActive, timeout }) {
  const { setTimeout: setTimer, clearTimeout: clearTimer } = clock;
  const waiters = new Set();

  function waitFor(target) {
    if (isActive() === target) return Promise.resolve(true);
    return new Promise(resolve => {
      let timer = null;
      const finish = value => {
        if (timer !== null) clearTimer(timer);
        documentRef.removeEventListener('fullscreenchange', onChange);
        waiters.delete(waiter);
        resolve(value);
      };
      const onChange = () => {
        if (isActive() === target) finish(true);
      };
      const waiter = { cancel: () => finish(false) };
      waiters.add(waiter);
      documentRef.addEventListener('fullscreenchange', onChange);
      timer = setTimer(() => finish(false), timeout);
    });
  }

  return {
    waitFor,
    cancelAll() { waiters.forEach(waiter => waiter.cancel()); }
  };
}
