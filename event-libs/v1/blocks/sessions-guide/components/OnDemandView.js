import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { TrackRow } from './TrackRow.js';
import { onDemandSessions, groupByTrack, filterSessions } from '../utils/session-filters.js';
import { getNowMs } from '../utils/time.js';

export const buildOnDemandView = () => OnDemandView;

export function OnDemandView() {
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
      ${byTrack.map(([track, trackSessions]) => html`<${TrackRow} key=${track} track=${track} sessions=${trackSessions} />`)}
      ${byTrack.length === 0 && html`
        <div class="sg-empty">Sessions will be available on demand after the event.</div>
      `}
    </div>
  `;
}
