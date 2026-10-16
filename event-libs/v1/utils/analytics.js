import { logError } from './lana-log.js';

const toDaaLhPart = (value) => String(value ?? '').replace(/\|/g, '-').replace(/\s+/g, ' ').trim();

// Launch appends the daa-lh of a clicked label's element and its ancestors to the link name as
// `|`-separated segments, and keeps them verbatim. Pipes inside a value are replaced so they can't
// add segments. Returns undefined when empty, so Preact omits the attribute.
export function toDaaLh(...parts) {
  return parts.map(toDaaLhPart).filter(Boolean).join('|') || undefined;
}

// Names the session for every control inside the element that carries it, e.g.
// `Add-to-Favorites|s2|b1|sessions-guide-|GS2-0|Inspiration Keynote - ASL`. The code comes first:
// it's unique, so it still identifies the session if Analytics truncates a long title.
export function sessionDaaLh(session) {
  return toDaaLh(session?.sessionCode, session?.title);
}

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
