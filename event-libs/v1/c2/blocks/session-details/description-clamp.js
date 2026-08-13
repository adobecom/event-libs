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

export function renderDescriptionClamp(doc = document) {
  const text = (getMetadata('description', doc) || '').trim();
  if (!text) return null;

  const el = createTag('div', { class: 'session-description' });
  const body = createTag('p', { class: 'session-description-text' }, text);

  const toggle = createTag('button', {
    class: 'session-description-toggle',
    type: 'button',
    'aria-expanded': 'false',
  }, 'Show more');
  toggle.hidden = true;
  toggle.addEventListener('click', () => {
    const expanded = el.classList.toggle('is-expanded');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Show less' : 'Show more';
  });

  el.append(body, toggle);

  // Reveal the toggle only when the clamped text overflows.
  requestAnimationFrame(() => {
    if (body.scrollHeight > body.clientHeight + 1) toggle.hidden = false;
  });

  return el;
}
