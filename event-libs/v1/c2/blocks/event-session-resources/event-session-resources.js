/*
 * Session Resources (MWPW-203473)
 * Standalone white card. Rows of "file name … Open/Download" from the top-level
 * `material-list` (RF files[]). Mobile: first 2 shown, "Show more" reveals the
 * rest. "No resources" empty state when none are published. Links open in a new
 * tab.
 *
 * "Download" CTAs are gated on sign-in + event registration via the shared
 * session-action guard, reusing the same login/registration toast as the favorite
 * and add-to-schedule CTAs. "Open" links are not gated. The CTA label ("Download"
 * vs "Open") is inferred from the file URL; RF may later supply explicit CTA text.
 *
 * NOTE: this is a UX gate, not access control — the file URL is in the DOM, so a
 * copied link or modifier-click still reaches it. Protecting the asset itself needs
 * a signed/expiring URL or a server-side check.
 */
import { createTag, getMetadata } from '../../../utils/utils.js';
import { getJsonMetadata } from '../../utils/custom-attributes.js';
import { readBackgroundConfig } from '../../utils/background-config.js';
import { initSessionState, getApiConfig } from '../../../utils/session-store.js';
import { assertAuthorized } from '../../../services/sessions/session-actions.js';
import { showAuthToast } from '../../../services/sessions/action-feedback.js';

const MOBILE_LIMIT = 2;
const DOWNLOADABLE = /\.(pdf|zip|pptx?|docx?|xlsx?|key|psd|ai|indd|mp4|mov)(\?|$)/i;
// Chevron next to the toggle label; rotates 180° when expanded (see CSS).
const CHEVRON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ctaLabel = (m) => (DOWNLOADABLE.test(m.fileURL || '') ? 'Download' : 'Open');

// Trailing extension of the file URL, ignoring any query/hash.
const EXT_RE = /\.([a-z0-9]{1,8})(?:[?#]|$)/i;

// The row label comes from fileTypeName ("Session slides"), not fileName: authored
// file names are frequently not reader-friendly ("Screenshot 2026-08-13 at
// 11.23.26 AM.png", "Magdiel_Lopez_MAX_2026_Session_Outline"). With no fileTypeName,
// fall back to the file's extension so the row still says what it is.
const resourceName = (m) => {
  if (m.fileTypeName) return m.fileTypeName;
  const ext = (m.fileURL || '').match(EXT_RE)?.[1];
  return ext ? `Resource (${ext.toUpperCase()})` : 'Resource';
};

// Suffixes the aria-controls id so multiple instances on one page stay unique.
let instances = 0;

export default async function init(el) {
  const background = readBackgroundConfig(el);
  const materials = getJsonMetadata('material-list', []);
  const published = Array.isArray(materials)
    ? materials.filter((m) => m && m.published !== false && m.fileURL)
    : [];

  // Boot the page-level state engine so `auth` reflects the real IMS/registration
  // state. Idempotent, and a no-op without a Tier 1 config — see the gate below.
  initSessionState();
  // showAuthToast expects { title, registerUrl } (not Milo's global config).
  const eventConfig = {
    title: getMetadata('event-title') || getMetadata('title') || '',
    registerUrl: getApiConfig()?.registerUrl || '/register',
  };

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
    const name = resourceName(m);
    const label = ctaLabel(m);
    item.append(createTag('span', { class: 'session-resource-name' }, name));
    const cta = createTag('a', {
      class: 'session-resource-cta',
      href: m.fileURL,
      target: '_blank',
      rel: 'noopener noreferrer',
      // The visible text is only "Open"/"Download" and the file name is a sibling,
      // so name the link for AT link lists and flag the new tab.
      'aria-label': `${label} ${name} (opens in new tab)`,
    }, label);

    // Downloads require sign-in + event registration; "Open" links stay ungated.
    // Blocking on click (rather than rendering a disabled link) keeps the row usable
    // the moment the visitor signs in, with no re-render.
    if (label === 'Download') {
      cta.addEventListener('click', (e) => {
        try {
          assertAuthorized();
        } catch (err) {
          e.preventDefault();
          showAuthToast(err.reason, { eventConfig, actionLabel: `download ${name}` });
        }
      });
    }

    item.append(cta);
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
