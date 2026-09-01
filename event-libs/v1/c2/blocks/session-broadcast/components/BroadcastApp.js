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
import { logBroadcastSchedule, logBucketGroups } from '../utils/broadcast-debug.js';
import { trackBroadcastEvent, getEntryPoint } from '../utils/broadcast-analytics.js';
import { PlayerHost } from './PlayerHost.js';
import { SessionInfoPanel } from './SessionInfoPanel.js';
import { EndedState } from './EndedState.js';
import { AlsoLiveCarousel } from './AlsoLiveCarousel.js';
import { UpNextCarousel } from './UpNextCarousel.js';

// Minimal config for LiveCard/Carousel, which hard-depend on useSessionGuide() — no drawer,
// filters, or day-tabs here. surface: 'page' defers click/watch handling to the
// onCardClick/onWatchSamePage props passed below instead of LiveCard's own.
const GUIDE_CONFIG = { userTz: detectUserTimezone(), surface: 'page', theme: 'light' };

// Exported separately so tests can call it directly, without mounting the Provider tree.
export function BroadcastBody({ config }) {
  // history.state covers SPA back/forward; sessionStorage handles cross-refresh persistence
  // since history.state restoration on a hard reload isn't code-guaranteed (see broadcast-url.js).
  const [manualSessionId, setManualSessionId] = useState(
    () => getHistorySessionId() || getPersistedSessionId(),
  );
  const [entryResolved, setEntryResolved] = useState(false);

  useEffect(() => {
    initSessionState();
    trackBroadcastEvent(`Broadcast-Page-View | ${getEntryPoint()}`);
  }, []);

  // Back/forward fires popstate; manual switches update history.state directly instead.
  useEffect(() => {
    function handlePopState() { setManualSessionId(getHistorySessionId()); }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Keep sessionStorage in sync with every commitment change so a hard refresh can resume
  // where the viewer left off.
  useEffect(() => {
    if (manualSessionId) persistActiveSession(manualSessionId);
  }, [manualSessionId]);

  // One-shot: resolves `?watch=` once the catalog loads (named `watch`, not `session`, since
  // sessions-guide's own widget already owns that param). A fresh link must resolve to something
  // live right now or be discarded entirely — it's new intent, not a resumed commitment.
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
      // Also clears persisted storage, not just in-memory state, so a refresh right after a
      // dead link can't resurrect the prior (now-invalid) commitment.
      clearPersistedSession();
    }
    stripWatchParam(isLive ? requested.id : null);
  }, [sessionsStatus.value]);

  function handleSwitchSession(session) {
    pushSessionState(session.id);
    setManualSessionId(session.id);
    trackBroadcastEvent(`Broadcast-Session-Switch | ${session.id}`);
  }

  // The Session Guide widget's own live-session cards/detail overlay are a separate mount
  // with no prop-level switch path back into Broadcast's player state — this shared signal
  // (requestWatchSameSession() in session-store.js) is the only channel. Re-validated live
  // here rather than trusting the click, since the request could be stale by the time it fires.
  useEffect(() => watchSameSessionRequest.subscribe((request) => {
    if (!request) return;
    const requested = sessions.value.find((s) => s.id === request.sessionId);
    if (requested && isSessionLiveNow(requested, liveStreamActiveIds.value, getNowMs())) {
      handleSwitchSession(requested);
    }
  }), []);

  // Re-render on time-driven session-state transitions; value itself is unused.
  // eslint-disable-next-line no-unused-expressions
  sessionStateVersion.value;
  const nowMs = getNowMs();
  const schedule = getBroadcastSchedule(sessions.value, liveStreamActiveIds.value, nowMs, {
    activeSessionId: manualSessionId,
  });
  logBroadcastSchedule(schedule);
  logBucketGroups(sessions.value, liveStreamActiveIds.value, nowMs);

  // getBroadcastSchedule stays pure and returns `pendingCandidates` instead of picking; this
  // effect is the one place Math.random() runs, locking in the pick once. Depends on candidates'
  // length, not the array itself, since a fresh reference every render would otherwise re-roll.
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
    // First-time visitor landing on a gap: `endedSession` is synthesized even though nothing was
    // actually committed yet. Locking it in here lets the normal ended/next-group walk-forward
    // in resolveBucketSchedule take over as if the viewer really had been watching it.
    if (schedule.endedSession && schedule.endedSession.id !== manualSessionId) {
      setManualSessionId(schedule.endedSession.id);
    }
  }, [
    entryResolved, manualSessionId,
    schedule.activeSession?.id, schedule.pendingCandidates?.length, schedule.endedSession?.id,
  ]);

  // Redirect to on-demand once nothing is live, also-live, or upcoming — i.e. the whole event
  // has aired, not just the current day.
  useEffect(() => {
    if (sessionsStatus.value !== 'ready') return;
    if (schedule.activeSession || schedule.alsoLive.length || schedule.upNext.length) return;
    const eventEndMs = getEventApiConfig()?.eventEndMs;
    if (isPostEvent(sessions.value, liveStreamActiveIds.value, nowMs, eventEndMs)) {
      window.location.href = getSessionGuidePath() || MAX_EVENT_PAGES.sessionGuide;
    }
  });

  // pendingCandidates counts as "something" — it resolves to an activeSession within the same
  // tick via the auto-commit effect above, so the empty state must not flash in between (alsoLive
  // now correctly excludes pending candidates, so this can't be inferred from alsoLive alone).
  const nothingAtAll = !schedule.activeSession && !schedule.endedSession
    && !schedule.pendingCandidates?.length && !schedule.alsoLive.length && !schedule.upNext.length;

  // Feeds session-broadcast.css's .sb-app:has(.sb-ended) background rules (lives on .sb-app,
  // not EndedState.js). --sb-app-ended-bg-lg is optional — set only when a bigger source exists;
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
