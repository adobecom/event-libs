import { html } from '../../../../deps/htm-preact.js';
import { Carousel } from '../../sessions-guide/components/Carousel.js';
import { SessionCard } from '../../sessions-guide/components/SessionCard.js';
import { openSessionDetail } from '../utils/broadcast-analytics.js';

// Capped/sorted upcoming sessions (utils/broadcast-schedule.js). Renders SessionCard, not
// LiveCard — per the Figma "no image" Upcoming card (channel badge, title, icon-only
// Add-to-Schedule + Favorite, time range), SessionCard's own .sg-card styling is the closer
// visual match, confirmed by comparing both against the design. timeDisplay="range" gets
// SessionCard's start–end formatting (e.g. "9:15AM - 9:45AM") instead of its default duration.
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
