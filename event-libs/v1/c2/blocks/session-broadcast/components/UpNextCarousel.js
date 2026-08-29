import { html } from '../../../../deps/htm-preact.js';
import { Carousel } from '../../sessions-guide/components/Carousel.js';
import { openSessionGuideDetail } from '../../../../utils/session-store.js';

// Capped/sorted upcoming sessions (utils/broadcast-schedule.js). variant="recommended" is
// deliberate, not a mismatch: that's the one LiveCard variant that shows a start/end time
// label and an Add to Schedule CTA for an upcoming session — exactly the ticket's Up Next
// card spec (title, start time, end time, Add to Schedule, Favorite) — no LiveCard changes
// needed for that part.
export function UpNextCarousel({ sessions, title = 'Upcoming' }) {
  if (!sessions || !sessions.length) return null;

  return html`
    <div class="sb-carousel-section sb-carousel-section--up-next">
      <${Carousel}
        sessions=${sessions}
        title=${title}
        variant="recommended"
        onCardClick=${(session) => openSessionGuideDetail(session.id)}
      />
    </div>
  `;
}
