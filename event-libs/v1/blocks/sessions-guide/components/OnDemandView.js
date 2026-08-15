import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import {
  sessions as sessionsSignal, liveStreamActiveIds as liveStreamActiveIdsSignal, sessionStateVersion,
} from '../../../utils/session-store.js';
import { TrackRow } from './TrackRow.js';
import { Carousel } from './Carousel.js';
import {
  onDemandSessions, groupByTrack, filterSessions, getOnDemandRecommendedSessions,
} from '../utils/session-filters.js';
import { getNowMs } from '../utils/time.js';

export const buildOnDemandView = () => OnDemandView;

export function OnDemandView() {
  const { state } = useSessionGuide();
  const sessions = sessionsSignal.value;
  const liveStreamActiveIds = liveStreamActiveIdsSignal.value;
  const activeFilters = state.activeFilters || {};
  const searchQuery = state.searchQuery || '';
  // Read purely to establish a re-render dependency on time-driven session-state
  // transitions (see sessionStateVersion in session-store.js) — value itself is unused.
  // eslint-disable-next-line no-unused-expressions
  sessionStateVersion.value;
  const nowMs = getNowMs();

  const onDemandRaw = onDemandSessions(sessions, liveStreamActiveIds, nowMs);
  // Recommended ignores the viewer's active filters/search, same as LiveUpcomingView's
  // recommended carousel — it's a curated highlight reel, not a filtered result set.
  const recommended = getOnDemandRecommendedSessions(onDemandRaw, state.guideConfig?.recommendedSessions);
  const available = filterSessions(onDemandRaw, activeFilters, searchQuery);
  const byTrack = groupByTrack(available, state.guideConfig?.swimlaneOrder);

  return html`
    <div class="sg-view sg-view--on-demand">
      ${recommended.length > 0 && html`
        <div class="sg-carousel-section sg-carousel-section--recommended">
          <${Carousel}
            sessions=${recommended}
            title="Recommended"
            formatTime=${() => 'Trending'}
            variant="recommended"
          />
        </div>
      `}
      ${byTrack.map(([track, trackSessions, label]) => html`<${TrackRow} key=${track} track=${label} sessions=${trackSessions} />`)}
      ${byTrack.length === 0 && html`
        <div class="sg-empty" role="status" aria-live="polite">Sessions will be available on demand after the event.</div>
      `}
    </div>
  `;
}
