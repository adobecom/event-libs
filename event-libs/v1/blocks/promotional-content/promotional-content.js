import { getMetadata, getEventConfig, LIBS } from '../../utils/utils.js';
import { FALLBACK_LOCALES } from '../../utils/constances.js';

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
  
  const eventConfig = getEventConfig();
  const { miloConfig } = eventConfig;
  const miloLibs = miloConfig?.miloLibs ? miloConfig.miloLibs : LIBS;
  const { getLocale } = await import(`${miloLibs}/utils/utils.js`);

  const { prefix } = getLocale(miloConfig?.locales || FALLBACK_LOCALES);
  const { data } = await fetch(`${prefix}/events/default/promotional-content.json`).then((res) => res.json());

  if (!data) {
    window.lana?.log(`Error: No promotional content found in ${prefix}/events/default/promotional-content.json`);
    return [];
  }

  const rehydratedPromotionalItems = promotionalItems.map((item) => {
    const promotionalItem = data.find((content) => content.name === item);
    return promotionalItem;
  });

  return rehydratedPromotionalItems;
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
    import(`${miloLibs}/utils.js`),
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
