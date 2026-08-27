import { createTag, getMetadata } from '../../../utils/utils.js';
import { getJsonMetadata, getAttrText } from '../../utils/custom-attributes.js';
import { readBackgroundConfig } from '../../utils/background-config.js';
import { initSessionState, getApiConfig } from '../../../utils/session-store.js';
import { assertAuthorized } from '../../../services/sessions/session-actions.js';
import { showAuthToast } from '../../../services/sessions/action-feedback.js';

const MOBILE_LIMIT = 2;
const DOWNLOADABLE = /\.(pdf|zip|pptx?|docx?|xlsx?|key|psd|ai|indd|mp4|mov)(\?|$)/i;
const CHEVRON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Per MWPW-205400 resources arrive from two places: presentation files in `material-list`,
// and two single-URL custom attributes. Matched on name; the ticket's attributeIds are
// e485c1c4-9688-4e5a-9891-9563ea5d89ac (Dropbox) and
// 2503567c-d1ce-4be2-bb1e-b0f5678dcd59 (CC Library).
const LINK_ATTRS = [
  { attr: 'Dropbox Link for Session Page', name: 'Dropbox Link' },
  { attr: 'CC Library Link for Session Page', name: 'CC Library Link' },
];

const ctaLabel = (href) => (DOWNLOADABLE.test(href || '') ? 'Download' : 'Open');

const EXT_RE = /\.([a-z0-9]{1,8})(?:[?#]|$)/i;

const fallbackName = (href) => {
  const ext = (href || '').match(EXT_RE)?.[1];
  return ext ? `Resource (${ext.toUpperCase()})` : 'Resource';
};

/**
 * `material-list` entries as the RF -> DA sync actually emits them: `url`, `description`
 * (the RF fileTypeName, e.g. "Final Presentation"), `title` (the raw upload filename) and
 * `ordinal`. The older `fileURL`/`fileTypeName`/`fileName` spelling is still accepted so a
 * sync change in either direction cannot blank the block. The sync already drops unpublished
 * files, so `published` is usually absent; the check only guards an explicit `false`.
 */
function readMaterials(doc = document) {
  const list = getJsonMetadata('material-list', [], doc);
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && m.published !== false)
    .map((m, i) => {
      const href = m.url || m.fileURL || '';
      return {
        href,
        name: m.description || m.fileTypeName || fallbackName(href),
        ordinal: Number.isFinite(m.ordinal) ? m.ordinal : i,
      };
    })
    .filter((m) => m.href)
    .sort((a, b) => a.ordinal - b.ordinal);
}

function readLinkAttrs(doc = document) {
  return LINK_ATTRS
    .map(({ attr, name }) => ({ name, href: getAttrText(attr, doc).trim() }))
    .filter(({ href }) => href);
}

let instances = 0;

export default async function init(el) {
  const background = readBackgroundConfig(el);
  const published = [...readMaterials(), ...readLinkAttrs()];

  initSessionState();
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
  published.forEach(({ name, href }, i) => {
    const item = createTag('li', { class: 'session-resource' });
    if (i >= MOBILE_LIMIT) item.classList.add('is-overflow');
    const label = ctaLabel(href);
    item.append(createTag('span', { class: 'session-resource-name' }, name));
    const cta = createTag('a', {
      class: 'session-resource-cta',
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': `${label} ${name} (opens in new tab)`,
    }, label);

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
    list.id = `session-resources-list-${instances}`;
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
