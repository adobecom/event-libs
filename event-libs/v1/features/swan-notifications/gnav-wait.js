// Milo's gnav (global-navigation) mounts asynchronously and unpredictably, and dispatches
// no ready event for it today — confirmed by an exhaustive grep of
// milo/libs/blocks/global-navigation/ for CustomEvent/dispatchEvent usage. The only
// reliable signal available right now is the `.feds-utilities` utility-bar element itself
// appearing in the DOM (it's the single mount point for utility icons in both desktop and
// mobile/hamburger gnav — milo re-stacks it via CSS z-index rather than using a separate
// mobile container). This checks once for GNAV_READY_EVENT before falling back to polling,
// so adopting a real milo hook later (recommended as a follow-up) needs no change here.
const GNAV_READY_EVENT = 'gnav:ready';

export function waitForElement(selector, { timeout = 8000, interval = 250 } = {}) {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    let intervalId;
    let timeoutId;

    function finish(el) {
      if (settled) return;
      settled = true;
      document.removeEventListener(GNAV_READY_EVENT, onReady);
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      resolve(el);
    }

    function onReady() {
      finish(document.querySelector(selector));
    }

    document.addEventListener(GNAV_READY_EVENT, onReady);
    intervalId = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) finish(el);
    }, interval);
    timeoutId = setTimeout(() => finish(null), timeout);
  });
}
