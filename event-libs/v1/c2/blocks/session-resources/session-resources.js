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

const MOBILE_LIMIT = 2;
const DOWNLOADABLE = /\.(pdf|zip|pptx?|docx?|xlsx?|key|psd|ai|indd|mp4|mov)(\?|$)/i;

const ctaLabel = (m) => (DOWNLOADABLE.test(m.fileURL || '') ? 'Download' : 'Open');

export default async function init(el) {
  const materials = getJsonMetadata('material-list', []);
  const published = Array.isArray(materials)
    ? materials.filter((m) => m && m.published !== false && m.fileURL)
    : [];

  el.replaceChildren();
  el.append(createTag('h2', { class: 'session-resources-title' }, 'Session resources'));

  if (!published.length) {
    el.append(createTag('p', { class: 'session-resources-empty' }, 'No resources'));
    return;
  }

  const list = createTag('ul', { class: 'session-resources-list' });
  published.forEach((m, i) => {
    const item = createTag('li', { class: 'session-resource' });
    if (i >= MOBILE_LIMIT) item.classList.add('is-overflow');
    item.append(createTag('span', { class: 'session-resource-name' }, m.fileName || m.fileTypeName || 'Resource'));
    item.append(createTag('a', {
      class: 'session-resource-cta',
      href: m.fileURL,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, ctaLabel(m)));
    list.append(item);
  });
  el.append(list);

  if (published.length > MOBILE_LIMIT) {
    const toggle = createTag('button', {
      class: 'session-resources-toggle', type: 'button', 'aria-expanded': 'false',
    }, 'Show more');
    toggle.addEventListener('click', () => {
      const expanded = el.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Show less' : 'Show more';
    });
    el.append(toggle);
  }
}
