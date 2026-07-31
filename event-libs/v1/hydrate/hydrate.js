import hydrateCardC2 from './card-c2.js';

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

// Statically imported, resolved synchronously — decorateEvent calls
// processTemplateInAllNodes right after kicking off hydrateBlocks, without awaiting it.
// A hydrator resolved via dynamic import() only runs a microtask later, after that
// resolution pass has already run over the still-unrewritten tokens. card-c2 depends on
// its tokens being rewritten before that pass, so it can't go through the dynamic path
// below — same reasoning PR #208 generalizes into a fully synchronous hydrateBlocks.
const STATIC_HYDRATORS = {
  'card-c2': hydrateCardC2,
};

/**
 * Hydrates blocks in the document that need dynamic content from metadata.
 * Call this before blocks are initialized.
 */
export async function hydrateBlocks(area = document) {
  const blocks = [...area.querySelectorAll('.hydrate')];

  const dynamicBlocks = [];
  blocks.forEach((block) => {
    const blockName = block.classList[0];
    const staticHydrate = STATIC_HYDRATORS[blockName];
    if (!staticHydrate) {
      dynamicBlocks.push(block);
      return;
    }
    try {
      staticHydrate(block);
    } catch (e) {
      window.lana?.log(`Hydrator failed for block ${blockName}: ${e.message}`);
    }
  });

  for (const block of dynamicBlocks) {
    const blockName = block.classList[0];

    try {
      const { default: hydrate } = await import(`./${blockName}.js`);
      hydrate(block);
    } catch (e) {
      window.lana?.log(`Hydrator not found for block: ${blockName}`);
    }
  }
}
