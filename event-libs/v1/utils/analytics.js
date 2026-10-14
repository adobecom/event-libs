import { logError } from './lana-log.js';

// Milo's classic sendAnalytics payload; importing its modal.js doubles C2 modals (MWPW-210384).
function fireAnalyticsEvent(name) {
  // eslint-disable-next-line no-underscore-dangle
  window._satellite?.track('event', {
    xdm: {},
    data: { web: { webInteraction: { name } } },
  });
}

// Sends a custom link-click call for interactions that have no clickable daa-ll element (e.g. a
// toast opening). Before Launch loads, the call waits for alloy's first event so it isn't dropped.
export function trackAnalyticsEvent(name, logScope = 'analytics') {
  try {
    // eslint-disable-next-line no-underscore-dangle
    if (window._satellite?.track) {
      fireAnalyticsEvent(name);
    } else {
      window.addEventListener('alloy_sendEvent', () => fireAnalyticsEvent(name), { once: true });
    }
  } catch (err) {
    logError(logScope, 'analytics failed', err);
  }
}
