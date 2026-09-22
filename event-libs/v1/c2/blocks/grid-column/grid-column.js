import { LIBS } from '../../../utils/utils.js';
import { logWarning } from '../../../utils/lana-log.js';

export default async function init(el) {
  const link = el.querySelector('a');
  if (!link) return;
  // Only load a genuine /fragments/ link — fragment-loading a dynamic link (e.g. a playlist's
  // session-row link) re-decorates and re-renders it, looping indefinitely.
  if (!link.href.includes('/fragments/')) {
    logWarning('grid-column-c2', `link is missing the required /fragments/ path segment - ${link.href}`);
    return;
  }
  const { default: loadFragment } = await import(`${LIBS}/blocks/fragment/fragment.js`);
  await loadFragment(link);
}
