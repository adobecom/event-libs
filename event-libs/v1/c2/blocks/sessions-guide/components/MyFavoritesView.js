import { html, useMemo, useEffect } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import {
  sessions as sessionsSignal, favorited as favoritedSignal,
  liveStreamActiveIds as liveStreamActiveIdsSignal, auth, sessionStateVersion,
} from '../../../../utils/session-store.js';
import { checkViewAccess, isAuthResolved } from '../../../../services/sessions/action-feedback.js';
import { TimeSlotRow } from './TimeSlotRow.js';
import { TrackRow } from './TrackRow.js';
import { Carousel } from './Carousel.js';
import { NoResultsFound } from './NoResultsFound.js';
import { LoadingState } from './LoadingState.js';
import {
  groupByStartTime, groupByTrack, onDemandSessions, filterSessions, sessionsForDay, liveSessions,
  hasActiveSearchOrFilters,
} from '../utils/session-filters.js';
import { getNowMs, formatShortTime, formatTimezoneAbbr } from '../utils/time.js';
import { useIsPostEvent } from '../utils/use-post-event.js';
import { deriveSessionState } from '../../../../utils/session-state.js';

export const buildMyFavoritesView = () => MyFavoritesView;

export function MyFavoritesView() {
  const { state, dispatch } = useSessionGuide();
  const { myFavoritesTab, activeDay } = state;
  const sessions = sessionsSignal.value;
  const favorited = favoritedSignal.value;
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
  // restored ?view=my-favorites) doesn't bounce an already-registered visitor away before
  // auth has actually finished resolving — see isAuthResolved()'s own comment.
  const { isLoggedIn, isRegistered } = auth.value;
  const authResolved = isAuthResolved(auth.value);
  useEffect(() => {
    if (!authResolved) return;
    const fallback = checkViewAccess('my-favorites', { eventConfig: state.guideConfig });
    if (fallback) dispatch({ type: 'SET_VIEW', view: fallback });
  }, [authResolved, isLoggedIn, isRegistered]);
  // Same loading treatment as the shells' own sessionsStatus gate (FullPageShell.js/
  // DrawerShell.js) — the session catalog can resolve well before registration does, and a
  // bare blank view in that gap read as broken. Once authResolved is true the visitor is
  // either confirmed unauthorized (about to be bounced by the effect above) or confirmed
  // registered (falls through below), so only the pending case gets the loading state.
  if (!authResolved) return html`<${LoadingState} />`;
  if (!isLoggedIn || isRegistered !== true) return null;

  // Memoized: this component re-renders on every context dispatch (e.g. opening the
  // detail overlay), not just when the inputs below actually change.
  const { live, timeSlots, filteredOnDemand } = useMemo(() => {
    const favoritedSessions = sessions.filter((s) => favorited.has(s.id));
    const dayFavorited = sessionsForDay(favoritedSessions, activeDay, userTz);

    const liveNow = liveSessions(favoritedSessions, liveStreamActiveIds, activeDay, userTz, nowMs)
      .sort((a, b) => (a.startTimeUtc < b.startTimeUtc ? -1 : 1));

    const activeAndUpcoming = dayFavorited.filter((s) => {
      const st = deriveSessionState(s, liveStreamActiveIds, nowMs);
      return st === 'upcoming';
    });
    const onDemandRaw = onDemandSessions(dayFavorited, liveStreamActiveIds, nowMs);

    const filteredUpcomingSessions = filterSessions(activeAndUpcoming, activeFilters, searchQuery);
    return {
      live: liveNow,
      timeSlots: groupByStartTime(filteredUpcomingSessions),
      filteredOnDemand: filterSessions(onDemandRaw, activeFilters, searchQuery),
    };
  }, [sessions, favorited, liveStreamActiveIds, activeDay, userTz, nowMs, activeFilters, searchQuery]);

  const hasUpcoming = timeSlots.length > 0;
  const hasOnDemand = filteredOnDemand.length > 0;
  const bothEmpty = !hasUpcoming && !hasOnDemand;

  let effectiveTab = myFavoritesTab;
  if (effectiveTab === 'upcoming' && !hasUpcoming) effectiveTab = 'on-demand';
  if (effectiveTab === 'on-demand' && !hasOnDemand) effectiveTab = 'upcoming';

  function setTab(tab) {
    dispatch({ type: 'SET_MY_FAVORITES_TAB', tab });
  }

  return html`
    <div class="sg-view sg-view--my-favorites">
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
            <div class="sg-my-favorites__empty" role="status" aria-live="polite">
              <p>You currently have no favorited sessions.</p>
              <button
                class="sg-my-favorites__see-live-btn"
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
          <div class="sg-my-favorites__upcoming">
            ${timeSlots.map((slot) => html`<${TimeSlotRow} key=${slot[0].startTimeUtc} sessions=${slot} />`)}
          </div>
        `}
        ${effectiveTab === 'on-demand' && html`
          <div class="sg-my-favorites__on-demand">
            ${groupByTrack(filteredOnDemand, state.guideConfig?.swimlaneOrder).map(([track, trackSessions, label]) => html`
              <${TrackRow} key=${track} track=${label} sessions=${trackSessions} />
            `)}
          </div>
        `}
      `}
    </div>
  `;
}
