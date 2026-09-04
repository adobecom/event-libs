import { html, useMemo, useEffect } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import {
  sessions as sessionsSignal, scheduled as scheduledSignal,
  liveStreamActiveIds as liveStreamActiveIdsSignal, auth, sessionStateVersion,
} from '../../../../utils/session-store.js';
import { checkViewAccess, isAuthResolved } from '../../../../services/sessions/action-feedback.js';
import { TimeSlotRow } from './TimeSlotRow.js';
import { TrackRow } from './TrackRow.js';
import { Carousel } from './Carousel.js';
import { NoResultsFound } from './NoResultsFound.js';
import {
  groupByStartTime, groupByTrack, onDemandSessions, filterSessions, sessionsForDay, liveSessions,
  hasActiveSearchOrFilters,
} from '../utils/session-filters.js';
import { getNowMs, formatShortTime, formatTimezoneAbbr } from '../utils/time.js';
import { useIsPostEvent } from '../utils/use-post-event.js';
import { deriveSessionState } from '../../../../utils/session-state.js';

export const buildMySessionsView = () => MySessionsView;

export function MySessionsView() {
  const { state, dispatch } = useSessionGuide();
  const { mySessionsTab, activeDay } = state;
  const sessions = sessionsSignal.value;
  const scheduled = scheduledSignal.value;
  const liveStreamActiveIds = liveStreamActiveIdsSignal.value;
  const activeFilters = state.activeFilters || {};
  const searchQuery = state.searchQuery || '';
  const userTz = state.guideConfig?.userTz;
  // Read purely to establish a re-render dependency on time-driven session-state
  // transitions (see sessionStateVersion in session-store.js) — value itself is unused.
  // eslint-disable-next-line no-unused-expressions
  sessionStateVersion.value;
  const nowMs = getNowMs();
  const isPost = useIsPostEvent();

  // Logged-out/unregistered visitors never see this view's content — a toast fires and
  // they're bounced to a fallback view instead. Re-checked on every auth change, not just
  // mount, so it also catches URL-driven navigation and a session expiring mid-view.
  // Gated behind isAuthResolved() so a refresh landing straight on this view (e.g. a
  // restored ?view=my-sessions) doesn't bounce an already-registered visitor away before
  // auth has actually finished resolving — see isAuthResolved()'s own comment.
  const { isLoggedIn, isRegistered } = auth.value;
  const authResolved = isAuthResolved(auth.value);
  useEffect(() => {
    if (!authResolved) return;
    const fallback = checkViewAccess('my-sessions', { eventConfig: state.guideConfig });
    if (fallback) dispatch({ type: 'SET_VIEW', view: fallback });
  }, [authResolved, isLoggedIn, isRegistered]);
  if (!authResolved || !isLoggedIn || isRegistered !== true) return null;

  // Memoized: this component re-renders on every context dispatch (e.g. opening the
  // detail overlay), not just when the inputs below actually change.
  const { live, timeSlots, filteredOnDemand } = useMemo(() => {
    const scheduledSessions = sessions.filter((s) => scheduled.has(s.id));
    const dayScheduled = sessionsForDay(scheduledSessions, activeDay, userTz);

    const liveNow = liveSessions(scheduledSessions, liveStreamActiveIds, activeDay, userTz, nowMs)
      .sort((a, b) => (a.startTimeUtc < b.startTimeUtc ? -1 : 1));

    const activeAndUpcoming = dayScheduled.filter((s) => {
      const st = deriveSessionState(s, liveStreamActiveIds, nowMs);
      return st === 'upcoming';
    });
    const onDemandRaw = onDemandSessions(dayScheduled, liveStreamActiveIds, nowMs);

    const filteredUpcomingSessions = filterSessions(activeAndUpcoming, activeFilters, searchQuery);
    return {
      live: liveNow,
      timeSlots: groupByStartTime(filteredUpcomingSessions),
      filteredOnDemand: filterSessions(onDemandRaw, activeFilters, searchQuery),
    };
  }, [sessions, scheduled, liveStreamActiveIds, activeDay, userTz, nowMs, activeFilters, searchQuery]);

  const hasUpcoming = timeSlots.length > 0;
  const hasOnDemand = filteredOnDemand.length > 0;
  const bothEmpty = !hasUpcoming && !hasOnDemand;

  let effectiveTab = mySessionsTab;
  if (effectiveTab === 'upcoming' && !hasUpcoming) effectiveTab = 'on-demand';
  if (effectiveTab === 'on-demand' && !hasOnDemand) effectiveTab = 'upcoming';

  function setTab(tab) {
    dispatch({ type: 'SET_MY_TAB', tab });
  }

  return html`
    <div class="sg-view sg-view--my-sessions">
      ${live.length > 0 && html`
        <div class="sg-carousel-section sg-carousel-section--live">
          <${Carousel}
            sessions=${live}
            title="Live sessions"
            formatTime=${(s) => formatShortTime(s.startTimeUtc, userTz)}
            formatTimezone=${(s) => formatTimezoneAbbr(s.startTimeUtc, userTz)}
          />
        </div>
      `}
      ${bothEmpty ? (
        hasActiveSearchOrFilters(activeFilters, searchQuery)
          ? html`<${NoResultsFound} />`
          : html`
            <div class="sg-my-sessions__empty" role="status" aria-live="polite">
              <p>You currently have no scheduled sessions.</p>
              <button
                class="sg-my-sessions__see-live-btn"
                type="button"
                onclick=${() => dispatch({ type: 'SET_VIEW', view: isPost ? 'on-demand' : 'live-upcoming' })}
              >${isPost ? 'See On demand' : 'See Live & upcoming'}</button>
            </div>
          `
      ) : html`
        <div class="sg-my-sessions-tab-bar">
          ${hasUpcoming && html`<button
            class=${'sg-my-sessions-tab' + (effectiveTab === 'upcoming' ? ' sg-my-sessions-tab--active' : '')}
            onclick=${() => setTab('upcoming')}
            aria-pressed=${String(effectiveTab === 'upcoming')}
            type="button"
          >Upcoming</button>`}
          ${hasOnDemand && html`<button
            class=${'sg-my-sessions-tab' + (effectiveTab === 'on-demand' ? ' sg-my-sessions-tab--active' : '')}
            onclick=${() => setTab('on-demand')}
            aria-pressed=${String(effectiveTab === 'on-demand')}
            type="button"
          >On demand</button>`}
        </div>
        ${effectiveTab === 'upcoming' && html`
          <div class="sg-my-sessions__upcoming">
            ${timeSlots.map((slot) => html`<${TimeSlotRow} key=${slot[0].startTimeUtc} sessions=${slot} />`)}
          </div>
        `}
        ${effectiveTab === 'on-demand' && html`
          <div class="sg-my-sessions__on-demand">
            ${groupByTrack(filteredOnDemand, state.guideConfig?.swimlaneOrder).map(([track, trackSessions, label]) => html`
              <${TrackRow} key=${track} track=${label} sessions=${trackSessions} />
            `)}
          </div>
        `}
      `}
    </div>
  `;
}
