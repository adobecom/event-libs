import { openSessionGuideDetail } from '../../../../utils/session-store.js';
import { logError } from '../../../../utils/lana-log.js';

// Same payload as Milo's blocks/modal/modal.js sendAnalytics, inlined because importing that
// module registers a second hashchange modal handler on C2 pages: modal links then open twice
// and closing one leaves the other's scroll lock behind (MWPW-210384).
function fireAnalyticsEvent(name) {
  // eslint-disable-next-line no-underscore-dangle
  window._satellite?.track('event', {
    xdm: {},
    data: { web: { webInteraction: { name } } },
  });
}

export async function trackBroadcastEvent(name) {
  try {
    // eslint-disable-next-line no-underscore-dangle
    if (window._satellite?.track) {
      fireAnalyticsEvent(name);
    } else {
      window.addEventListener('alloy_sendEvent', () => fireAnalyticsEvent(name), { once: true });
    }
  } catch (err) {
    logError('session-broadcast', 'analytics failed', err);
  }
}

// Shared by both carousels' onCardClick.
export function openSessionDetail(session) {
  openSessionGuideDetail(session.id);
  trackBroadcastEvent(`Broadcast-Session-Detail-Open | ${session.id}`);
}

// No entry-point query param exists — referrer is the only signal available on load.
export function getEntryPoint() {
  const { referrer } = document;
  if (!referrer) return 'direct';
  try {
    const url = new URL(referrer);
    if (url.origin !== window.location.origin) return 'external';
    if (/session/i.test(url.pathname)) return 'session-guide';
    return 'homepage';
  } catch {
    return 'direct';
  }
}
