import { html } from '../../../../deps/htm-preact.js';
import { Carousel } from '../../sessions-guide/components/Carousel.js';
import { openSessionDetail } from '../utils/broadcast-analytics.js';

// Hides itself when empty — Carousel no-ops on an empty list, but the wrapper still needs its own.
// forceLive=true: this section must only ever show live sessions -- schedule.alsoLive is
// already filtered through isSessionLiveNow() (broadcast-schedule.js's own, MPC-video-duration-
// aware liveness check), but LiveCard.js independently re-derives its own state via the
// endTimeUtc-only deriveSessionState(), which can disagree for exactly that MPC case and bleed
// a "Watch on demand" CTA into a card this section is guaranteeing is still live.
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
        forceLive=${true}
      />
    </div>
  `;
}
