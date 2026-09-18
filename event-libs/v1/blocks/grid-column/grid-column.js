import { LIBS } from '../../utils/utils.js';
import { logWarning } from '../../utils/lana-log.js';

export default async function init(el) {
  const link = el.querySelector('a');
  if (!link) return;
  if (!link.href.includes('/fragments/')) {
    logWarning('grid-column', `link is missing the required /fragments/ path segment - ${link.href}`);
  }
  const { default: loadFragment } = await import(`${LIBS}/blocks/fragment/fragment.js`);
  await loadFragment(link);
}
