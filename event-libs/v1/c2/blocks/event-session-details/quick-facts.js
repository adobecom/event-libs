import { createTag } from '../../../utils/utils.js';
import { getAttrValues } from '../../utils/custom-attributes.js';

const QUICK_FACTS = [
  { label: 'Technical level', name: 'Technical Level' },
  { label: 'Track', name: 'Track' },
  { label: 'AI Focus', name: 'AI Focus' },
  { label: 'Audience', name: 'Audience' },
  { label: 'Category', name: 'Category' },
];

export function renderQuickFacts(doc = document) {
  const rows = QUICK_FACTS
    .map(({ label, name }) => ({
      label,
      values: getAttrValues(name, doc).map((v) => v.label).filter(Boolean),
    }))
    .filter((row) => row.values.length);

  if (!rows.length) return null;

  const el = createTag('dl', { class: 'session-quick-facts' });
  rows.forEach(({ label, values }) => {
    const row = createTag('div', { class: 'session-quick-fact' });
    row.append(
      createTag('dt', { class: 'session-quick-fact-label' }, `${label}:`),
      createTag('dd', { class: 'session-quick-fact-value' }, values.join(', ')),
    );
    el.append(row);
  });
  return el;
}
