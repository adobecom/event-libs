import { html } from '../../../../deps/htm-preact.js';
import { Carousel } from '../../sessions-guide/components/Carousel.js';
import { SessionCard } from '../../sessions-guide/components/SessionCard.js';
import { openSessionDetail } from '../utils/broadcast-analytics.js';

// Renders SessionCard, not LiveCard — matches Figma's "no image" Upcoming card. timeDisplay
// "range" gets start–end formatting (e.g. "9:15AM - 9:45AM") instead of duration.
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
      />
    </div>
  `;
}
