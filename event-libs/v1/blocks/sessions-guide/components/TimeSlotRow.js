import { buildSessionCard } from './SessionCard.js';
import { formatShortTime } from '../utils/time.js';

export function buildTimeSlotRow(preact, store) {
  const { html, useState, useRef, useEffect } = preact;
  const { useSessionGuide } = store;
  const SessionCard = buildSessionCard(preact, store);

  return function TimeSlotRow({ sessions }) {
    if (!sessions || !sessions.length) return null;

    const { state } = useSessionGuide();
    const userTz = state.eventConfig.userTz;
    const [offset, setOffset] = useState(0);
    const stripRef = useRef(null);
    const cardWidthRef = useRef(0);

    // DOM-compute card width once after first render
    useEffect(() => {
      if (!stripRef.current) return;
      const firstCard = stripRef.current.querySelector('.sg-time-row__card-wrap');
      if (!firstCard) return;
      const gap = parseFloat(getComputedStyle(stripRef.current).columnGap || '16') || 16;
      cardWidthRef.current = firstCard.offsetWidth + gap;
    }, []);

    const maxOffset = sessions.length - 1;
    const translateX = offset * (cardWidthRef.current || 280);

    return html`
      <div class="sg-time-row">
        <div class="sg-time-row__label">${formatShortTime(sessions[0].startTimeUtc, userTz)}</div>
        <div class="sg-time-row__track">
          ${offset > 0 && html`<button
            class="sg-time-row__arrow sg-time-row__arrow--prev"
            onclick=${() => setOffset((o) => Math.max(0, o - 1))}
            aria-label="Previous"
            type="button"
          >‹</button>`}
          <div class="sg-time-row__viewport">
            <div class="sg-time-row__cards" ref=${stripRef} style=${'transform:translateX(-' + translateX + 'px)'}>
              ${sessions.map((s) => html`<div class="sg-time-row__card-wrap" key=${s.id}><${SessionCard} session=${s} /></div>`)}
            </div>
          </div>
          ${offset < maxOffset && html`<button
            class="sg-time-row__arrow sg-time-row__arrow--next"
            onclick=${() => setOffset((o) => Math.min(maxOffset, o + 1))}
            aria-label="Next"
            type="button"
          >›</button>`}
        </div>
      </div>
    `;
  };
}
