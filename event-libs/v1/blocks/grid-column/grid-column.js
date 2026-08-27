import { LIBS } from '../../utils/utils.js';

export default async function init(el) {
  const link = el.querySelector('a');
  if (!link) return;
  if (!link.href.includes('/fragments/')) {
    window.lana?.log(`grid-column: link is missing the required /fragments/ path segment - ${link.href}`, {
      tags: 'grid-column',
      severity: 'warn',
    });
  }
  const { default: loadFragment } = await import(`${LIBS}/blocks/fragment/fragment.js`);
  await loadFragment(link);
}
