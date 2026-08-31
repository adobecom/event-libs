import { getMetadata, getImageSource } from '../../utils/utils.js';

export function injectEventSchema() {
  let venueObject;
  let photos;

  try {
    venueObject = JSON.parse(getMetadata('venue'));
  } catch (error) {
    window.lana?.log(`Failed to parse venue metadata:\n${JSON.stringify(error, null, 2)}`);
  }

  try {
    photos = JSON.parse(getMetadata('photos'));
  } catch (error) {
    window.lana?.log(`Failed to parse photos metadata:\n${JSON.stringify(error, null, 2)}`);
  }

  const name = getMetadata('event-title');
  const startDate = getMetadata('start-date');
  if (!name || !startDate) return;

  const canonicalUrl = document.head.querySelector('link[rel="canonical"]')?.href
    || window.location.href;

  const schemaData = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    startDate,
    endDate: getMetadata('end-date'),
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

  if (venueObject) {
    schemaData.location = {
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
    };
  }

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
