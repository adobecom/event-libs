import { createTag, getMetadata } from '../../../utils/utils.js';
import { getJsonMetadata, getAttrText } from '../../utils/custom-attributes.js';
import { readBackgroundConfig } from '../../utils/background-config.js';
import { initSessionState, getEventApiConfig } from '../../../utils/session-store.js';
import { assertAuthorized } from '../../../services/sessions/session-actions.js';
import { showAuthToast } from '../../../services/sessions/action-feedback.js';
import { showToast } from '../../../features/toast/toast.js';

const VISIBLE_LIMIT = 2;
const DOWNLOADABLE = /\.(pdf|zip|pptx?|docx?|xlsx?|key|psd|ai|indd|mp4|mov)(\?|$)/i;
const CHEVRON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
    registerUrl: getEventApiConfig()?.registerUrl || '/register',
  };

  el.replaceChildren();
  if (background) el.style.background = background;
  el.append(createTag('h2', { class: 'session-resources-title' }, 'Session resources'));

  if (!published.length) {
    el.append(createTag('p', { class: 'session-resources-empty' }, 'No materials available for this session'));
    return;
  }

  const list = createTag('ul', { class: 'session-resources-list' });
  published.forEach(({ name, href }, i) => {
    const item = createTag('li', { class: 'session-resource' });
    if (i >= VISIBLE_LIMIT) item.classList.add('is-overflow');
    const label = ctaLabel(href);
    item.append(createTag('span', { class: 'session-resource-name' }, name));
    const isDownload = label === 'Download';
    const cta = createTag('a', {
      class: 'session-resource-cta',
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      ...(isDownload ? { download: '' } : {}),
      'aria-label': `${label} ${name} (opens in new tab)`,
    }, label);

    if (isDownload) {
      cta.addEventListener('click', (e) => {
        try {
          assertAuthorized();
        } catch {
          e.preventDefault();
          showAuthToast({ eventConfig, actionLabel: `download ${name}` });
          return;
        }
        showToast({ message: 'Session resource downloaded', variant: 'positive' });
      });
    }

    item.append(cta);
    list.append(item);
  });
  el.append(list);

  if (published.length > VISIBLE_LIMIT) {
    instances += 1;
    list.id = `session-resources-list-${instances}`;
    const toggle = createTag('button', {
      class: 'session-resources-toggle',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': list.id,
      'daa-ll': 'Show-More-Resources',
    });
    const label = createTag('span', {}, 'Show more');
    toggle.append(label);
    toggle.insertAdjacentHTML('beforeend', CHEVRON_ICON);
    toggle.addEventListener('click', () => {
      const expanded = el.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('daa-ll', expanded ? 'Show-Less-Resources' : 'Show-More-Resources');
      label.textContent = expanded ? 'Show less' : 'Show more';
    });
    el.append(toggle);
  }
}
