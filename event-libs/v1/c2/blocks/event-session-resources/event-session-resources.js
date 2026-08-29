import { createTag, getMetadata } from '../../../utils/utils.js';
import { getJsonMetadata } from '../../utils/custom-attributes.js';
import { readBackgroundConfig } from '../../utils/background-config.js';
import { initSessionState, getEventApiConfig } from '../../../utils/session-store.js';
import { assertAuthorized } from '../../../services/sessions/session-actions.js';
import { showAuthToast } from '../../../services/sessions/action-feedback.js';

const MOBILE_LIMIT = 2;
const DOWNLOADABLE = /\.(pdf|zip|pptx?|docx?|xlsx?|key|psd|ai|indd|mp4|mov)(\?|$)/i;
const CHEVRON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ctaLabel = (m) => (DOWNLOADABLE.test(m.fileURL || '') ? 'Download' : 'Open');

const EXT_RE = /\.([a-z0-9]{1,8})(?:[?#]|$)/i;

const resourceName = (m) => {
  if (m.fileTypeName) return m.fileTypeName;
  const ext = (m.fileURL || '').match(EXT_RE)?.[1];
  return ext ? `Resource (${ext.toUpperCase()})` : 'Resource';
};

let instances = 0;

export default async function init(el) {
  const background = readBackgroundConfig(el);
  const materials = getJsonMetadata('material-list', []);
  const published = Array.isArray(materials)
    ? materials.filter((m) => m && m.published !== false && m.fileURL)
    : [];

  initSessionState();
  const eventConfig = {
    title: getMetadata('event-title') || getMetadata('title') || '',
    registerUrl: getEventApiConfig()?.registerUrl || '/register',
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
