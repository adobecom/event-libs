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
