import { html } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import {
  scheduled as scheduledSignal, favorited as favoritedSignal,
} from '../../../../utils/session-store.js';
import { formatShortTime, formatTimezoneAbbr } from '../utils/time.js';
import { SessionCard } from './SessionCard.js';
import { useCarouselRow } from '../utils/use-carousel-row.js';

export const buildTimeSlotRow = () => TimeSlotRow;

export function TimeSlotRow({ sessions, forceOnDemand = false }) {
  const { state } = useSessionGuide();
  const { guideConfig } = state;
  const scheduled = scheduledSignal.value;
  const favorited = favoritedSignal.value;
  const userTz = guideConfig.userTz;

  // Encodes scheduled/favorited state of every card in this row.
  // Changes value whenever a card gains or loses a state that widens it,
  // so useLayoutEffect re-measures with the actual post-layout card widths.
  const cardStateKey = sessions?.map((s) => (scheduled.has(s.id) ? 1 : 0) + (favorited.has(s.id) ? 2 : 0)).join('') || '';

  const {
    dismissingIds, allDismissing, offset, setOffset, tx, showNext, lastVisible,
    stripRef, viewportRef, rowRef,
  } = useCarouselRow(sessions, cardStateKey);

  if (!sessions || !sessions.length) return null;

  // Arrows stay mounted and use `disabled` — conditionally unmounting them destroys focus
  // mid-interaction when a keyboard user pages to either end.
  const rowLabel = formatShortTime(sessions[0].startTimeUtc, userTz);

  return html`
    <div class=${'sg-time-row' + (allDismissing ? ' sg-time-row--collapsing' : '')} ref=${rowRef}>
      <div class="sg-time-row__label">
        <span class="sg-time-row__time-value">${rowLabel}</span>
        <span class="sg-time-row__time-tz">${formatTimezoneAbbr(sessions[0].startTimeUtc, userTz)}</span>
      </div>
      <div class="sg-time-row__track">
        <button
          class="sg-time-row__arrow sg-time-row__arrow--prev"
          onclick=${() => setOffset((o) => Math.max(0, o - 1))}
          aria-label=${`Previous session, ${rowLabel}`}
          disabled=${offset > 0 ? undefined : true}
          type="button"
        ><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M2.67915 6.76384L11.2053 6.76384C11.6361 6.76384 11.9853 6.41462 11.9853 5.98384C11.9853 5.55306 11.6361 5.20384 11.2053 5.20384L2.67935 5.20384L5.44863 2.43455C5.75324 2.12994 5.75324 1.63607 5.44863 1.33146C5.14402 1.02686 4.65015 1.02686 4.34555 1.33147L0.244622 5.4324C-0.0599855 5.737 -0.0599849 6.23087 0.244624 6.53548L4.34556 10.6364C4.65017 10.941 5.14403 10.941 5.44864 10.6364C5.75325 10.3318 5.75325 9.83793 5.44864 9.53332L2.67915 6.76384Z" fill="currentColor"/></svg></button>
        <div class="sg-time-row__viewport" ref=${viewportRef}>
          <div class="sg-time-row__cards" ref=${stripRef} style=${'transform:translateX(-' + tx + 'px)'}>
            ${sessions.map((s, i) => html`<div
              class=${'sg-time-row__card-wrap' + (dismissingIds.has(s.id) ? ' sg-time-row__card-wrap--collapsing' : '')}
              key=${s.id}
              inert=${i < offset || i > lastVisible ? true : undefined}
            ><${SessionCard} session=${s} forceOnDemand=${forceOnDemand} /></div>`)}
          </div>
        </div>
        <button
          class="sg-time-row__arrow sg-time-row__arrow--next"
          onclick=${() => setOffset((o) => Math.min(sessions.length - 1, o + 1))}
          aria-label=${`Next session, ${rowLabel}`}
          disabled=${showNext ? undefined : true}
          type="button"
        ><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.32279 6.76475L0.796596 6.76475C0.365814 6.76475 0.0165963 6.41554 0.0165958 5.98475C0.0165953 5.55397 0.365812 5.20475 0.796595 5.20475L9.32259 5.20475L6.5533 2.43547C6.24869 2.13086 6.24869 1.63699 6.5533 1.33238C6.85791 1.02777 7.35178 1.02777 7.65639 1.33238L11.7573 5.43331C12.0619 5.73792 12.0619 6.23179 11.7573 6.5364L7.6564 10.6373C7.35179 10.9419 6.85792 10.9419 6.55331 10.6373C6.2487 10.3327 6.2487 9.83885 6.55331 9.53424L9.32279 6.76475Z" fill="currentColor"/></svg></button>
      </div>
    </div>
  `;
}
