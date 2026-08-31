import { createTag } from '../../../utils/utils.js';
import { getJsonMetadata } from '../../utils/custom-attributes.js';
import { readBackgroundConfig } from '../../utils/background-config.js';

const VISIBLE_LIMIT = 5;

let instances = 0;

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
    avatar.append(createTag('img', {
      class: 'speaker-photo', src: url, alt: s.photo?.altText || '', loading: 'lazy',
    }));
  } else {
    avatar.classList.add('speaker-avatar--placeholder');
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initials(s) || '?';
  }
  return avatar;
}

export default async function init(el) {
  const background = readBackgroundConfig(el);
  const speakers = getJsonMetadata('speakers', []);
  el.replaceChildren();
  if (background) el.style.background = background;
  if (!Array.isArray(speakers) || !speakers.length) {
    el.append(createTag('h2', { class: 'speakers-title' }, 'Speakers'));
    el.append(createTag('p', { class: 'speakers-empty' }, 'No speakers available for this session'));
    return;
  }

  const showCount = speakers.length > VISIBLE_LIMIT;
  const title = createTag('h2', { class: 'speakers-title' }, 'Speakers');
  if (showCount) {
    title.append(createTag('span', { class: 'speakers-count' }, ` (${speakers.length})`));
  }
  el.append(title);

  const list = createTag('ul', { class: 'speakers-list' });
  speakers.forEach((s, i) => {
    const item = createTag('li', { class: 'speaker' });
    if (i >= VISIBLE_LIMIT) item.classList.add('is-overflow');
    const info = createTag('div', { class: 'speaker-info' });
    info.append(createTag('span', { class: 'speaker-name' }, fullName(s)));
    const role = roleLine(s);
    if (role) info.append(createTag('span', { class: 'speaker-role' }, role));
    item.append(renderAvatar(s), info);
    list.append(item);
  });
  el.append(list);

  if (speakers.length > VISIBLE_LIMIT) {
    instances += 1;
    list.id = `speakers-list-${instances}`;
    const toggle = createTag('button', {
      class: 'speakers-toggle',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': list.id,
      'daa-ll': 'Show-More-Speakers',
    });
    const srLabel = createTag('span', { class: 'sr-only' }, 'Show more speakers');
    const label = createTag('span', { 'aria-hidden': 'true' }, 'Show more');
    toggle.append(srLabel, label);
    toggle.insertAdjacentHTML('beforeend', CHEVRON_ICON);
    toggle.addEventListener('click', () => {
      const expanded = el.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('daa-ll', expanded ? 'Show-Less-Speakers' : 'Show-More-Speakers');
      srLabel.textContent = expanded ? 'Show less speakers' : 'Show more speakers';
      label.textContent = expanded ? 'Show less' : 'Show more';
    });
    el.append(toggle);
  }
}
