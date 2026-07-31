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

function parseCollection(name) {
  const raw = name && getMetadata(name);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Finds the collection to repeat: the first indexless token in the row that names a
 * metadata array. Page-level placeholders like [[event-title]] are skipped, so their
 * position in the row doesn't matter.
 * @param {HTMLElement} row
 * @returns {{name: string, items: any[]}|null}
 */
function findCollection(row) {
  for (const token of getTokens(row)) {
    // Conditionals and array helpers are not per-item collection paths
    if (token.includes('?(') || token.startsWith('@') || token.includes(':')) continue;

    const name = token.match(COLLECTION_REG)?.[1];
    const items = parseCollection(name);
    if (items) return { name, items };
  }
  return null;
}

/**
 * Rewrites every [[collection...]] token in the row to target one item.
 * `speakers.firstName` becomes `speakers:2.firstName`, `speakers` becomes `speakers:2`.
 * Tokens for other collections are left alone, including ones whose name merely starts
 * with this collection's name — `speakersExtra` must not become `speakers:2Extra`.
 *
 * Rewriting innerHTML also covers placeholders in attributes, which is how images bind
 * (their token lives in `alt`).
 */
function setTokenIndex(row, collection, index) {
  row.innerHTML = row.innerHTML.replace(META_REG, (match, token) => {
    if (token.includes(':')) return match;
    const rest = token.slice(collection.length);
    // Only a full-segment match counts: the token is the collection itself, or the
    // collection followed by a path separator.
    if (!token.startsWith(collection) || (rest && !rest.startsWith('.'))) return match;
    return `[[${collection}:${index}${rest}]]`;
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
  const blockName = block.classList[0];
  const rows = [...block.querySelectorAll(':scope > div')];
  const templates = rows.filter(hasToken);
  const [template] = templates;

  if (!template) {
    logHydration(`Hydrator: no [[token]] template row authored in ${blockName}`);
    return false;
  }

  // Only the first templated row is repeated; say so rather than dropping the rest
  // silently, since that reads as content vanishing for no reason.
  if (templates.length > 1) {
    logHydration(`Hydrator: ${blockName} has ${templates.length} rows with [[tokens]]; only the first is used as the template`);
  }

  const collection = findCollection(template);

  if (!collection) {
    // Nothing to repeat: the tokens name no metadata array. Could be a typo, or the data
    // simply isn't on the page yet — either way strip the rows, since an unresolved
    // template renders raw [[tokens]] to the user.
    logHydration(`Hydrator: no metadata array matches the [[tokens]] in ${blockName}; check the collection name is spelled correctly and its metadata is present`);
    rows.forEach((row) => row.remove());
    return false;
  }

  const { name, items } = collection;
  const selected = selectItems ? selectItems(items, block) : items;

  if (!selected.length) {
    logHydration(`Hydrator: no "${name}" items to render in ${blockName}`);
    rows.forEach((row) => row.remove());
    return false;
  }

  let rendered = 0;

  selected.forEach((item) => {
    // The index is the item's position in the source array, so selectItems has to hand
    // back the original objects — a copy would resolve to the wrong item or none at all.
    const index = items.indexOf(item);
    if (index === -1) {
      logHydration(`Hydrator: selectItems for ${blockName} returned an item that is not in the "${name}" metadata; return the original objects, not copies`);
      return;
    }

    const clone = template.cloneNode(true);
    setTokenIndex(clone, name, index);
    block.append(clone);
    rendered += 1;
  });

  rows.forEach((row) => row.remove());

  return rendered > 0;
}
