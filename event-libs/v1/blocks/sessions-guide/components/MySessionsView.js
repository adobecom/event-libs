import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { RegistrationPrompt } from './RegistrationPrompt.js';
import { TimeSlotRow } from './TimeSlotRow.js';
import { TrackRow } from './TrackRow.js';
import { Carousel } from './Carousel.js';
import {
  groupByStartTime, groupByTrack, onDemandSessions, filterSessions, sessionsForDay, liveSessions,
} from '../utils/session-filters.js';
import { getNowMs, formatShortTime } from '../utils/time.js';
import { deriveSessionState } from '../utils/session-state.js';

export const buildMySessionsView = () => MySessionsView;

export function MySessionsView() {
  const { state, dispatch } = useSessionGuide();
  const { isRegistered, sessions, scheduled, mySessionsTab, activeDay } = state;
  const liveStreamActiveIds = state.liveStreamActiveIds || new Set();
  const activeFilters = state.activeFilters || {};
  const searchQuery = state.searchQuery || '';
  const userTz = state.eventConfig?.userTz;
  const nowMs = getNowMs();

  if (isRegistered !== true) return html`<${RegistrationPrompt} />`;

  const scheduledSessions = sessions.filter((s) => scheduled.has(s.id));
  const dayScheduled = sessionsForDay(scheduledSessions, activeDay, userTz);

  const live = liveSessions(scheduledSessions, liveStreamActiveIds, activeDay, userTz, nowMs)
    .sort((a, b) => (a.startTimeUtc < b.startTimeUtc ? -1 : 1));

  const activeAndUpcoming = dayScheduled.filter((s) => {
    const st = deriveSessionState(s, liveStreamActiveIds, nowMs);
    return st === 'upcoming';
  });
  const onDemandRaw = onDemandSessions(dayScheduled, liveStreamActiveIds, nowMs);

  const filteredUpcoming = filterSessions(activeAndUpcoming, activeFilters, searchQuery);
  const filteredOnDemand = filterSessions(onDemandRaw, activeFilters, searchQuery);
  const timeSlots = groupByStartTime(filteredUpcoming);

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
            title="Live now"
            formatTime=${(s) => formatShortTime(s.startTimeUtc, userTz)}
          />
        </div>
      `}
      ${bothEmpty ? html`
        <div class="sg-my-sessions__empty">
          <p>You currently have no scheduled sessions.</p>
          <button
            class="sg-my-sessions__see-live-btn"
            type="button"
            onclick=${() => dispatch({ type: 'SET_VIEW', view: 'live-upcoming' })}
          >See Live & upcoming</button>
        </div>
      ` : html`
        <div class="sg-my-sessions-tab-bar">
          ${hasUpcoming && html`<button
            class=${'sg-my-sessions-tab' + (effectiveTab === 'upcoming' ? ' sg-my-sessions-tab--active' : '')}
            onclick=${() => setTab('upcoming')}
            type="button"
          >Upcoming</button>`}
          ${hasOnDemand && html`<button
            class=${'sg-my-sessions-tab' + (effectiveTab === 'on-demand' ? ' sg-my-sessions-tab--active' : '')}
            onclick=${() => setTab('on-demand')}
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
            ${groupByTrack(filteredOnDemand).map(([track, trackSessions]) => html`
              <${TrackRow} track=${track} sessions=${trackSessions} />
            `)}
          </div>
        `}
      `}
    </div>
  `;
}
