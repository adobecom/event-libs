import { getMetadata, getEventConfig, LIBS } from '../../utils/utils.js';
import { FALLBACK_LOCALES } from '../../utils/constances.js';

async function getPromotionalContentUrl() {
  const eventConfig = getEventConfig();
  const { miloConfig } = eventConfig;
  const miloLibs = miloConfig?.miloLibs ? miloConfig.miloLibs : LIBS;
  const { getLocale } = await import(`${miloLibs}/utils/utils.js`);
  
  const { prefix } = getLocale(miloConfig?.locales || FALLBACK_LOCALES);
  
  // Get the domain from import.meta.url
  const moduleUrl = new URL(import.meta.url);
  const domain = `${moduleUrl.protocol}//${moduleUrl.host}`;
  
  return `${domain}${prefix}/event-libs/assets/configs/promotional-content.json`;
}

async function getPromotionalContent() {
  let promotionalItems = [];
  const eventPromotionalItemsMetadata = getMetadata('promotional-items');
  if (eventPromotionalItemsMetadata) {
    try {
      const promotionalItemsMetadata = JSON.parse(eventPromotionalItemsMetadata);
      promotionalItems = promotionalItemsMetadata.filter((item) => {
        if (typeof item === 'object') {
          return item.name;
        }
        return item;
      });
    } catch (error) {
      window.lana?.log(`Error parsing promotional items: ${JSON.stringify(error)}`);
      return promotionalItems;
    }
  }
  
  // If no promotional items, return early to avoid unnecessary imports and fetch
  if (promotionalItems.length === 0) {
    return [];
  }
  
  try {
    const url = await getPromotionalContentUrl();
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch promotional content: ${response.status}`);
    }
    
    const json = await response.json();
    const data = json.data || [];

    if (!data || data.length === 0) {
      window.lana?.log(`Error: No promotional content found at ${url}`);
      return [];
    }

    const rehydratedPromotionalItems = promotionalItems.map((item) => {
      const promotionalItem = data.find((content) => content.name === item);
      return promotionalItem;
    });

    return rehydratedPromotionalItems;
  } catch (error) {
    window.lana?.log(`Error fetching promotional content: ${JSON.stringify(error)}`);
    return [];
  }
}

export function addMediaReversedClass(el) {
  const mediaBlocks = el.querySelectorAll('.media');
  mediaBlocks.forEach((blade, i) => {
    blade.classList.remove('media-reverse-mobile');
    if (Math.abs(i % 2) === 1) {
      blade.classList.add('media-reversed');
    }
  });
}

export default async function init(el) {
  const eventConfig = getEventConfig();
  const miloLibs = eventConfig?.miloConfig?.miloLibs ? eventConfig.miloConfig.miloLibs : LIBS;

  const promotionalItems = await getPromotionalContent();
  if (!promotionalItems.length) return;

  const [{ default: loadFragment }, { createTag }] = await Promise.all([
    import(`${miloLibs}/blocks/fragment/fragment.js`),
    import(`${miloLibs}/utils/utils.js`),
  ]);

  const fragmentPromotionalItemsPromises = promotionalItems.map(async (item) => {
    const fragmentPath = item['fragment-path'];
    if (!fragmentPath) return;

    const fragmentLink = createTag('a', { href: fragmentPath }, '', { parent: el });
    await loadFragment(fragmentLink);
  });

  await Promise.all(fragmentPromotionalItemsPromises);
  addMediaReversedClass(el);
}
