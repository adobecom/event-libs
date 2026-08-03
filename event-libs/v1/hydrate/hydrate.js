import logHydration from './log.js';
import hydrateImageLinks from './image-links.js';

const HYDRATORS = {
  'image-links': hydrateImageLinks,
};

const HYDRATED_ATTR = 'data-hydrated';

const registry = new Map();

export function registerHydrator(blockName, hydrator) {
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
}

function getRegisteredHydrator(blockName) {
  return registry.get(blockName) ?? null;
}

export function resetHydrators() {
  registry.clear();
}

export function hydrateBlocks(area = document) {
  if (!area) return;

  const blocks = area.querySelectorAll(`.hydrate:not([${HYDRATED_ATTR}])`);

  for (const block of blocks) {
    const blockName = block.classList[0];
    const ownHydrator = Object.hasOwn(HYDRATORS, blockName) ? HYDRATORS[blockName] : null;
    const hydrate = getRegisteredHydrator(blockName) ?? ownHydrator;

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
