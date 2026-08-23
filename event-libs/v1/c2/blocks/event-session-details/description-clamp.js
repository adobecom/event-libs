/*
 * Description "More" Clamp (MWPW-203470) — sub-feature of session-details.
 * Renders the session description (top-level `description` metadata) with a
 * mobile line-clamp + Show more/less toggle. The toggle is revealed only when
 * the text actually overflows the clamp.
 *
 * NOTE: desktop shows the full text with no toggle — that unclamp is added with
 * the desktop pass. i18n of the toggle labels is TBD (placeholder strings here).
 */
import { createTag, getMetadata } from '../../../utils/utils.js';

// Chevron next to the toggle label; rotates 180° when expanded (see CSS).
const CHEVRON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Suffixes the aria-controls id so multiple instances on one page stay unique.
let instances = 0;

export function renderDescriptionClamp(doc = document) {
  const text = (getMetadata('description', doc) || '').trim();
  if (!text) return null;

  const el = createTag('div', { class: 'session-description' });
  instances += 1;
  const textId = `session-description-text-${instances}`;
  const body = createTag('p', { class: 'session-description-text', id: textId }, text);

  const toggle = createTag('button', {
    class: 'session-description-toggle',
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': textId,
  });
  const label = createTag('span', {}, 'Show more');
  toggle.append(label);
  toggle.insertAdjacentHTML('beforeend', CHEVRON_ICON);
  toggle.hidden = true;
  toggle.addEventListener('click', () => {
    const expanded = el.classList.toggle('is-expanded');
    toggle.setAttribute('aria-expanded', String(expanded));
    label.textContent = expanded ? 'Show less' : 'Show more';
  });

  el.append(body, toggle);

  // Reveal the toggle only when the collapsed text actually overflows the clamp.
  // Line count depends on width AND the loaded font — both settle after first
  // paint (container-width constraint + late web-font swap), so a single check
  // misses. A ResizeObserver catches every width/layout change and the font
  // `loadingdone` event catches the swap, so it self-corrects without a resize.
  const measure = () => {
    if (el.classList.contains('is-expanded')) return;
    toggle.hidden = body.scrollHeight <= body.clientHeight + 1;
  };
  requestAnimationFrame(measure);
  new ResizeObserver(measure).observe(body);
  document.fonts?.addEventListener?.('loadingdone', measure);

  return el;
}
