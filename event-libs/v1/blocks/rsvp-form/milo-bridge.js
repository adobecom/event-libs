import { getEventConfig, LIBS } from '../../utils/utils.js';

/**
 * Single resolution point for the Milo helpers this block needs, so every
 * other module imports from here instead of re-deriving `miloLibs` and
 * re-importing the same Milo modules (the pattern events-form.js repeats at
 * the top of its file).
 */
const eventConfig = getEventConfig();
export const miloLibs = eventConfig?.miloConfig?.miloLibs ? eventConfig.miloConfig.miloLibs : LIBS;

/**
 * Lazily imports and caches a Milo module by specifier. Nothing is fetched
 * merely by importing this bridge — e.g. spectrum.js only needs `miloLibs`
 * above and never triggers a network request for the helpers below unless
 * one is actually called.
 */
function lazyImport(specifier) {
  let promise;
  return () => {
    if (!promise) promise = import(specifier);
    return promise;
  };
}

const importUtils = lazyImport(`${miloLibs}/utils/utils.js`);
const importModal = lazyImport(`${miloLibs}/blocks/modal/modal.js`);
const importAttributes = lazyImport(`${miloLibs}/martech/attributes.js`);
const importFragment = lazyImport(`${miloLibs}/blocks/fragment/fragment.js`);
const importSanitizeComment = lazyImport(`${miloLibs}/utils/sanitizeComment.js`);

export async function getMiloConfig() {
  const { getConfig } = await importUtils();
  return getConfig();
}

export async function closeModal(...args) {
  const { closeModal: fn } = await importModal();
  return fn(...args);
}

export async function sendAnalytics(...args) {
  const { sendAnalytics: fn } = await importModal();
  return fn(...args);
}

export async function decorateDefaultLinkAnalytics(...args) {
  const { decorateDefaultLinkAnalytics: fn } = await importAttributes();
  return fn(...args);
}

export async function loadFragment(...args) {
  const { default: fn } = await importFragment();
  return fn(...args);
}

export async function sanitizeComment(text) {
  const { default: fn } = await importSanitizeComment();
  return fn(text);
}
