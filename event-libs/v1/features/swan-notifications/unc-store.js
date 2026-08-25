// Thin client for UNC's own local notification store — a localStorage-backed object
// UNC's global-nav bundle exposes on window once it initializes (placeholder shape,
// pending confirmation with the UNC team — see docs/swan-unc-dependencies.md). This
// file never talks to a network; it only waits for the store to exist and hands back
// its add/edit/remove/get API, so this feature has one place to update once the real
// global/path is confirmed.
const READY_EVENT = 'feds.data.notifications.loaded';

function readStore() {
  return window.feds?.data?.notifications || null;
}

// Resolves with the store as soon as it exists — immediately if it's already there
// (e.g. this runs after UNC already initialized), otherwise once READY_EVENT fires.
// Never rejects: a page without gnav/UNC, or one where UNC failed to load, should
// leave SWAN silently inert rather than throwing. This is called on every schedule
// action and every ticker tick, so both settle paths must tear down the other's
// listener/timer — otherwise a page where UNC never loads accumulates one leaked
// `window` listener per call for as long as the tab stays open.
export function whenUncStoreReady(timeoutMs = 8000) {
  const existing = readStore();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve(readStore());
    };
    const timer = setTimeout(() => {
      window.removeEventListener(READY_EVENT, onReady);
      resolve(null);
    }, timeoutMs);
    window.addEventListener(READY_EVENT, onReady, { once: true });
  });
}
