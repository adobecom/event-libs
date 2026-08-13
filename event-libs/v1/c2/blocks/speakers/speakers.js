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
    avatar.append(createTag('img', {
      class: 'speaker-photo', src: url, alt: s.photo?.altText || fullName(s), loading: 'lazy',
    }));
  } else {
    avatar.classList.add('speaker-avatar--placeholder');
    avatar.textContent = initials(s) || '?';
  }
  return avatar;
}

export default async function init(el) {
  const speakers = getJsonMetadata('speakers', []);
  el.replaceChildren();
  if (!Array.isArray(speakers) || !speakers.length) return;

  el.append(createTag('h2', { class: 'speakers-title' }, `Speakers (${speakers.length})`));

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
    const toggle = createTag('button', {
      class: 'speakers-toggle', type: 'button', 'aria-expanded': 'false',
    }, 'Show more');
    toggle.addEventListener('click', () => {
      const expanded = el.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Show less' : 'Show more';
    });
    el.append(toggle);
  }
}
