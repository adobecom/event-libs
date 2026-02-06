import { createTag, getMetadata, getImageSource } from '../utils/utils.js';

const CONFIG = {
  // Mapping of class names to metadata keys
  metadataMapping: {
    sponsors: 'sponsors',
  },

  // Mapping of metadata keys to their block configurations
  filterConfig: {
    sponsors: {
      filterKey: 'sponsorType',
      imageKey: 'image',
      linkKey: 'link',
      nameKey: 'name',
      tierKeywords: ['platinum', 'diamond', 'gold', 'silver', 'bronze', 'engagement'],
    },
  },
};

function extractTierFromClassList(classList, metadataKey) {
  for (const tier of CONFIG.filterConfig[metadataKey].tierKeywords) {
    if (classList.contains(tier)) {
      return tier;
    }
  }
  return null;
}

function createImageElement(imageData, altText = '') {
  const imgSrc = typeof imageData === 'object' ? getImageSource(imageData) : imageData;

  if (!imgSrc) return null;

  const img = createTag('img', {
    src: imgSrc,
    alt: altText,
  });

  return img;
}

export default function hydrateImageLinks(block) {
  let metadataKey = null;

  for (const [className, metaKey] of Object.entries(CONFIG.metadataMapping)) {
    if (block.classList.contains(className)) {
      metadataKey = metaKey;
      break;
    }
  }

  if (!metadataKey) return;

  // Get metadata
  let data;
  try {
    const metadataValue = getMetadata(metadataKey);
    if (!metadataValue) return;
    data = JSON.parse(metadataValue);
  } catch (error) {
    window.lana?.log(`Hydrator: Failed to parse metadata "${metadataKey}": ${error.message}`);
    return;
  }

  if (!data || !data.length) return;

  // Get filter config for this metadata type
  const filterConf = CONFIG.filterConfig[metadataKey];
  if (!filterConf) return;

  // Extract tier from block class names
  const tier = extractTierFromClassList(block.classList, metadataKey);

  // Filter data by tier if found
  let filteredData = data;
  if (tier && filterConf.filterKey) {
    filteredData = data.filter((item) => {
      const itemTier = (item[filterConf.filterKey] || '').toString().toLowerCase();
      return itemTier === tier;
    });
  }

  if (!filteredData.length) return;

  // Create image rows for each item
  filteredData.forEach((item) => {
    const imageData = item[filterConf.imageKey];
    if (!imageData) return;

    const altText = item[filterConf.nameKey] || '';
    const img = createImageElement(imageData, altText);
    if (!img) return;

    const row = createTag('div');
    const cell = createTag('div');

    if (filterConf.linkKey && item[filterConf.linkKey]) {
      const link = createTag('a', {
        href: item[filterConf.linkKey],
        target: '_blank',
        rel: 'noopener noreferrer',
        title: altText,
      });
      link.append(img);
      cell.append(link);
    } else {
      cell.append(img);
    }

    row.append(cell);
    block.append(row);
  });
}
