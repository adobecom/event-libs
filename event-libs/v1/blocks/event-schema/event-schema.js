import { getMetadata, getImageSource } from '../../utils/utils.js';
import { logError } from '../../utils/lana-log.js';

export function injectEventSchema() {
  let venueObject;
  let photos;

  try {
    venueObject = JSON.parse(getMetadata('venue'));
  } catch (error) {
    logError('event-schema', 'Failed to parse venue metadata', error);
  }

  try {
    photos = JSON.parse(getMetadata('photos'));
  } catch (error) {
    logError('event-schema', 'Failed to parse photos metadata', error);
  }

  const name = getMetadata('event-title');
  const startDate = getMetadata('start-date');
  if (!name || !startDate || !venueObject) return;

  const canonicalUrl = document.head.querySelector('link[rel="canonical"]')?.href
    || window.location.href;

  const schemaData = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    startDate,
    endDate: getMetadata('end-date'),
    location: {
      '@type': 'Place',
      name: venueObject.venueName,
      address: {
        '@type': 'PostalAddress',
        streetAddress: venueObject.address,
        addressLocality: venueObject.city,
        addressRegion: venueObject.stateCode,
        postalCode: venueObject.postalCode,
        addressCountry: venueObject.country,
      },
    },
    description: getMetadata('description') || '',
    organizer: {
      '@type': 'Organization',
      name: 'Adobe',
      url: window.location.href,
    },
    offers: {
      '@type': 'Offer',
      url: canonicalUrl,
    },
  };

  if (Array.isArray(photos)) {
    const heroOrCardImage = photos.find((photo) => photo.imageKind === 'event-hero-image')
      || photos.find((photo) => photo.imageKind === 'event-card-image');
    const imageUrl = getImageSource(heroOrCardImage);
    if (imageUrl) schemaData.image = imageUrl;
  }

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.text = JSON.stringify(schemaData);
  document.head.appendChild(script);
}

export default function init(el) {
  el.remove();
  injectEventSchema();
}
