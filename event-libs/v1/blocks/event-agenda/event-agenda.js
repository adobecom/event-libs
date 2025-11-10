import { createOptimizedPicture, createTag, getMetadata, getEventConfig, getImageSource } from '../../utils/utils.js';

/**
 * Converts event time to user's local timezone
 * Takes a time string in the event's timezone and converts it to the user's local timezone,
 * properly accounting for DST.
 * 
 * @param {string} time - Time string in HH:MM:SS format (e.g., "09:00:00")
 * @param {string} eventTimezone - IANA timezone of the event (e.g., "America/Los_Angeles")  
 * @param {string|number} eventDateMillis - Event date in milliseconds (provides the date context)
 * @param {string} locale - Locale string for formatting (e.g., 'en-US')
 * @returns {string} Formatted local time string (e.g., "9:00 AM" or "12:00 PM")
 */
export function convertEventTimeToLocalTime(time, eventTimezone, eventDateMillis, locale) {
  if (!time || !eventTimezone || !eventDateMillis) return '';

  try {
    // Parse the time string to get hours, minutes, seconds
    const [hours, minutes, seconds = 0] = time.split(':').map(Number);
    
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      window.lana?.log(`Invalid time format: ${time}`);
      return '';
    }

    // Parse the event date
    const eventDateNum = typeof eventDateMillis === 'string' ? parseInt(eventDateMillis, 10) : eventDateMillis;
    if (Number.isNaN(eventDateNum)) {
      window.lana?.log(`Invalid event date: ${eventDateMillis}`);
      return '';
    }

    const eventDate = new Date(eventDateNum);
    
    // Get the date components in the event's timezone (this handles DST correctly)
    const eventDateStr = eventDate.toLocaleDateString('en-CA', {
      timeZone: eventTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }); // Returns "YYYY-MM-DD"
    
    // To find the correct UTC time for this local time in the event timezone,
    // we use a two-step process:
    // 1. Create a reference date at the specified time
    // 2. Find what time that represents in the event timezone and calculate the offset
    
    const [year, month, day] = eventDateStr.split('-').map(Number);
    
    // Create a date at the specified time in the local browser timezone
    const localDate = new Date(year, month - 1, day, hours, minutes, seconds);
    
    // Get this date formatted in both UTC and the event timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const utcFormatted = formatter.format(localDate).replace(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6');
    const eventTzFormatted = new Intl.DateTimeFormat('en-US', {
      ...formatter.resolvedOptions(),
      timeZone: eventTimezone,
    }).format(localDate).replace(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6');
    
    // Calculate the offset between UTC and event timezone at this date (accounts for DST)
    const utcTime = new Date(utcFormatted).getTime();
    const eventTzTime = new Date(eventTzFormatted).getTime();
    const offset = utcTime - eventTzTime;
    
    // Apply the offset to get the correct UTC time
    const correctUtcTime = localDate.getTime() - offset;
    const correctDate = new Date(correctUtcTime);

    // Format the result in the user's local timezone
    const options = {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    };

    return correctDate.toLocaleTimeString(locale, options);
  } catch (error) {
    window.lana?.log(`Error converting event time to local time: ${JSON.stringify(error)}`);
    return '';
  }
}

/**
 * Legacy function - converts a time string to locale format without timezone conversion
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
  const eventTimezone = getMetadata('timezone'); // e.g., "America/Los_Angeles"
  const eventStartMillis = getMetadata('local-start-time-millis'); // Event date base

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
    
    // Convert agenda time from event timezone to user's local timezone
    let formattedTime = '';
    if (agenda.startTime && eventTimezone && eventStartMillis) {
      // Timezone-aware conversion using event timezone
      formattedTime = convertEventTimeToLocalTime(agenda.startTime, eventTimezone, eventStartMillis, localeString);
    } else if (agenda.startTime) {
      // Fallback: no timezone conversion (legacy behavior)
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
