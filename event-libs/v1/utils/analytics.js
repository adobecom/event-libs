import { logError } from './lana-log.js';

// Milo's decorateDefaultLinkAnalytics (martech/attributes.js) rewrites the daa-ll of any link or
// button it sees: each `-`-separated part loses punctuation and is cut to 20 characters. The title
// is pre-processed the same way, so the label is identical whether or not Milo gets to it first.
const INVALID_CHARACTERS = /[^\u00C0-\u1FFF\u2C00-\uD7FF\w]+/g;
const MILO_LABEL_PART_LIMIT = 20;

const cleanPart = (part) => part.replace(INVALID_CHARACTERS, ' ').trim().replace(/^_+|_+$/g, '').trim();

// Appends what a control acts on, Milo-style (`Session-Card-Open--Photoshop First Look`), so
// Analytics can tell which session was clicked.
export function withDaaLlTitle(label, title) {
  const cleaned = String(title ?? '').split('-').map(cleanPart).filter(Boolean)
    .join('-')
    .slice(0, MILO_LABEL_PART_LIMIT)
    .replace(/[\s_-]+$/, '');
  return cleaned ? `${label}--${cleaned}` : label;
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
