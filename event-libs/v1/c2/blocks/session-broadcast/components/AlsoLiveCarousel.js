import { html } from '../../../../deps/htm-preact.js';
import { Carousel } from '../../sessions-guide/components/Carousel.js';
import { openSessionDetail } from '../utils/broadcast-analytics.js';

// Hides itself when empty — Carousel no-ops on an empty list, but the wrapper still needs its own.
export function AlsoLiveCarousel({ sessions, title = 'Currently Live', onSwitchSession }) {
  if (!sessions || !sessions.length) return null;

  return html`
    <div class="sb-carousel-section sb-carousel-section--also-live">
      <${Carousel}
        sessions=${sessions}
        title=${title}
        variant="live"
        onCardClick=${openSessionDetail}
        onWatchSamePage=${onSwitchSession}
        showDurationBadge=${true}
      />
    </div>
  `;
}
