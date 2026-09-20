import { LIBS } from '../../../utils/utils.js';
import { logWarning } from '../../../utils/lana-log.js';

export default async function init(el) {
  const link = el.querySelector('a');
  if (!link) return;
  // Only a genuine /fragments/ link should be loaded as a fragment. A grid-column may contain
  // other links (e.g. a rendered playlist's session-row links); loading one of those as a
  // fragment re-decorates the area and, because the block re-renders its rows, loops indefinitely.
  if (!link.href.includes('/fragments/')) {
    logWarning('grid-column-c2', `link is missing the required /fragments/ path segment - ${link.href}`);
    return;
  }
  const { default: loadFragment } = await import(`${LIBS}/blocks/fragment/fragment.js`);
  await loadFragment(link);
}
