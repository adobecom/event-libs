import { createTag } from '../../utils/utils.js';

let loaderEl = null;

export function showVideoLayoutLoader(el) {
  if (loaderEl) return;
  loaderEl = createTag('div', { class: 'session-video-player-loader', 'aria-hidden': 'true' }, '', { parent: el });
}

export function hideVideoLayoutLoader() {
  loaderEl?.remove();
  loaderEl = null;
}
