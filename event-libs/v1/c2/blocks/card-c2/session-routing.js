import { safeUrl } from '../../../blocks/sessions-guide/utils/url.js';
import { deriveSessionState } from '../../../utils/session-state.js';
import { openSessionGuideDetail } from '../../../utils/session-store.js';
import MobileRiderController from '../../../services/sessions/mobile-rider-controller.js';

const MR_POLL_INTERVAL_MS = 30 * 1000;

// Shared live-stream signal: which MR stream ids are currently broadcasting, per the
// latest poll. deriveSessionState reads this to distinguish a live MR session from an
// upcoming/on-demand one (non-MR sessions ignore it and use pure time-window).
const liveStreamActiveIds = new Set();
let mrPollStarted = false;

// Polls every MR stream id present on featured-session cards and refreshes the shared
// live set. Started once, lazily, when the first MR-backed card is wired up.
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

/**
 * Testing-only clock override: `?timing=<epoch-ms>` in the page URL lets QA simulate
 * "now" as any instant (e.g. mid-live) without waiting for real time. Read once at
 * module load as an *offset* from the real clock so `now()` still advances in real
 * time. Absent/invalid falls back to the real `Date.now()`. Mirrors the identical
 * override in the upcoming-sessions block.
 */
const TIMING_OVERRIDE_OFFSET_MS = (() => {
  const raw = new URLSearchParams(window.location.search).get('timing');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed - Date.now() : null;
})();

function now() {
  return TIMING_OVERRIDE_OFFSET_MS === null ? Date.now() : Date.now() + TIMING_OVERRIDE_OFFSET_MS;
}

/**
 * Resolves where a Featured Sessions card should route, from its data-* attributes.
 * Mirrors the click rules established for Upcoming Sessions / Session Guide:
 *   upcoming  → open the Session Guide modal to this session's detail (?session=)
 *   live      → the streaming destination (watch URL, falling back to the session page)
 *   on-demand → the individual Session Page
 * @returns {{ type: 'session-guide', sessionId: string }
 *          | { type: 'navigate', url: string }
 *          | { type: 'none' }}
 */
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

/**
 * Makes a hydrated session card clickable, routing per its resolved state. The whole
 * card is the click target (ticket default); the authored `.card-cta` link stays a
 * real anchor for keyboard/right-click, but its plain click defers to the same router
 * so behavior can't diverge.
 */
export default function attachSessionRouting(el) {
  if (!el.dataset.sessionId) return;

  if (el.dataset.mrStreamId) startMobileRiderPolling();

  el.setAttribute('role', 'link');
  el.tabIndex = 0;
  el.style.cursor = 'pointer';

  const activate = () => runAction(resolveCardAction(el.dataset));

  el.addEventListener('click', (e) => {
    // Let modified clicks on the CTA anchor (new tab, etc.) behave natively.
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
