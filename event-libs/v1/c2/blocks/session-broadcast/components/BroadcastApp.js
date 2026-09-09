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

// surface:'page' routes clicks through onCardClick/onWatchSamePage instead of LiveCard's own.
const GUIDE_CONFIG = { userTz: detectUserTimezone(), surface: 'page', theme: 'light' };

// Exported for tests; see the effect below for why this needs its own tick.
export const SCHEDULE_REFRESH_MS = 5_000;

// Exported separately so tests can call it without mounting the Provider tree.
export function BroadcastBody({ config }) {
  // sessionStorage backs up history.state, which isn't guaranteed to survive a hard refresh.
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

  // One-shot ?watch= resolution; must resolve to something live now or get discarded.
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

  // Session Guide's widget has no prop path in - watchSameSessionRequest is the only channel.
  useEffect(() => watchSameSessionRequest.subscribe((request) => {
    if (!request) return;
    const requested = sessions.value.find((s) => s.id === request.sessionId);
    if (requested && isSessionLiveNow(requested, liveStreamActiveIds.value, getNowMs())) {
      handleSwitchSession(requested);
    }
  }), []);

  // This page's own tick re-checks MPC video-duration liveness, which the shared ticker can miss.
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

  // Depends on length, not the array, so a fresh reference each render doesn't re-roll the pick.
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
    // Locks in the synthesized endedSession so the next-group walk-forward can take over.
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

  // pendingCandidates counts as "something" so the empty state doesn't flash before it resolves.
  const nothingAtAll = !schedule.activeSession && !schedule.endedSession
    && !schedule.pendingCandidates?.length && !schedule.alsoLive.length && !schedule.upNext.length;

  // Feeds .sb-app:has(.sb-ended) in the CSS; --sb-app-ended-bg-lg falls back to --sb-app-ended-bg.
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

// h(), not the html tag - Context.Provider needs h()'s lazy-vnode timing to set context first.
export function BroadcastApp({ config = {} }) {
  return h(SessionGuideProvider, { guideConfig: GUIDE_CONFIG }, h(BroadcastBody, { config }));
}
