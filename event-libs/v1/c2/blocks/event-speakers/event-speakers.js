/*
 * Speakers (MWPW-203471)
 * Standalone white card. Avatar + name + title/company rows from the top-level
 * `speakers` JSON. Count shown next to the title. Mobile: first 5 shown,
 * "Show more" reveals the rest.
 *
 * Photo shape: da.live sync nests speaker.photo.imageUrl (+ altText); the RF API
 * returns a flat photoURL. Both are supported, with an initials fallback when a
 * speaker has no headshot.
 *
 * NOTE: desktop shows all speakers with no toggle — added with the desktop pass.
 */
import { createTag } from '../../../utils/utils.js';
import { getJsonMetadata } from '../../utils/custom-attributes.js';

const MOBILE_LIMIT = 5;

// Suffixes the aria-controls id so multiple instances on one page stay unique.
let instances = 0;

// Chevron next to the toggle label; rotates 180° when expanded (see CSS).
const CHEVRON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const fullName = (s) => [s.firstName, s.lastName].filter(Boolean).join(' ').trim();
const roleLine = (s) => [s.title, s.company].filter(Boolean).join(', ');
const photoUrl = (s) => s.photo?.imageUrl || s.photoURL || '';
const initials = (s) => [s.firstName, s.lastName]
  .filter(Boolean)
  .map((n) => n.trim()[0])
  .join('')
  .toUpperCase();

function renderAvatar(s) {
  const avatar = createTag('span', { class: 'speaker-avatar' });
  const url = photoUrl(s);
  if (url) {
    // Decorative unless the author supplied altText: the speaker's name is the very
    // next element, so falling back to it would announce the name twice.
    avatar.append(createTag('img', {
      class: 'speaker-photo', src: url, alt: s.photo?.altText || '', loading: 'lazy',
    }));
  } else {
    // Initials are a visual stand-in for the adjacent name — hide from AT.
    avatar.classList.add('speaker-avatar--placeholder');
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initials(s) || '?';
  }
  return avatar;
}

export default async function init(el) {
  const speakers = getJsonMetadata('speakers', []);
  el.replaceChildren();
  if (!Array.isArray(speakers) || !speakers.length) return;

  const title = createTag('h2', { class: 'speakers-title' }, 'Speakers ');
  title.append(createTag('span', { class: 'speakers-count' }, `(${speakers.length})`));
  el.append(title);

  const list = createTag('ul', { class: 'speakers-list' });
  speakers.forEach((s, i) => {
    const item = createTag('li', { class: 'speaker' });
    if (i >= MOBILE_LIMIT) item.classList.add('is-overflow');
    const info = createTag('div', { class: 'speaker-info' });
    info.append(createTag('span', { class: 'speaker-name' }, fullName(s)));
    const role = roleLine(s);
    if (role) info.append(createTag('span', { class: 'speaker-role' }, role));
    item.append(renderAvatar(s), info);
    list.append(item);
  });
  el.append(list);

  if (speakers.length > MOBILE_LIMIT) {
    instances += 1;
    list.id = `speakers-list-${instances}`; // unique per instance for aria-controls
    const toggle = createTag('button', {
      class: 'speakers-toggle',
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
