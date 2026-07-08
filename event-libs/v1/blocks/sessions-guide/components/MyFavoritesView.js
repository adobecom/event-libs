import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { RegistrationPrompt } from './RegistrationPrompt.js';
import { TimeSlotRow } from './TimeSlotRow.js';
import { groupByStartTime, filterSessions } from '../utils/session-filters.js';

export function MyFavoritesView() {
  const { state } = useSessionGuide();
  const { isRegistered, sessions, favorited } = state;
  const activeFilters = state.activeFilters || {};
  const searchQuery = state.searchQuery || '';

  if (isRegistered !== true) return html`<${RegistrationPrompt} />`;

  const favoritedRaw = sessions.filter((s) => favorited.has(s.id));
  const favoritedSessions = filterSessions(favoritedRaw, activeFilters, searchQuery);
  const timeSlots = groupByStartTime(favoritedSessions);

  return html`
    <div class="sg-view sg-view--my-favorites">
      ${timeSlots.map((slot) => html`<${TimeSlotRow} sessions=${slot} />`)}
      ${timeSlots.length === 0 && html`
        <div class="sg-empty">No favorited sessions yet.</div>
      `}
    </div>
  `;
}
