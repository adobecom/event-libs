import {
  html, h, useState, useEffect,
} from '../../../../deps/htm-preact.js';
import {
  sessions, sessionsStatus, liveStreamActiveIds, sessionStateVersion, initSessionState,
  getEventApiConfig,
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
// filters, or day-tabs here. surface: 'page' keeps LiveCard's own click/watch handling out of
// the way in favor of the onCardClick/onWatchSamePage props passed below.
const GUIDE_CONFIG = { userTz: detectUserTimezone(), surface: 'page', theme: 'light' };

// Exported separately so tests can call it directly, without mounting the Provider tree.
export function BroadcastBody({ config }) {
  // history.state covers back/forward within the SPA session; sessionStorage is the actual
  // cross-refresh persistence mechanism (history.state restoration on a hard reload isn't
  // code-guaranteed) — see broadcast-url.js.
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

  // Keep sessionStorage in sync with every commitment change (manual switch, initial pick, or
  // in-bucket auto-transition) so a hard refresh can resume where the viewer left off.
  useEffect(() => {
    if (manualSessionId) persistActiveSession(manualSessionId);
  }, [manualSessionId]);

  // One-shot: resolve the `?watch=` entry param once the catalog loads. Named `watch`, not
  // `session` — sessions-guide's own widget already owns that param for something else. Unlike a
  // sessionStorage/history-restored id, a fresh `?watch=` link must resolve to something
  // genuinely live right now or be discarded entirely (never "show ended state for it") — it's
  // explicit new intent, not a resumed commitment.
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
      // Discard any prior commitment outright, not just the in-memory state — a refresh right
      // after landing on a dead link, before anything new gets a chance to commit, must not
      // resurrect whatever was persisted before this explicit (now-invalid) intent arrived.
      clearPersistedSession();
    }
    stripWatchParam(isLive ? requested.id : null);
  }, [sessionsStatus.value]);

  function handleSwitchSession(session) {
    pushSessionState(session.id);
    setManualSessionId(session.id);
    trackBroadcastEvent(`Broadcast-Session-Switch | ${session.id}`);
  }

  // Re-render on time-driven session-state transitions; value itself is unused.
  // eslint-disable-next-line no-unused-expressions
  sessionStateVersion.value;
  const nowMs = getNowMs();
  const schedule = getBroadcastSchedule(sessions.value, liveStreamActiveIds.value, nowMs, {
    activeSessionId: manualSessionId,
  });
  logBroadcastSchedule(schedule);
  logBucketGroups(sessions.value, liveStreamActiveIds.value, nowMs);

  // The one place random picks happen: getBroadcastSchedule stays pure (safe to recompute every
  // render) and returns `pendingCandidates` instead of picking, so this effect can do the actual
  // Math.random() exactly once and lock in the result — covers the very first pick AND every
  // later in-bucket auto-transition (both look the same: the schedule proposed a session that
  // isn't yet the committed one). Depend on candidates' length, not the array itself — a fresh
  // array reference every render would otherwise re-fire this (and re-roll) on unrelated renders.
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
    // A first-time visitor landing on a gap: getBroadcastSchedule synthesized the most recently
    // aired session as `endedSession` even though nothing was ever actually committed. Locking it
    // in here (same as any other proposal above) turns it into a real commitment, so the ordinary
    // ended/next-group walk-forward in resolveBucketSchedule takes over from here on exactly as
    // if the viewer really had been watching it.
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

  const nothingAtAll = !schedule.activeSession && !schedule.endedSession
    && !schedule.alsoLive.length && !schedule.upNext.length;

  // Feeds session-broadcast.css's .sb-app:has(.sb-ended) background rules (see that file for
  // why this lives on .sb-app, not EndedState.js). --sb-app-ended-bg-lg is optional — only set
  // when the authored row's <picture> (if any) yielded a bigger source; the tablet CSS falls
  // back to --sb-app-ended-bg when it's absent, so this never regresses the single-image case.
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
