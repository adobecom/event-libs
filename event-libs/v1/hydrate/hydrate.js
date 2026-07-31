import logHydration from './log.js';
import hydrateImageLinks from './image-links.js';

// Hydrators for blocks event-libs owns. Statically imported, never lazily: Milo calls
// decorateArea for fragments and personalization without awaiting it, so any asynchrony
// here — a dynamic import() included — races the block's own init().
// Consumer-owned blocks belong in the consumer's repo, via registerHydrator.
// See docs/block-hydration.md.
const HYDRATORS = {
  'image-links': hydrateImageLinks,
};

// Marks a block as hydrated so a later decorateEvent pass over a nested area
// (fragments, personalization) can't re-run a hydrator over initialized DOM.
const HYDRATED_ATTR = 'data-hydrated';

// Consumer-supplied hydrators, keyed by block name. Takes precedence over HYDRATORS.
const [registerHydrator, getRegisteredHydrator, clearRegistry] = (() => {
  const registry = new Map();
  return [
    (blockName, hydrator) => {
      if (!blockName || typeof hydrator !== 'function') {
        logHydration(`Hydrator: registerHydrator("${blockName}") needs a function. Import your module first and register its default export.`);
        return false;
      }
      // An async hydrator would return an unobserved promise and hydrate too late.
      if (hydrator.constructor?.name === 'AsyncFunction') {
        logHydration(`Hydrator: registerHydrator("${blockName}") rejected an async function. Hydration must be synchronous.`);
        return false;
      }
      if (registry.has(blockName)) {
        logHydration(`Hydrator: registerHydrator("${blockName}") replaced an existing registration.`);
      }
      registry.set(blockName, hydrator);
      return true;
    },
    (blockName) => registry.get(blockName) ?? null,
    () => registry.clear(),
  ];
})();

export { registerHydrator };

/** Clears all registrations. For tests — the registry is module state. */
export function resetHydrators() {
  clearRegistry();
}

/**
 * Hydrates blocks in the area that need dynamic content from metadata. Runs to
 * completion synchronously, so there is nothing to await.
 * @param {HTMLElement|Document} area
 */
export function hydrateBlocks(area = document) {
  if (!area) return;

  const blocks = area.querySelectorAll(`.hydrate:not([${HYDRATED_ATTR}])`);

  for (const block of blocks) {
    // Extract block name from class list (first class is typically the block name)
    const blockName = block.classList[0];
    const hydrate = getRegisteredHydrator(blockName) ?? HYDRATORS[blockName];

    if (!hydrate) {
      logHydration(`Hydrator not found for block: ${blockName}`);
      continue;
    }

    try {
      // Only mark on success. A hydrator that returns false bailed out — often because
      // its data wasn't there — so a later pass over a nested area should retry it.
      if (hydrate(block) !== false) block.setAttribute(HYDRATED_ATTR, 'true');
    } catch (e) {
      logHydration(`Hydrator failed for block ${blockName}: ${e.message}`);
    }
  }
}
