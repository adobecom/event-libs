import { openSessionGuideDetail } from '../../../../utils/session-store.js';
import { trackAnalyticsEvent } from '../../../../utils/analytics.js';

export function trackBroadcastEvent(name) {
  trackAnalyticsEvent(name, 'session-broadcast');
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
