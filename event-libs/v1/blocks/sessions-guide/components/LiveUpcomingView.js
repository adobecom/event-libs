import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { Carousel } from './Carousel.js';
import { TimeSlotRow } from './TimeSlotRow.js';
import {
  liveSessions, upcomingSessions, groupByStartTime, filterSessions, getFeaturedSessions,
  sessionsForDay,
} from '../utils/session-filters.js';
import { getNowMs, formatShortTime } from '../utils/time.js';

export const buildLiveUpcomingView = () => LiveUpcomingView;

export function LiveUpcomingView() {
  const { state } = useSessionGuide();
  const { sessions, activeDay, eventConfig } = state;
  const liveStreamActiveIds = state.liveStreamActiveIds || new Set();
  const activeFilters = state.activeFilters || {};
  const searchQuery = state.searchQuery || '';
  const { userTz, featuredSessionIds } = eventConfig;
  const nowMs = getNowMs();

  // Live section shows regardless of active filters
  const live = liveSessions(sessions, liveStreamActiveIds, activeDay, userTz, nowMs)
    .sort((a, b) => (a.startTimeUtc < b.startTimeUtc ? -1 : 1));

  // Featured sessions fill the live carousel when nothing is currently live
  const featured = live.length === 0
    ? getFeaturedSessions(sessions, featuredSessionIds || [], activeDay, userTz)
    : [];

  // Upcoming sessions have filters + search applied
  const upcomingRaw = upcomingSessions(sessions, liveStreamActiveIds, activeDay, userTz, nowMs);
  const upcoming = filterSessions(upcomingRaw, activeFilters, searchQuery);
  const timeSlots = groupByStartTime(upcoming);

  // Previously aired: all sessions for the day, shown when nothing is upcoming or live
  const previouslyAiredSlots = (timeSlots.length === 0 && live.length === 0)
    ? groupByStartTime(sessionsForDay(sessions, activeDay, userTz))
    : [];

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
      ${featured.length > 0 && html`
        <div class="sg-live-section sg-live-section--featured">
          <${Carousel}
            sessions=${featured}
            title="Featured"
            formatTime=${(s) => formatShortTime(s.startTimeUtc, userTz)}
          />
        </div>
      `}
      <div class="sg-upcoming-section">
        ${timeSlots.length > 0 && html`<h3 class="sg-upcoming-title">Upcoming</h3>`}
        ${timeSlots.map((slot) => html`<${TimeSlotRow} sessions=${slot} />`)}
        ${previouslyAiredSlots.length > 0 && html`
          <h3 class="sg-upcoming-title">Previously aired</h3>
          ${previouslyAiredSlots.map((slot) => html`<${TimeSlotRow} sessions=${slot} forceOnDemand=${true} />`)}
        `}
        ${timeSlots.length === 0 && !live.length && !featured.length && !previouslyAiredSlots.length && html`
          <div class="sg-empty">No sessions scheduled for this day.</div>
        `}
      </div>
    </div>
  `;
}
