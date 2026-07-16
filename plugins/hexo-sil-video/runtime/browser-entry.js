import { createVideoRuntime } from './player.js';

createVideoRuntime({
  windowRef: window,
  documentRef: document,
  ElementRef: Element,
  MutationObserverRef: MutationObserver,
  queueMicrotaskRef: queueMicrotask
});
