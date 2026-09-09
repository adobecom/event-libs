import { html } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import {
  sessions as sessionsSignal, liveStreamActiveIds as liveStreamActiveIdsSignal, sessionStateVersion,
} from '../../../../utils/session-store.js';
import { Carousel } from './Carousel.js';
import { TimeSlotRow } from './TimeSlotRow.js';
import {
  liveSessions, upcomingSessions, groupByStartTime, filterSessions, getRecommendedSessions,
  sessionsForDay, excludeOnDemandFormat,
} from '../utils/session-filters.js';
import { getNowMs, formatShortTime, formatTimezoneAbbr } from '../utils/time.js';

export const buildLiveUpcomingView = () => LiveUpcomingView;

export function LiveUpcomingView() {
  const { state } = useSessionGuide();
  const { activeDay, guideConfig } = state;
  const sessions = sessionsSignal.value;
  const liveStreamActiveIds = liveStreamActiveIdsSignal.value;
  const activeFilters = state.activeFilters || {};
  const searchQuery = state.searchQuery || '';
  const { userTz } = guideConfig;
  // Read purely to establish a re-render dependency on time-driven session-state
  // transitions (see sessionStateVersion in session-store.js) — value itself is unused.
  // eslint-disable-next-line no-unused-expressions
  sessionStateVersion.value;
  const nowMs = getNowMs();

  // Live section shows regardless of active filters
  const live = liveSessions(sessions, liveStreamActiveIds, activeDay, userTz, nowMs)
    .sort((a, b) => (a.startTimeUtc < b.startTimeUtc ? -1 : 1));

  // Recommended sessions fill the live carousel when nothing is currently live
  const recommended = live.length === 0
    ? getRecommendedSessions(sessions, guideConfig.recommendedSessions, activeDay, userTz)
    : [];

  // Upcoming sessions have filters + search applied
  const upcomingRaw = upcomingSessions(sessions, liveStreamActiveIds, activeDay, userTz, nowMs);
  const upcoming = filterSessions(upcomingRaw, activeFilters, searchQuery);
  const timeSlots = groupByStartTime(upcoming);

  // Previously aired: all sessions for the day, shown when nothing is upcoming or live.
  // On-demand-only sessions never aired, so they stay out of here too — On Demand owns them.
  // Filters + search apply here too, same as Upcoming — only Live/Recommended are exempt.
  const previouslyAiredRaw = excludeOnDemandFormat(sessionsForDay(sessions, activeDay, userTz));
  const previouslyAiredSlots = (timeSlots.length === 0 && live.length === 0)
    ? groupByStartTime(filterSessions(previouslyAiredRaw, activeFilters, searchQuery))
    : [];

  return html`
    <div class="sg-view sg-view--live-upcoming">
      ${live.length > 0 && html`
        <div class="sg-carousel-section sg-carousel-section--live">
          <${Carousel}
            sessions=${live}
            title="Live sessions"
            formatTime=${(s) => formatShortTime(s.startTimeUtc, userTz)}
            formatTimezone=${(s) => formatTimezoneAbbr(s.startTimeUtc, userTz)}
            variant="live"
          />
        </div>
      `}
      ${recommended.length > 0 && html`
        <div class="sg-carousel-section sg-carousel-section--recommended">
          <${Carousel}
            sessions=${recommended}
            title="Recommended"
            variant="recommended"
          />
        </div>
      `}
      <div class="sg-upcoming-section">
        ${timeSlots.length > 0 && html`<h3 class="sg-upcoming-title">Upcoming</h3>`}
        ${timeSlots.map((slot) => html`<${TimeSlotRow} key=${slot[0].startTimeUtc} sessions=${slot} />`)}
        ${previouslyAiredSlots.length > 0 && html`
          <h3 class="sg-upcoming-title">Previously aired</h3>
          ${previouslyAiredSlots.map((slot) => html`<${TimeSlotRow} key=${slot[0].startTimeUtc} sessions=${slot} forceOnDemand=${true} />`)}
        `}
        ${timeSlots.length === 0 && !live.length && !recommended.length && !previouslyAiredSlots.length && html`
          <div class="sg-empty" role="status" aria-live="polite">No sessions scheduled for this day.</div>
        `}
      </div>
    </div>
  `;
}
