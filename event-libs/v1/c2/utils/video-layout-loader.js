import { createTag } from '../../utils/utils.js';

// Owns the single, page-wide loader shown while the session-video-player/session-video-playlist layout
// decision (see BlockMediator's videoLayoutDecision store) is still pending — both blocks
// import this instead of each managing their own loader element, so there is exactly one
// source of truth for "is a loader currently showing" regardless of how many .session-video-player
// instances exist on the page.
let loaderEl = null;

// Appends into `el` only if no loader is currently showing anywhere — callers don't need
// to coordinate with each other; the first call wins, later calls before the loader is
// hidden are no-ops.
export function showVideoLayoutLoader(el) {
  if (loaderEl) return;
  loaderEl = createTag('div', { class: 'session-video-player-loader', 'aria-hidden': 'true' }, '', { parent: el });
}

export function hideVideoLayoutLoader() {
  loaderEl?.remove();
  loaderEl = null;
}
