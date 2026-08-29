import {
  html, h, useState, useEffect,
} from '../../../../deps/htm-preact.js';
import {
  sessions, sessionsStatus, liveStreamActiveIds, sessionStateVersion, initSessionState,
} from '../../../../utils/session-store.js';
import { getNowMs } from '../../../../utils/session-state.js';
import { showToast } from '../../../../features/toast/toast.js';
import { SessionGuideProvider } from '../../sessions-guide/store/index.js';
import { detectUserTimezone } from '../../sessions-guide/utils/time.js';
import { findSessionByParam } from '../../sessions-guide/utils/url.js';
import { LoadingState, sessionsStatusMessage } from '../../sessions-guide/components/LoadingState.js';
import { getBroadcastSchedule, getLiveSessions } from '../utils/broadcast-schedule.js';
import { readWatchParam, stripWatchParam, pushSessionState, getHistorySessionId } from '../utils/broadcast-url.js';
import { logBroadcastSchedule } from '../utils/broadcast-debug.js';
import { PlayerHost } from './PlayerHost.js';
import { SessionInfoPanel } from './SessionInfoPanel.js';
import { AlsoLiveCarousel } from './AlsoLiveCarousel.js';
import { UpNextCarousel } from './UpNextCarousel.js';

// Only what LiveCard/Carousel need to exist at all (they hard-depend on useSessionGuide())
// — session-broadcast has no drawer, no filters/search/day-tabs, so everything else the
// reducer tracks is simply unused. surface is 'page' (not 'widget') so LiveCard's own
// in-widget click/watch handling stays out of the way in favor of the onCardClick/
// onWatchSamePage props threaded through below. See the plan's Architecture Decisions for
// why this is a minimal Provider wrap rather than a parallel lightweight Context.
const GUIDE_CONFIG = { userTz: detectUserTimezone(), surface: 'page', theme: 'light' };

// Exported alongside BroadcastApp purely for direct testability (same reason Carousel/LiveCard
// export a plain function callers can invoke with a mocked SessionGuideContext, rather than
// mounting the whole Provider-wrapped tree — see test/unit's LiveCard.test.js/Carousel.test.js).
export function BroadcastBody({ config }) {
  const [manualSessionId, setManualSessionId] = useState(() => getHistorySessionId());
  const [entryResolved, setEntryResolved] = useState(false);

  useEffect(() => { initSessionState(); }, []);

  // Manual switches (via onSwitchSession below) update history.state directly; back/forward
  // navigation fires popstate instead, so this is the only way this state changes for that path.
  useEffect(() => {
    function handlePopState() { setManualSessionId(getHistorySessionId()); }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // One-shot entry-param resolution, once the catalog is loaded (need it to know whether the
  // requested session is actually live). readWatchParam()/stripWatchParam() are the `watch`-
  // named entry param (see broadcast-url.js) — deliberately not `session`, which sessions-guide's
  // own widget already owns for a different purpose (see the plan's URL param naming note).
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
  }

  // Re-render dependency on time-driven session-state transitions — value itself is unused.
  // eslint-disable-next-line no-unused-expressions
  sessionStateVersion.value;
  const nowMs = getNowMs();
  const schedule = getBroadcastSchedule(sessions.value, liveStreamActiveIds.value, nowMs, {
    activeSessionId: manualSessionId,
  });
  logBroadcastSchedule(sessions.value, liveStreamActiveIds.value, nowMs, schedule);

  return html`
    <div class="sb-app" aria-busy=${String(sessionsStatus.value === 'loading')}>
      <div class="sb-sr-only" role="status" aria-live="polite">${sessionsStatusMessage(sessionsStatus.value)}</div>
      ${sessionsStatus.value === 'loading' && html`<${LoadingState} />`}
      ${sessionsStatus.value === 'error' && html`<div class="sb-error" role="alert">Failed to load sessions.</div>`}
      ${sessionsStatus.value === 'ready' && html`
        <${PlayerHost} session=${schedule.activeSession} />
        <${SessionInfoPanel} session=${schedule.activeSession} viewAllDetailsLabel=${config.viewAllDetailsLabel} />
        <${AlsoLiveCarousel} sessions=${schedule.alsoLive} title=${config.alsoLiveTitle} onSwitchSession=${handleSwitchSession} />
        <${UpNextCarousel} sessions=${schedule.upNext} title=${config.upcomingTitle} />
        ${!schedule.activeSession && !schedule.upNext.length && html`
          <div class="sb-empty" role="status" aria-live="polite">No sessions are live right now.</div>
        `}
      `}
    </div>
  `;
}

// h(), not the html tagged template, for the Provider wrap — same reason
// sessions-guide.js's own init() does: a Context.Provider needs the lazy-vnode timing h()
// gives it (Provider runs and sets its context value before children are evaluated).
export function BroadcastApp({ config = {} }) {
  return h(SessionGuideProvider, { guideConfig: GUIDE_CONFIG }, h(BroadcastBody, { config }));
}
