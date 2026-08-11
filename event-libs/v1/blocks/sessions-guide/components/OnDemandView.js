import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import {
  sessions as sessionsSignal, liveStreamActiveIds as liveStreamActiveIdsSignal, sessionStateVersion,
} from '../../../utils/session-store.js';
import { TrackRow } from './TrackRow.js';
import { Carousel } from './Carousel.js';
import {
  onDemandSessions, groupByTrack, filterSessions, getOnDemandFeaturedSessions,
} from '../utils/session-filters.js';
import { getNowMs } from '../utils/time.js';
import { getFeaturedSessionIds } from '../../../utils/tier-1-event-config.js';

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
  // Featured ignores the viewer's active filters/search, same as LiveUpcomingView's
  // featured carousel — it's a curated highlight reel, not a filtered result set.
  const featured = getOnDemandFeaturedSessions(onDemandRaw, getFeaturedSessionIds());
  const available = filterSessions(onDemandRaw, activeFilters, searchQuery);
  const byTrack = groupByTrack(available);

  return html`
    <div class="sg-view sg-view--on-demand">
      ${featured.length > 0 && html`
        <div class="sg-carousel-section sg-carousel-section--featured">
          <${Carousel}
            sessions=${featured}
            title="Featured"
            formatTime=${() => 'Trending'}
            variant="featured"
          />
        </div>
      `}
      ${byTrack.map(([track, trackSessions]) => html`<${TrackRow} key=${track} track=${track} sessions=${trackSessions} />`)}
      ${byTrack.length === 0 && html`
        <div class="sg-empty" role="status" aria-live="polite">Sessions will be available on demand after the event.</div>
      `}
    </div>
  `;
}
