import { LIBS, getEventConfig } from '../../../../utils/utils.js';
import { openSessionGuideDetail } from '../../../../utils/session-store.js';

// Same dynamically-imported sendAnalytics events-form.js already uses (${miloLibs}/blocks/
// modal/modal.js) — no separate payload argument exists, it takes a real Event whose `.type`
// is what _satellite.track ends up receiving, so any dimension that needs to travel with the
// event has to live in the name itself (matches eventFormSendAnalytics's own
// ` | ${title} | ${modalId}` string-concatenation pattern).
//
// Ticket's own "Analytics open questions" section says the exact event taxonomy is
// unresolved and deferred to DA-page testing — this builds against its "Required events"
// list as a best guess, not a confirmed schema.
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

// Shared by both carousels' onCardClick — opens the real Session Guide detail view (no local
// modal, see the plan's Architecture Decisions) and tracks it in one call instead of repeating
// this pair at each call site.
export function openSessionDetail(session) {
  openSessionGuideDetail(session.id);
  trackBroadcastEvent(`Broadcast-Session-Detail-Open | ${session.id}`);
}

// No CTA-tagged entry-point query param exists (the ticket's AC just says "entry-point
// dimension" without naming a concrete mechanism) — same-origin referrer path is the only
// signal reliably available before the page itself is interacted with.
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
