import { safeUrl } from './utils.js';
import { deriveSessionState, getNowMs } from './session-state.js';
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

export function resolveCardAction(dataset, nowMs = getNowMs(), activeStreamIds = liveStreamActiveIds) {
  const { sessionId, sessionUrl, watchUrl, mrStreamId } = dataset;
  const state = deriveSessionState(
    { startTimeUtc: dataset.startTimeUtc, endTimeUtc: dataset.endTimeUtc, mrStreamId },
    activeStreamIds,
    nowMs,
  );

  if (state === 'upcoming') {
    return sessionId ? { type: 'session-guide', sessionId } : { type: 'none' };
  }

  const url = safeUrl(state === 'live' ? (watchUrl || sessionUrl) : sessionUrl);
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

  el.addEventListener('click', (e) => {
    if (e.target.closest('a') && (e.metaKey || e.ctrlKey || e.shiftKey)) return;
    e.preventDefault();
    activate();
  });

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  });
}
