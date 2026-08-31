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
import { getBroadcastSchedule, getLiveSessions } from '../utils/broadcast-schedule.js';
import { readWatchParam, stripWatchParam, pushSessionState, getHistorySessionId } from '../utils/broadcast-url.js';
import { logBroadcastSchedule } from '../utils/broadcast-debug.js';
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
  const [manualSessionId, setManualSessionId] = useState(() => getHistorySessionId());
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

  // One-shot: resolve the `?watch=` entry param once the catalog loads. Named `watch`, not
  // `session` — sessions-guide's own widget already owns that param for something else.
  useEffect(() => {
    if (entryResolved || sessionsStatus.value !== 'ready') return;
    setEntryResolved(true);
    const watchId = readWatchParam();
    if (!watchId) return;
    const nowMs = getNowMs();
    const requested = findSessionByParam(sessions.value, watchId);
    const isLive = requested
      && getLiveSessions(sessions.value, liveStreamActiveIds.value, nowMs).some((s) => s.id === requested.id);
    if (isLive) {
      setManualSessionId(requested.id);
    } else {
      showToast({ message: 'That session has ended — showing what’s live now.', variant: 'informative' });
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

  // The only automatic pick: once entry-param resolution has had its chance and nothing's been
  // committed yet, lock in whatever getBroadcastSchedule's initial-load fallback picked.
  useEffect(() => {
    if (!entryResolved || manualSessionId) return;
    if (schedule.activeSession) setManualSessionId(schedule.activeSession.id);
  }, [entryResolved, manualSessionId, schedule.activeSession?.id]);

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
  // why this lives on .sb-app, not EndedState.js).
  const endedActive = !schedule.activeSession && !!schedule.endedSession;
  const endedBgUrl = endedActive ? safeUrl(config.sessionEndedImageUrl) : '';
  const appStyle = endedBgUrl ? `--sb-app-ended-bg: url("${endedBgUrl}")` : '';

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
