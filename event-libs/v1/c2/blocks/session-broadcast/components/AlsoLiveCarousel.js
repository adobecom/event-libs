import { html } from '../../../../deps/htm-preact.js';
import { Carousel } from '../../sessions-guide/components/Carousel.js';
import { openSessionGuideDetail } from '../../../../utils/session-store.js';

// Every other currently-live session, excluding the one in the primary player — reuses
// sessions-guide's Carousel/LiveCard wholesale (see the plan's Architecture Decisions).
// Card clicks open the real Session Guide detail view; the Watch Live button switches
// session-broadcast's own primary player via onSwitchSession (LiveCard's onWatchSamePage).
// Hides itself entirely when there's nothing to show (ticket: "if only one session is live,
// the Also Live carousel is hidden") — Carousel itself no-ops on an empty list, but the
// section wrapper needs its own bail-out or an empty section would still render.
export function AlsoLiveCarousel({ sessions, title = 'Currently Live', onSwitchSession }) {
  if (!sessions || !sessions.length) return null;

  return html`
    <div class="sb-carousel-section sb-carousel-section--also-live">
      <${Carousel}
        sessions=${sessions}
        title=${title}
        variant="live"
        onCardClick=${(session) => openSessionGuideDetail(session.id)}
        onWatchSamePage=${onSwitchSession}
      />
    </div>
  `;
}
