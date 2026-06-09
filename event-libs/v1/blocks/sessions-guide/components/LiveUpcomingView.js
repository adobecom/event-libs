import { buildCarousel } from './Carousel.js';
import { buildTimeSlotRow } from './TimeSlotRow.js';
import {
  liveSessions, upcomingSessions, groupByStartTime, filterSessions,
} from '../utils/session-filters.js';
import { getNowMs, formatShortTime } from '../utils/time.js';

export function buildLiveUpcomingView(preact, store) {
  const { html } = preact;
  const { useSessionGuide } = store;
  const Carousel = buildCarousel(preact, store);
  const TimeSlotRow = buildTimeSlotRow(preact, store);

  return function LiveUpcomingView() {
    const { state } = useSessionGuide();
    const { sessions, activeDay, eventConfig } = state;
    const liveStreamActiveIds = state.liveStreamActiveIds || new Set();
    const activeFilters = state.activeFilters || {};
    const searchQuery = state.searchQuery || '';
    const { userTz } = eventConfig;
    const nowMs = getNowMs();

    // Live section shows regardless of active filters
    const live = liveSessions(sessions, liveStreamActiveIds, activeDay, userTz, nowMs);

    // Upcoming sessions have filters + search applied
    const upcomingRaw = upcomingSessions(sessions, liveStreamActiveIds, activeDay, userTz, nowMs);
    const upcoming = filterSessions(upcomingRaw, activeFilters, searchQuery);
    const timeSlots = groupByStartTime(upcoming);

    return html`
      <div class="sg-view sg-view--live-upcoming">
        ${live.length > 0 && html`
          <div class="sg-live-section">
            <${Carousel}
              sessions=${live}
              title="Live now"
              formatTime=${(s) => formatShortTime(s.startTimeUtc, userTz)}
            />
          </div>
        `}
        <div class="sg-upcoming-section">
          ${timeSlots.length > 0 && html`<h3 class="sg-upcoming-title">Upcoming</h3>`}
          ${timeSlots.map((slot) => html`<${TimeSlotRow} sessions=${slot} />`)}
          ${timeSlots.length === 0 && !live.length && html`
            <div class="sg-empty">No sessions scheduled for this day.</div>
          `}
        </div>
      </div>
    `;
  };
}
