import logHydration from './log.js';
import hydrateImageLinks from './image-links.js';

const HYDRATORS = {
  'image-links': hydrateImageLinks,
};

const HYDRATED_ATTR = 'data-hydrated';

const [registerHydrator, getRegisteredHydrator, clearRegistry] = (() => {
  const registry = new Map();
  return [
    (blockName, hydrator) => {
      if (!blockName || typeof hydrator !== 'function') {
        logHydration(`Hydrator: registerHydrator("${blockName}") needs a function. Import your module first and register its default export.`);
        return false;
      }
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

export function resetHydrators() {
  clearRegistry();
}

export function hydrateBlocks(area = document) {
  if (!area) return;

  const blocks = area.querySelectorAll(`.hydrate:not([${HYDRATED_ATTR}])`);

  for (const block of blocks) {
    const blockName = block.classList[0];
    const hydrate = getRegisteredHydrator(blockName) ?? HYDRATORS[blockName];

    if (!hydrate) {
      logHydration(`Hydrator not found for block: ${blockName}`);
      continue;
    }

    try {
      if (hydrate(block) !== false) block.setAttribute(HYDRATED_ATTR, 'true');
    } catch (e) {
      logHydration(`Hydrator failed for block ${blockName}: ${e.message}`);
    }
  }
}
