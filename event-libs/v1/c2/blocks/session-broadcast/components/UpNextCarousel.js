import { html } from '../../../../deps/htm-preact.js';
import { Carousel } from '../../sessions-guide/components/Carousel.js';
import { SessionCard } from '../../sessions-guide/components/SessionCard.js';
import { openSessionDetail } from '../utils/broadcast-analytics.js';

// SessionCard, not LiveCard, matches Figma's "no image" card. timeDisplay="range" gives
// start–end formatting ("9:15AM - 9:45AM") instead of duration.
export function UpNextCarousel({ sessions, title = 'Upcoming' }) {
  if (!sessions || !sessions.length) return null;

  return html`
    <div class="sb-carousel-section sb-carousel-section--up-next">
      <${Carousel}
        sessions=${sessions}
        title=${title}
        CardComponent=${SessionCard}
        timeDisplay="range"
        onCardClick=${openSessionDetail}
        showDescription=${true}
      />
    </div>
  `;
}
