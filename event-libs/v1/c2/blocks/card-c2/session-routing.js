import { safeUrl } from '../../../blocks/sessions-guide/utils/url.js';
import { deriveSessionState } from '../../../utils/session-state.js';
import { openSessionGuideDetail } from '../../../utils/session-store.js';
import MobileRiderController from '../../../services/sessions/mobile-rider-controller.js';

const MR_POLL_INTERVAL_MS = 30 * 1000;

const liveStreamActiveIds = new Set();
let mrPollStarted = false;

function startMobileRiderPolling() {
  if (mrPollStarted) return;
  mrPollStarted = true;

  const streamIds = [...document.querySelectorAll('.card-c2[data-mr-stream-id]')]
    .map((card) => card.dataset.mrStreamId);
  if (!streamIds.length) return;

  const controller = new MobileRiderController();
  const poll = async () => {
    try {
      const { active = [] } = await controller.getMediaStatus(streamIds);
      liveStreamActiveIds.clear();
      active.forEach((id) => liveStreamActiveIds.add(id));
    } catch (e) {
      window.lana?.log(`card-c2 routing: MR poll failed: ${e.message}`);
    }
  };

  poll();
  setInterval(poll, MR_POLL_INTERVAL_MS);
}

const TIMING_OVERRIDE_OFFSET_MS = (() => {
  const raw = new URLSearchParams(window.location.search).get('timing');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed - Date.now() : null;
})();

function now() {
  return TIMING_OVERRIDE_OFFSET_MS === null ? Date.now() : Date.now() + TIMING_OVERRIDE_OFFSET_MS;
}

export function resolveCardAction(dataset, nowMs = now(), activeStreamIds = liveStreamActiveIds) {
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
