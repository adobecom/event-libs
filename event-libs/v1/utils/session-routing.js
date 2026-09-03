import { LIBS, safeUrl } from './utils.js';
import { deriveSessionState, getNowMs, getWatchDestination } from './session-state.js';
import { openSessionGuideDetail } from './session-store.js';
import { getHomepagePath, getBroadcastPath } from './tier-1-event-config.js';
import { MAX_EVENT_PAGES } from './constances.js';
import { registerStreamIds, subscribe } from '../services/sessions/poller.js';

function normalizePath(path) {
  return (path || '').replace(/\/$/, '');
}

function resolveHomepageAction(dataset) {
  // No hardcoded fallback path: an unauthored homepagePath means "wherever this card
  // is currently rendered is the homepage" — lets this be tested from any page rather
  // than only ever resolving to a single hardcoded production path.
  const homepagePath = getHomepagePath() || window.location.pathname;
  const anchorId = dataset.homepageAnchorId;

  if (normalizePath(window.location.pathname) === normalizePath(homepagePath)) {
    return anchorId ? { type: 'scroll', anchorId } : { type: 'none' };
  }

  const url = safeUrl(anchorId ? `${homepagePath}#${anchorId}` : homepagePath);
  return url ? { type: 'navigate', url } : { type: 'none' };
}

const liveStreamActiveIds = new Set();
let mrPollStarted = false;

function startMobileRiderPolling() {
  if (mrPollStarted) return;
  mrPollStarted = true;

  const streamIds = [...document.querySelectorAll('.event-card[data-mr-stream-id]')]
    .map((card) => card.dataset.mrStreamId);
  if (!streamIds.length) return;

  const streamIdSet = new Set(streamIds);
  subscribe(({ active }) => {
    liveStreamActiveIds.clear();
    active.filter((id) => streamIdSet.has(id)).forEach((id) => liveStreamActiveIds.add(id));
  });
  registerStreamIds(streamIds);
}

export function getLiveStreamActiveIds() {
  return liveStreamActiveIds;
}

export function resolveCardAction(dataset, nowMs = getNowMs(), activeStreamIds = liveStreamActiveIds) {
  const { sessionId, sessionUrl, mrStreamId } = dataset;
  const state = deriveSessionState(
    { startTimeUtc: dataset.startTimeUtc, endTimeUtc: dataset.endTimeUtc, mrStreamId },
    activeStreamIds,
    nowMs,
  );

  if (state === 'upcoming') {
    return sessionId ? { type: 'session-guide', sessionId } : { type: 'none' };
  }

  if (state === 'live' && dataset.watchDestination === 'homepage') {
    return resolveHomepageAction(dataset);
  }

  if (state === 'live' && dataset.watchDestination === 'broadcast') {
    const url = safeUrl(getBroadcastPath() || MAX_EVENT_PAGES.broadcast);
    return url ? { type: 'navigate', url } : { type: 'none' };
  }

  const url = safeUrl(getWatchDestination({
    sessionPageUrl: sessionUrl,
    isLivestreamed: dataset.isLivestreamed === 'true',
    isOnline: dataset.isOnline === 'true',
  }, state));
  return url ? { type: 'navigate', url } : { type: 'none' };
}

async function runAction(action) {
  if (action.type === 'session-guide') {
    openSessionGuideDetail(action.sessionId);
  } else if (action.type === 'scroll') {
    const { scrollToHashedElement } = await import(`${LIBS}/utils/utils.js`);
    scrollToHashedElement(`#${action.anchorId}`);
  } else if (action.type === 'navigate') {
    window.location.assign(action.url);
  }
}

export default function attachSessionRouting(el) {
  if (!el.dataset.sessionId) return;

  if (el.dataset.mrStreamId) startMobileRiderPolling();

  el.setAttribute('role', 'link');
  el.tabIndex = 0;
  el.style.cursor = 'pointer';

  const activate = () => runAction(resolveCardAction(el.dataset));

  el.addEventListener('click', (e) => {
    e.preventDefault();
    activate();
  });

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.target.closest('a')) {
      e.preventDefault();
      activate();
    }
  });
}
