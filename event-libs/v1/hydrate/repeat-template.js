import { getMetadata } from '../utils/utils.js';
import { META_REG } from '../utils/constances.js';
import logHydration from './log.js';

/**
 * Repeats an authored template row once per item in a metadata collection.
 *
 * All content stays in authoring: the author writes one row containing
 * [[collection.field]] tokens, and this clones that row per item, rewriting each
 * clone's tokens to [[collection:index.field]]. decorateEvent's
 * processTemplateInAllNodes then resolves them, so nothing here reads or writes
 * item values — it only multiplies structure.
 */

// Matches the collection name at the start of a token, e.g. `speakers` in
// [[speakers.firstName]]. Ignores tokens that already carry an index.
const COLLECTION_REG = /^([a-z0-9-]+)(?=[.\]]|$)/i;

// META_REG is a global regex, so lastIndex is stateful — always match, never .test().
function getTokens(el) {
  return [...el.innerHTML.matchAll(META_REG)].map((m) => m[1]);
}

function hasToken(el) {
  return getTokens(el).length > 0;
}

/**
 * Derives the collection name from the first indexless token in the row.
 * @param {HTMLElement} row
 * @returns {string|null}
 */
function findCollectionName(row) {
  for (const token of getTokens(row)) {
    // Conditionals and array helpers are not per-item collection paths
    if (token.includes('?(') || token.startsWith('@')) continue;
    const name = token.match(COLLECTION_REG)?.[1];
    if (name && !token.includes(':')) return name;
  }
  return null;
}

/**
 * Rewrites every [[collection...]] token in the row to target one item.
 * `speakers.firstName` becomes `speakers:2.firstName`, `speakers` becomes `speakers:2`.
 */
function setTokenIndex(row, collection, index) {
  row.innerHTML = row.innerHTML.replace(META_REG, (match, token) => {
    if (!token.startsWith(collection) || token.includes(':')) return match;
    const rest = token.slice(collection.length);
    return `[[${collection}:${index}${rest}]]`;
  });

  // Image tokens live in the alt attribute, which innerHTML round-trips correctly,
  // but attributes on the row element itself would not be covered above.
  row.querySelectorAll('img[alt*="[["]').forEach((img) => {
    img.alt = img.alt.replace(META_REG, (match, token) => {
      if (!token.startsWith(collection) || token.includes(':')) return match;
      return `[[${collection}:${index}${token.slice(collection.length)}]]`;
    });
  });
}

/**
 * Hydrates a block by repeating its authored template row per collection item.
 * @param {HTMLElement} block
 * @param {object} [options]
 * @param {(items: any[], block: HTMLElement) => any[]} [options.selectItems] Filters
 *   and/or sorts the raw collection. Must return items from the original array so
 *   their indexes can be recovered for token rewriting.
 * @returns {boolean} Whether the block was hydrated
 */
export default function repeatTemplate(block, { selectItems } = {}) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const template = rows.find(hasToken);

  if (!template) {
    logHydration(`Hydrator: no [[token]] template row authored in ${block.classList[0]}`);
    return false;
  }

  const collection = findCollectionName(template);
  if (!collection) {
    logHydration(`Hydrator: could not derive a collection from the template row in ${block.classList[0]}`);
    return false;
  }

  const raw = getMetadata(collection);
  let items;
  try {
    items = raw ? JSON.parse(raw) : null;
  } catch (error) {
    logHydration(`Hydrator: failed to parse metadata "${collection}": ${error.message}`);
  }

  if (!Array.isArray(items)) {
    // Leave nothing behind: an unresolved template row would render raw [[tokens]].
    rows.forEach((row) => row.remove());
    return false;
  }

  const selected = selectItems ? selectItems(items, block) : items;

  if (!selected.length) {
    logHydration(`Hydrator: no "${collection}" items to render in ${block.classList[0]}`);
    rows.forEach((row) => row.remove());
    return false;
  }

  selected.forEach((item) => {
    const clone = template.cloneNode(true);
    setTokenIndex(clone, collection, items.indexOf(item));
    block.append(clone);
  });

  rows.forEach((row) => row.remove());

  return true;
}
