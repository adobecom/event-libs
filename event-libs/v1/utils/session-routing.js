import { safeUrl } from './utils.js';
import { deriveSessionState, getNowMs, getWatchDestination } from './session-state.js';
import { openSessionGuideDetail } from './session-store.js';
import { registerStreamIds, subscribe } from '../services/sessions/poller.js';

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

// Exposed so callers (e.g. event-card's live CTA text) can read the same MR poll
// results this module already maintains, instead of running a second poller.
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

  const url = safeUrl(getWatchDestination({
    sessionPageUrl: sessionUrl,
    isLivestreamed: dataset.isLivestreamed === 'true',
    isOnline: dataset.isOnline === 'true',
  }, state));
  return url ? { type: 'navigate', url } : { type: 'none' };
}

function runAction(action) {
  if (action.type === 'session-guide') {
    openSessionGuideDetail(action.sessionId);
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

  // The card's own CTA <a> (card-cta / featured-sessions' entry.url link) is part of
  // this same clickable card, not an independent link — routing it through
  // resolveCardAction (rather than letting its href navigate directly) keeps an
  // "upcoming" session's CTA opening the session guide detail overlay too, same as
  // clicking anywhere else on the card.
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
