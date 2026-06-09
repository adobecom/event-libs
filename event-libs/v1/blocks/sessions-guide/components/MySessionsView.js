import { buildRegistrationPrompt } from './RegistrationPrompt.js';
import { buildTimeSlotRow } from './TimeSlotRow.js';
import { buildSessionCard } from './SessionCard.js';
import { buildDownloadButton } from './DownloadButton.js';
import {
  groupByStartTime, onDemandSessions, filterSessions,
} from '../utils/session-filters.js';
import { getNowMs } from '../utils/time.js';
import { deriveSessionState } from '../utils/session-state.js';

export function buildMySessionsView(preact, store) {
  const { html } = preact;
  const { useSessionGuide } = store;
  const RegistrationPrompt = buildRegistrationPrompt(preact, store);
  const TimeSlotRow = buildTimeSlotRow(preact, store);
  const SessionCard = buildSessionCard(preact, store);
  const DownloadButton = buildDownloadButton(preact, store);

  return function MySessionsView() {
    const { state, dispatch } = useSessionGuide();
    const { isRegistered, sessions, scheduled, mySessionsTab, userFirstName } = state;
    const liveStreamActiveIds = state.liveStreamActiveIds || new Set();
    const activeFilters = state.activeFilters || {};
    const searchQuery = state.searchQuery || '';
    const nowMs = getNowMs();

    if (isRegistered !== true) return html`<${RegistrationPrompt} />`;

    const scheduledSessions = sessions.filter((s) => scheduled.has(s.id));

    const activeAndUpcoming = scheduledSessions.filter((s) => {
      const st = deriveSessionState(s, liveStreamActiveIds, nowMs);
      return st === 'upcoming' || st === 'live';
    });
    const onDemandRaw = onDemandSessions(scheduledSessions, liveStreamActiveIds, nowMs);

    const filteredUpcoming = filterSessions(activeAndUpcoming, activeFilters, searchQuery);
    const filteredOnDemand = filterSessions(onDemandRaw, activeFilters, searchQuery);
    const timeSlots = groupByStartTime(filteredUpcoming);

    function setTab(tab) {
      dispatch({ type: 'SET_MY_TAB', tab });
    }

    return html`
      <div class="sg-view sg-view--my-sessions">
        <div class="sg-my-sessions-header">
          ${userFirstName && html`<p class="sg-my-sessions-greeting">Hi, ${userFirstName}</p>`}
          <${DownloadButton} />
        </div>
        <div class="sg-my-sessions-tab-bar">
          <button
            class=${'sg-my-sessions-tab' + (mySessionsTab === 'upcoming' ? ' sg-my-sessions-tab--active' : '')}
            onclick=${() => setTab('upcoming')}
            type="button"
          >Upcoming</button>
          <button
            class=${'sg-my-sessions-tab' + (mySessionsTab === 'on-demand' ? ' sg-my-sessions-tab--active' : '')}
            onclick=${() => setTab('on-demand')}
            type="button"
          >On Demand</button>
        </div>
        ${mySessionsTab === 'upcoming' && html`
          <div class="sg-my-sessions__upcoming">
            ${timeSlots.map((slot) => html`<${TimeSlotRow} sessions=${slot} />`)}
            ${timeSlots.length === 0 && html`
              <div class="sg-empty">No upcoming sessions in your schedule.</div>
            `}
          </div>
        `}
        ${mySessionsTab === 'on-demand' && html`
          <div class="sg-my-sessions__on-demand">
            ${filteredOnDemand.map((s) => html`<${SessionCard} session=${s} />`)}
            ${filteredOnDemand.length === 0 && html`
              <div class="sg-empty">No on-demand sessions in your schedule yet.</div>
            `}
          </div>
        `}
      </div>
    `;
  };
}
