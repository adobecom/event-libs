import { createTag, getMetadata } from '../../../utils/utils.js';

const CHEVRON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let instances = 0;

export function renderDescriptionClamp(doc = document) {
  const text = (getMetadata('description', doc) || '').trim();
  if (!text) return null;

  const el = createTag('div', { class: 'session-description' });
  instances += 1;
  const textId = `session-description-text-${instances}`;
  const body = createTag('p', { class: 'session-description-text', id: textId }, text);

  const toggle = createTag('button', {
    class: 'session-description-toggle',
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': textId,
    'daa-ll': 'Show-More-Description',
  });
  const srLabel = createTag('span', { class: 'sr-only' }, 'Show more description');
  const label = createTag('span', { 'aria-hidden': 'true' }, 'Show more');
  toggle.append(srLabel, label);
  toggle.insertAdjacentHTML('beforeend', CHEVRON_ICON);
  toggle.hidden = true;
  toggle.addEventListener('click', () => {
    const expanded = el.classList.toggle('is-expanded');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('daa-ll', expanded ? 'Show-Less-Description' : 'Show-More-Description');
    srLabel.textContent = expanded ? 'Show less description' : 'Show more description';
    label.textContent = expanded ? 'Show less' : 'Show more';
  });

  el.append(body, toggle);

  const measure = () => {
    if (el.classList.contains('is-expanded')) return;
    toggle.hidden = body.scrollHeight <= body.clientHeight + 1;
  };
  requestAnimationFrame(measure);
  new ResizeObserver(measure).observe(body);
  document.fonts?.addEventListener?.('loadingdone', measure);

  return el;
}
