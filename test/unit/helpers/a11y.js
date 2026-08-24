/*
 * axe-core assertions for unit tests, scoped to the WCAG 2.1 A/AA tags this repo
 * targets so axe's "best-practice" rules can't fail a conformant component.
 */
import 'axe-core/axe.min.js';

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Page-level rules that no unit test can satisfy: WTR renders a bare block
// fragment into document.body with no landmarks, <main>, <h1>, or lang.
const FRAGMENT_EXEMPT = [
  'region',
  'landmark-one-main',
  'page-has-heading-one',
  'html-has-lang',
  'html-lang-valid',
  'document-title',
  'bypass',
];

function disable(ids) {
  return ids.reduce((rules, id) => ({ ...rules, [id]: { enabled: false } }), {});
}

/**
 * Runs axe over `el` and resolves to the raw violation list.
 * @param {Element} el subtree to scan
 * @param {{ exclude?: string[] }} options extra axe rule ids to disable
 */
export async function findA11yViolations(el, { exclude = [] } = {}) {
  const { violations } = await window.axe.run(el, {
    runOnly: { type: 'tag', values: WCAG_AA_TAGS },
    resultTypes: ['violations'],
    rules: disable([...FRAGMENT_EXEMPT, ...exclude]),
  });
  return violations;
}

function formatViolation(violation) {
  const nodes = violation.nodes.map((node) => `  at ${node.target.join(' ')}\n    ${node.html}`);
  return [
    `${violation.id} (${violation.impact}) — ${violation.help}`,
    `  ${violation.helpUrl}`,
    ...nodes,
  ].join('\n');
}

/**
 * Fails the test with a readable report if `el` has any WCAG 2.1 AA violations.
 * @param {Element} el subtree to scan
 * @param {{ exclude?: string[] }} options extra axe rule ids to disable
 */
export async function expectAccessible(el, options) {
  const violations = await findA11yViolations(el, options);
  if (!violations.length) return;
  const report = violations.map(formatViolation).join('\n\n');
  throw new Error(`${violations.length} WCAG 2.1 AA violation(s):\n\n${report}`);
}
