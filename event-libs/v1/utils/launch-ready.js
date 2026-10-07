/* eslint-disable no-underscore-dangle */

// Cap on how long a caller may hold work for Launch, so media still plays when martech is
// blocked (ad blockers) or slow. Measured from the first waitForLaunch() call on the page.
export const LAUNCH_WAIT_TIMEOUT_MS = 4000;
const POLL_INTERVAL_MS = 50;

const isLaunchReady = () => typeof window._satellite?.track === 'function';

function isMartechOff() {
  const params = new URLSearchParams(window.location.search);
  const meta = document.querySelector('meta[name="martech"]')?.content?.trim().toLowerCase();
  return params.get('martech') === 'off' || params.get('marketingtech') === 'off' || meta === 'off';
}

let pending = null;

/**
 * Resolves once Adobe Launch (window._satellite) has loaded, or after the timeout.
 * On Milo pages Launch loads post-LCP, and Launch replaces Milo's early `window.alloy_all`
 * stub (whose `set(obj, path, val)` signature differs from Launch's `set(path, val)`) in the
 * same tick `_satellite` appears. Third-party players that bind to `alloy_all` at init
 * (e.g. MobileRider's Adobe analytics plugin) must wait for this.
 *
 * Never rejects. After the first timeout, later calls resolve immediately.
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} true if Launch is ready, false if timed out / martech is off.
 */
export function waitForLaunch(timeoutMs = LAUNCH_WAIT_TIMEOUT_MS) {
  if (isLaunchReady()) return Promise.resolve(true);
  if (isMartechOff()) return Promise.resolve(false);

  if (!pending) {
    pending = new Promise((resolve) => {
      const start = Date.now();
      const id = setInterval(() => {
        const ready = isLaunchReady();
        if (ready || Date.now() - start >= timeoutMs) {
          clearInterval(id);
          resolve(ready);
        }
      }, POLL_INTERVAL_MS);
    });
  }
  return pending;
}

// Test-only: clears the shared wait so each test starts fresh.
export function resetLaunchWait() {
  pending = null;
}
