/*
 * Session Resources (MWPW-203473)
 * Standalone white card. Rows of "file name … Open/Download" from the top-level
 * `material-list` (RF files[]). Mobile: first 2 shown, "Show more" reveals the
 * rest. "No resources" empty state when none are published. Links open in a new
 * tab.
 *
 * NOTE: download gating (logged-in AND registered, via the session-action guard
 * + toast) is wired in the signals/CTA pass (MWPW-203474). For now the CTA is a
 * plain new-tab link. The CTA label ("Download" vs "Open") is inferred from the
 * file URL; RF may later supply explicit CTA text.
 */
import { createTag } from '../../../utils/utils.js';
import { getJsonMetadata } from '../../utils/custom-attributes.js';
import { readBackgroundConfig } from '../../utils/background-config.js';

const MOBILE_LIMIT = 2;
const DOWNLOADABLE = /\.(pdf|zip|pptx?|docx?|xlsx?|key|psd|ai|indd|mp4|mov)(\?|$)/i;
// Chevron next to the toggle label; rotates 180° when expanded (see CSS).
const CHEVRON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ctaLabel = (m) => (DOWNLOADABLE.test(m.fileURL || '') ? 'Download' : 'Open');

// Suffixes the aria-controls id so multiple instances on one page stay unique.
let instances = 0;

export default async function init(el) {
  const background = readBackgroundConfig(el);
  const materials = getJsonMetadata('material-list', []);
  const published = Array.isArray(materials)
    ? materials.filter((m) => m && m.published !== false && m.fileURL)
    : [];

  el.replaceChildren();
  if (background) el.style.background = background;
  el.append(createTag('h2', { class: 'session-resources-title' }, 'Session resources'));

  if (!published.length) {
    el.append(createTag('p', { class: 'session-resources-empty' }, 'No resources'));
    return;
  }

  const list = createTag('ul', { class: 'session-resources-list' });
  published.forEach((m, i) => {
    const item = createTag('li', { class: 'session-resource' });
    if (i >= MOBILE_LIMIT) item.classList.add('is-overflow');
    const name = m.fileName || m.fileTypeName || 'Resource';
    item.append(createTag('span', { class: 'session-resource-name' }, name));
    item.append(createTag('a', {
      class: 'session-resource-cta',
      href: m.fileURL,
      target: '_blank',
      rel: 'noopener noreferrer',
      // The visible text is only "Open"/"Download" and the file name is a sibling,
      // so name the link for AT link lists and flag the new tab.
      'aria-label': `${ctaLabel(m)} ${name} (opens in new tab)`,
    }, ctaLabel(m)));
    list.append(item);
  });
  el.append(list);

  if (published.length > MOBILE_LIMIT) {
    instances += 1;
    list.id = `session-resources-list-${instances}`; // unique per instance for aria-controls
    const toggle = createTag('button', {
      class: 'session-resources-toggle',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': list.id,
    });
    const label = createTag('span', {}, 'Show more');
    toggle.append(label);
    toggle.insertAdjacentHTML('beforeend', CHEVRON_ICON);
    toggle.addEventListener('click', () => {
      const expanded = el.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
      label.textContent = expanded ? 'Show less' : 'Show more';
    });
    el.append(toggle);
  }
}
