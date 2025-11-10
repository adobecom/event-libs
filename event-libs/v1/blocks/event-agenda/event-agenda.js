import { createOptimizedPicture, createTag, getMetadata, getEventConfig, getImageSource } from '../../utils/utils.js';

/**
 * Converts a UTC timestamp to user's local time format
 * @param {string|number} timestamp - UTC timestamp in milliseconds
 * @param {string} locale - Locale string (e.g., 'en-US')
 * @returns {string} Formatted local time string
 */
export function convertUtcToLocalTime(timestamp, locale) {
  if (!timestamp) return '';

  const timestampNum = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;

  if (Number.isNaN(timestampNum)) {
    window.lana?.log(`Invalid timestamp provided: ${timestamp}`);
    return '';
  }

  try {
    const date = new Date(timestampNum);

    // Check if date is valid
    if (Number.isNaN(date.getTime())) {
      window.lana?.log(`Invalid date created from timestamp: ${timestampNum}`);
      return '';
    }

    const options = {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    };

    return date.toLocaleTimeString(locale, options);
  } catch (error) {
    window.lana?.log(`Error converting timestamp to local time: ${JSON.stringify(error)}`);
    return '';
  }
}

/**
 * Legacy function for backward compatibility - converts a time string to locale format
 * Note: This does NOT handle timezone conversion, use convertUtcToLocalTime for proper timezone handling
 * @param {string} time - Time string in HH:MM:SS format
 * @param {string} locale - Locale string (e.g., 'en-US')
 * @returns {string} Formatted time string
 */
export function convertToLocaleTimeFormat(time, locale) {
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, seconds, 0);

  const options = {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  };
  const formatter = new Intl.DateTimeFormat(locale, options);

  return formatter.format(date);
}

export default async function init(el) {
  if (getMetadata('show-agenda-post-event') !== 'true' && document.body.dataset.eventState === 'post-event') {
    el.remove();
    return;
  }

  const container = createTag('div', { class: 'agenda-container' }, '', { parent: el });
  const agendaItemsCol = createTag('div', { class: 'agenda-items' }, '', { parent: container });

  const agendaMeta = getMetadata('agenda');
  let venueImage;

  try {
    venueImage = JSON.parse(getMetadata('photos')).find((p) => p.imageKind === 'venue-image');
  } catch (error) {
    window.lana?.log(`Failed to parse venue image metadata:\n${JSON.stringify(error, null, 2)}`);
  }

  if (!agendaMeta) {
    el.remove();
    return;
  }

  let agendaArray;

  try {
    agendaArray = JSON.parse(agendaMeta);
  } catch (error) {
    window.lana?.log(`Failed to parse agenda metadata:\n${JSON.stringify(error, null, 2)}`);
    el.remove();
    return;
  }

  if (agendaArray.length <= 0) {
    el.remove();
    return;
  }

  const h2 = el.querySelector('h2');
  agendaItemsCol.prepend(h2);

  if (venueImage) {
    el.classList.add('blade');
    agendaItemsCol.classList.add('agenda-items-with-image');

    const venueImageCol = createTag('div', { class: 'venue-img-col' });
    venueImageCol.append(createOptimizedPicture(getImageSource(venueImage), venueImage.altText || '', false));
    container.append(venueImageCol);
  } else if (agendaArray.length > 6) {
    container.classList.add('more-than-six');
  }

  const localeString = getEventConfig().miloConfig.locale?.ietf || 'en-US';

  const agendaItemContainer = createTag('div', { class: 'agenda-item-container' }, '', { parent: agendaItemsCol });
  const column1 = createTag('div', { class: 'column' }, '', { parent: agendaItemContainer });

  // Default to column1 if there is a venue image or agenda items are less than 6
  let column2 = column1;
  if (!venueImage && agendaArray.length > 6) {
    column2 = createTag('div', { class: 'column' }, '', { parent: agendaItemContainer });
  }

  const splitIndex = Math.ceil(agendaArray.length / 2);
  agendaArray.forEach((agenda, index) => {
    const agendaListItem = createTag('div', { class: 'agenda-list-item' }, '', { parent: (index >= splitIndex ? column2 : column1) });
    
    // Use startTimeMillis (UTC timestamp) if available for proper timezone conversion
    // Otherwise fall back to startTime (legacy format) for backward compatibility
    let formattedTime = '';
    if (agenda.startTimeMillis) {
      formattedTime = convertUtcToLocalTime(agenda.startTimeMillis, localeString);
    } else if (agenda.startTime) {
      // Legacy support - does not handle timezone conversion
      formattedTime = convertToLocaleTimeFormat(agenda.startTime, localeString);
    }
    
    createTag('span', { class: 'agenda-time' }, formattedTime, { parent: agendaListItem });

    const agendaTitleDetailContainer = createTag('div', { class: 'agenda-title-detail-container' }, '', { parent: agendaListItem });
    const agendaTitleDetails = createTag('div', { class: 'agenda-title-detail' }, '', { parent: agendaTitleDetailContainer });
    if (agenda.title) {
      createTag('div', { class: 'agenda-title' }, agenda.title, { parent: agendaTitleDetails });
    }

    if (agenda.description) {
      createTag('div', { class: 'agenda-details' }, agenda.description, { parent: agendaTitleDetails });
    }
  });
}
