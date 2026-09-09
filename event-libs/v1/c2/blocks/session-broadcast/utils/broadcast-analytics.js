import { LIBS, getEventConfig } from '../../../../utils/utils.js';
import { openSessionGuideDetail } from '../../../../utils/session-store.js';

// sendAnalytics takes a real Event, not a payload — any dimension travels in the event name.
let sendAnalyticsPromise;
function loadSendAnalytics() {
  if (!sendAnalyticsPromise) {
    const miloLibs = getEventConfig()?.miloConfig?.miloLibs ?? LIBS;
    sendAnalyticsPromise = import(`${miloLibs}/blocks/modal/modal.js`).then((m) => m.sendAnalytics);
  }
  return sendAnalyticsPromise;
}

export async function trackBroadcastEvent(name) {
  try {
    const sendAnalytics = await loadSendAnalytics();
    sendAnalytics(new Event(name));
  } catch (err) {
    window.lana?.log(`session-broadcast analytics: ${err.message}`, { tags: 'session-broadcast' });
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
