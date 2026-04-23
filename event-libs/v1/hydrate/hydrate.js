/**
 * Promise for the current hydration run. Set when decorateEvent calls hydrateBlocks
 * so that blocks that depend on hydrated content can await it before initializing.
 */
let currentHydrationPromise = null;

/**
 * Returns the promise for the current page's hydration, if any.
 * Blocks that need hydrated DOM (e.g. image-links) should await this before init.
 * @returns {Promise<void>|null} Resolves when hydration is done, or null if no hydration was started
 */
export function getHydrationPromise() {
  return currentHydrationPromise ?? null;
}

/**
 * Stores the hydration promise. Used by decorateEvent so it can stay sync.
 * @param {Promise<void>} p
 */
export function setHydrationPromise(p) {
  currentHydrationPromise = p;
}

/**
 * Hydrates blocks in the document that need dynamic content from metadata.
 * Call this before blocks are initialized.
 */
export async function hydrateBlocks(area = document) {
  const blocks = area.querySelectorAll('.hydrate');

  for (const block of blocks) {
    // Extract block name from class list (first class is typically the block name)
    const blockName = block.classList[0];

    try {
      const { default: hydrate } = await import(`./${blockName}.js`);
      hydrate(block);
    } catch (e) {
      window.lana?.log(`Hydrator not found for block: ${blockName}`);
    }
  }
}
