import { html, useState, useRef, useLayoutEffect } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { SessionCard } from './SessionCard.js';

export const buildTrackRow = () => TrackRow;

export function TrackRow({ track, sessions }) {
  const { state } = useSessionGuide();
  const dismissingIds = state.dismissingIds || new Set();
  const allDismissing = sessions.every((s) => dismissingIds.has(s.id));

  const [offset, setOffset] = useState(0);
  const [{ tx, showNext }, setMeasure] = useState({ tx: 0, showNext: false });
  const stripRef = useRef(null);
  const viewportRef = useRef(null);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const viewport = viewportRef.current;
    if (!strip || !viewport) return;
    const cards = [...strip.children];
    if (!cards.length) return;
    const gap = parseFloat(getComputedStyle(strip).columnGap) || 0;
    let newTx = 0;
    let totalWidth = 0;
    cards.forEach((card, i) => {
      const w = card.offsetWidth;
      if (i < offset) newTx += w + gap;
      totalWidth += w + (i < cards.length - 1 ? gap : 0);
    });
    // Reserve room for the last card's hover-expanded width (427px per .sg-card:hover)
    // so its action buttons stay reachable when the viewport is tight.
    const HOVER_CARD_WIDTH = 427;
    const effectiveTotal = totalWidth - cards[cards.length - 1].offsetWidth + HOVER_CARD_WIDTH;
    setMeasure({ tx: newTx, showNext: effectiveTotal - newTx > viewport.offsetWidth + 1 });
  }, [offset]);

  if (!sessions || !sessions.length) return null;

  return html`
    <div class=${'sg-time-row' + (allDismissing ? ' sg-time-row--collapsing' : '')}>
      <div class="sg-time-row__label">${track}</div>
      <div class="sg-time-row__track">
        ${offset > 0 && html`<button
          class="sg-time-row__arrow sg-time-row__arrow--prev"
          onclick=${() => setOffset((o) => Math.max(0, o - 1))}
          aria-label="Previous"
          type="button"
        ><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M2.67915 6.76384L11.2053 6.76384C11.6361 6.76384 11.9853 6.41462 11.9853 5.98384C11.9853 5.55306 11.6361 5.20384 11.2053 5.20384L2.67935 5.20384L5.44863 2.43455C5.75324 2.12994 5.75324 1.63607 5.44863 1.33146C5.14402 1.02686 4.65015 1.02686 4.34555 1.33147L0.244622 5.4324C-0.0599855 5.737 -0.0599849 6.23087 0.244624 6.53548L4.34556 10.6364C4.65017 10.941 5.14403 10.941 5.44864 10.6364C5.75325 10.3318 5.75325 9.83793 5.44864 9.53332L2.67915 6.76384Z" fill="currentColor"/></svg></button>`}
        <div class="sg-time-row__viewport" ref=${viewportRef}>
          <div class="sg-time-row__cards" ref=${stripRef} style=${'transform:translateX(-' + tx + 'px)'}>
            ${sessions.map((s) => html`<div class="sg-time-row__card-wrap" key=${s.id}><${SessionCard} session=${s} forceOnDemand=${true} /></div>`)}
          </div>
        </div>
        ${showNext && html`<button
          class="sg-time-row__arrow sg-time-row__arrow--next"
          onclick=${() => setOffset((o) => Math.min(sessions.length - 1, o + 1))}
          aria-label="Next"
          type="button"
        ><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.32279 6.76475L0.796596 6.76475C0.365814 6.76475 0.0165963 6.41554 0.0165958 5.98475C0.0165953 5.55397 0.365812 5.20475 0.796595 5.20475L9.32259 5.20475L6.5533 2.43547C6.24869 2.13086 6.24869 1.63699 6.5533 1.33238C6.85791 1.02777 7.35178 1.02777 7.65639 1.33238L11.7573 5.43331C12.0619 5.73792 12.0619 6.23179 11.7573 6.5364L7.6564 10.6373C7.35179 10.9419 6.85792 10.9419 6.55331 10.6373C6.2487 10.3327 6.2487 9.83885 6.55331 9.53424L9.32279 6.76475Z" fill="currentColor"/></svg></button>`}
      </div>
    </div>
  `;
}
