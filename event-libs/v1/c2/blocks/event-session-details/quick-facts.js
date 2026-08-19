/*
 * Quick Facts (MWPW-203468) — sub-feature of session-details.
 * Label/value rows from custom-attributes, rendered as a definition list:
 *   Technical level: Beginner
 *   Product: Photoshop, Illustrator
 *   ...
 * Each row renders only when its attribute has values. AI Focus has no RF
 * attribute yet, so it renders only if/when one appears.
 */
import { createTag } from '../../../utils/utils.js';
import { getAttrValues } from '../../utils/custom-attributes.js';

// Ordered per the MWPW-200288 abstract: Technical level, Track, AI Focus,
// Product, Audience, Category.
const QUICK_FACTS = [
  { label: 'Technical level', name: 'Technical Level' },
  { label: 'Track', name: 'Track' },
  { label: 'AI Focus', name: 'AI Focus' },
  { label: 'Product', name: 'Product' },
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
