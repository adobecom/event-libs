import {
  html, h, useState, useEffect,
} from '../../../../deps/htm-preact.js';
import {
  sessions, sessionsStatus, liveStreamActiveIds, sessionStateVersion, initSessionState,
  getEventApiConfig, watchSameSessionRequest,
} from '../../../../utils/session-store.js';
import { getNowMs, isPostEvent } from '../../../../utils/session-state.js';
import { getSessionGuidePath } from '../../../../utils/tier-1-event-config.js';
import { MAX_EVENT_PAGES } from '../../../../utils/constances.js';
import { safeUrl } from '../../../../utils/utils.js';
import { showToast } from '../../../../features/toast/toast.js';
import { SessionGuideProvider } from '../../sessions-guide/store/index.js';
import { detectUserTimezone } from '../../sessions-guide/utils/time.js';
import { findSessionByParam } from '../../sessions-guide/utils/url.js';
import { LoadingState, sessionsStatusMessage } from '../../sessions-guide/components/LoadingState.js';
import { getBroadcastSchedule, isSessionLiveNow } from '../utils/broadcast-schedule.js';
import {
  readWatchParam, stripWatchParam, pushSessionState, getHistorySessionId,
  persistActiveSession, getPersistedSessionId, clearPersistedSession,
} from '../utils/broadcast-url.js';
import {
  logBucketGroups, logActiveSession, logTickStart, logTickEnd,
} from '../utils/broadcast-debug.js';
import { trackBroadcastEvent, getEntryPoint } from '../utils/broadcast-analytics.js';
import { PlayerHost } from './PlayerHost.js';
import { SessionInfoPanel } from './SessionInfoPanel.js';
import { EndedState } from './EndedState.js';
import { AlsoLiveCarousel } from './AlsoLiveCarousel.js';
import { UpNextCarousel } from './UpNextCarousel.js';

// LiveCard/Carousel hard-depend on useSessionGuide(); surface: 'page' routes click/watch
// handling through onCardClick/onWatchSamePage below instead of LiveCard's own.
const GUIDE_CONFIG = { userTz: detectUserTimezone(), surface: 'page', theme: 'light' };

// See the SCHEDULE_REFRESH_MS effect below for why this page needs its own tick separate from
// the shared sessionStateVersion one. Exported for tests, same as LiveCard.js's PROGRESS_REFRESH_MS.
export const SCHEDULE_REFRESH_MS = 5_000;

// Exported separately so tests can call it without mounting the Provider tree.
export function BroadcastBody({ config }) {
  // sessionStorage backs up history.state — the latter isn't guaranteed to survive a hard
  // refresh (see broadcast-url.js).
  const [manualSessionId, setManualSessionId] = useState(
    () => getHistorySessionId() || getPersistedSessionId(),
  );
  const [entryResolved, setEntryResolved] = useState(false);

  useEffect(() => {
    initSessionState();
    trackBroadcastEvent(`Broadcast-Page-View | ${getEntryPoint()}`);
  }, []);

  // Manual switches update history.state directly; this only covers back/forward.
  useEffect(() => {
    function handlePopState() { setManualSessionId(getHistorySessionId()); }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (manualSessionId) persistActiveSession(manualSessionId);
  }, [manualSessionId]);

  // One-shot ?watch= resolution (named to avoid colliding with sessions-guide's own ?session=).
  // Must resolve to something live now or get discarded — it's new intent, not a resumed one.
  useEffect(() => {
    if (entryResolved || sessionsStatus.value !== 'ready') return;
    setEntryResolved(true);
    const watchId = readWatchParam();
    if (!watchId) return;
    const nowMs = getNowMs();
    const requested = findSessionByParam(sessions.value, watchId);
    const isLive = requested && isSessionLiveNow(requested, liveStreamActiveIds.value, nowMs);
    if (isLive) {
      setManualSessionId(requested.id);
    } else {
      showToast({ message: 'That session has ended — showing what’s live now.', variant: 'informative' });
      setManualSessionId(null);
      // Clears persisted storage too, so a refresh right after a dead link can't resurrect it.
      clearPersistedSession();
    }
    stripWatchParam(isLive ? requested.id : null);
  }, [sessionsStatus.value]);

  function handleSwitchSession(session) {
    pushSessionState(session.id);
    setManualSessionId(session.id);
    trackBroadcastEvent(`Broadcast-Session-Switch | ${session.id}`);
  }

  // Session Guide's widget is a separate mount with no prop-level path into Broadcast's state —
  // requestWatchSameSession() is the only channel. Re-validated live since the request could be
  // stale by the time it fires.
  useEffect(() => watchSameSessionRequest.subscribe((request) => {
    if (!request) return;
    const requested = sessions.value.find((s) => s.id === request.sessionId);
    if (requested && isSessionLiveNow(requested, liveStreamActiveIds.value, getNowMs())) {
      handleSwitchSession(requested);
    }
  }), []);

  // sessionStateVersion (below) only catches transitions the shared session-state ticker can
  // see -- and that ticker diffs deriveSessionState(), which is endTimeUtc-only. It never looks
  // at videoDuration, so an MPC session whose real video ends before/after its authored
  // endTimeUtc can sit stuck in `schedule.activeSession`/`alsoLive` indefinitely: this page's own
  // isSessionLiveNow()/sessionEndsAtMs() (broadcast-schedule.js) *are* videoDuration-aware, but
  // nothing re-runs them once deriveSessionState's own verdict for that session stops changing
  // (which can be forever, if the session's endTimeUtc has already passed before its video has).
  // This dedicated, page-local tick forces a re-render regardless, so that check actually gets
  // re-evaluated on a short cadence -- same pattern as LiveCard.js's PROGRESS_REFRESH_MS, just
  // scoped to this page instead of touching the shared ticker every other surface also depends on.
  const [, forceScheduleTick] = useState(0);
  useEffect(() => {
    if (sessionsStatus.value !== 'ready') return undefined;
    const id = setInterval(() => forceScheduleTick((n) => n + 1), SCHEDULE_REFRESH_MS);
    return () => clearInterval(id);
  }, [sessionsStatus.value]);

  // Forces a re-render on time-driven state transitions; value itself unused.
  // eslint-disable-next-line no-unused-expressions
  sessionStateVersion.value;
  const nowMs = getNowMs();
  const schedule = getBroadcastSchedule(sessions.value, liveStreamActiveIds.value, nowMs, {
    activeSessionId: manualSessionId,
  });
  logTickStart(nowMs);
  logBucketGroups(sessions.value, liveStreamActiveIds.value, nowMs);
  logActiveSession(schedule, nowMs);
  logTickEnd();

  // getBroadcastSchedule returns pendingCandidates instead of picking — this is the one place
  // Math.random() runs. Depends on length, not the array, since a fresh reference every render
  // would otherwise re-roll.
  useEffect(() => {
    if (!entryResolved) return;
    if (schedule.pendingCandidates?.length) {
      const picked = schedule.pendingCandidates[Math.floor(Math.random() * schedule.pendingCandidates.length)];
      setManualSessionId(picked.id);
      return;
    }
    if (schedule.activeSession && schedule.activeSession.id !== manualSessionId) {
      setManualSessionId(schedule.activeSession.id);
      return;
    }
    // First-time visitor on a gap: endedSession is synthesized though nothing was committed —
    // locking it in lets resolveBucketSchedule's ended/next-group walk-forward take over.
    if (schedule.endedSession && schedule.endedSession.id !== manualSessionId) {
      setManualSessionId(schedule.endedSession.id);
    }
  }, [
    entryResolved, manualSessionId,
    schedule.activeSession?.id, schedule.pendingCandidates?.length, schedule.endedSession?.id,
  ]);

  // Redirects once nothing is live/also-live/upcoming — the whole event has aired, not just today.
  useEffect(() => {
    if (sessionsStatus.value !== 'ready') return;
    if (schedule.activeSession || schedule.alsoLive.length || schedule.upNext.length) return;
    const eventEndMs = getEventApiConfig()?.eventEndMs;
    if (isPostEvent(sessions.value, liveStreamActiveIds.value, nowMs, eventEndMs)) {
      window.location.href = getSessionGuidePath() || MAX_EVENT_PAGES.sessionGuide;
    }
  });

  // pendingCandidates counts as "something" — it resolves to activeSession within the same
  // tick, so the empty state mustn't flash in between (alsoLive excludes pending candidates
  // now, so this can't be inferred from it alone).
  const nothingAtAll = !schedule.activeSession && !schedule.endedSession
    && !schedule.pendingCandidates?.length && !schedule.alsoLive.length && !schedule.upNext.length;

  // Feeds .sb-app:has(.sb-ended) in session-broadcast.css. --sb-app-ended-bg-lg is optional;
  // tablet CSS falls back to --sb-app-ended-bg when absent.
  const endedActive = !schedule.activeSession && !!schedule.endedSession;
  const endedBgUrl = endedActive ? safeUrl(config.sessionEndedImageUrl) : '';
  const endedBgUrlLarge = endedActive ? safeUrl(config.sessionEndedImageUrlLarge) : '';
  const appStyle = endedBgUrl
    ? `--sb-app-ended-bg: url("${endedBgUrl}");${endedBgUrlLarge ? ` --sb-app-ended-bg-lg: url("${endedBgUrlLarge}");` : ''}`
    : '';

  return html`
    <div class="sb-app" aria-busy=${String(sessionsStatus.value === 'loading')} style=${appStyle}>
      <div class="sb-sr-only" role="status" aria-live="polite">${sessionsStatusMessage(sessionsStatus.value)}</div>
      ${sessionsStatus.value === 'loading' && html`<${LoadingState} />`}
      ${sessionsStatus.value === 'error' && html`<div class="sb-error" role="alert">Failed to load sessions.</div>`}
      ${sessionsStatus.value === 'ready' && html`
        ${schedule.activeSession && html`
          <${PlayerHost} session=${schedule.activeSession} />
          <${SessionInfoPanel} session=${schedule.activeSession} viewAllDetailsLabel=${config.viewAllDetailsLabel} />
        `}
        ${endedActive && html`<${EndedState} session=${schedule.endedSession} />`}
        <${AlsoLiveCarousel} sessions=${schedule.alsoLive} title=${config.alsoLiveTitle} onSwitchSession=${handleSwitchSession} />
        <${UpNextCarousel} sessions=${schedule.upNext} title=${config.upcomingTitle} />
        ${nothingAtAll && html`
          <div class="sb-empty" role="status" aria-live="polite">No sessions are live right now.</div>
        `}
      `}
    </div>
  `;
}

// h(), not the html tag — Context.Provider needs h()'s lazy-vnode timing to set its context
// value before children evaluate.
export function BroadcastApp({ config = {} }) {
  return h(SessionGuideProvider, { guideConfig: GUIDE_CONFIG }, h(BroadcastBody, { config }));
}
