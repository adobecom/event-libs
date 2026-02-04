import hydrateImageLinks from './image-links.js';

const HYDRATORS = {
  'image-links': hydrateImageLinks,
};

/**
 * Hydrates blocks in the document that need dynamic content from metadata.
 * Call this before blocks are initialized.
 */
export function hydrateBlocks(area = document) {
  Object.entries(HYDRATORS).forEach(([blockName, hydrator]) => {
    const blocks = area.querySelectorAll(`.${blockName}`);
    blocks.forEach((block) => hydrator(block));
  });
}
