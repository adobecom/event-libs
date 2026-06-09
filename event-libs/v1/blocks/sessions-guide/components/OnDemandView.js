import { buildSessionCard } from './SessionCard.js';
import { onDemandSessions, groupByTrack, filterSessions } from '../utils/session-filters.js';
import { getNowMs } from '../utils/time.js';

export function buildOnDemandView(preact, store) {
  const { html } = preact;
  const { useSessionGuide } = store;
  const SessionCard = buildSessionCard(preact, store);

  return function OnDemandView() {
    const { state } = useSessionGuide();
    const { sessions } = state;
    const liveStreamActiveIds = state.liveStreamActiveIds || new Set();
    const activeFilters = state.activeFilters || {};
    const searchQuery = state.searchQuery || '';
    const nowMs = getNowMs();

    const onDemandRaw = onDemandSessions(sessions, liveStreamActiveIds, nowMs);
    const available = filterSessions(onDemandRaw, activeFilters, searchQuery);
    const byTrack = groupByTrack(available);

    return html`
      <div class="sg-view sg-view--on-demand">
        ${byTrack.map(([track, trackSessions]) => html`
          <div class="sg-track-section">
            <h3 class="sg-track-title">${track}</h3>
            <div class="sg-track-cards">
              ${trackSessions.map((s) => html`<${SessionCard} session=${s} />`)}
            </div>
          </div>
        `)}
        ${byTrack.length === 0 && html`
          <div class="sg-empty">Sessions will be available on demand after the event.</div>
        `}
      </div>
    `;
  };
}
