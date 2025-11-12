import { createOptimizedPicture, createTag, getMetadata, getEventConfig, getImageSource } from '../../utils/utils.js';

const TIME_FORMAT_OPTIONS = {
  hour: 'numeric',
  minute: 'numeric',
  hour12: true,
};

/**
 * Parses event date from various formats (milliseconds, ISO string, or numeric string)
 * @param {string|number} dateValue - Date value to parse
 * @returns {Date} Parsed Date object
 */
function parseEventDate(dateValue) {
  if (typeof dateValue === 'string') {
    // ISO string or milliseconds as string
    const isISOString = dateValue.includes('T') || dateValue.includes('-');
    return isISOString ? new Date(dateValue) : new Date(parseInt(dateValue, 10));
  }
  return new Date(dateValue);
}

/**
 * Converts event time to user's local timezone with DST awareness.
 * Uses iterative refinement to find the correct UTC timestamp, accounting for DST transitions.
 * 
 * @param {string} time - Time in HH:MM:SS format (e.g., "09:00:00")
 * @param {string} eventTimezone - IANA timezone (e.g., "America/Los_Angeles")
 * @param {string|number} eventDateMillis - Event date (milliseconds or ISO string) for DST context
 * @param {string} locale - Locale for formatting (e.g., 'en-US')
 * @returns {string} Formatted local time (e.g., "9:00 AM")
 */
export function convertEventTimeToLocalTime(time, eventTimezone, eventDateMillis, locale) {
  if (!time || !eventTimezone || !eventDateMillis) return '';

  try {
    const [hours, minutes, seconds = 0] = time.split(':').map(Number);
    
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      window.lana?.log(`Invalid time format: ${time}`);
      return '';
    }

    const eventDate = parseEventDate(eventDateMillis);
    if (Number.isNaN(eventDate.getTime())) {
      window.lana?.log(`Invalid event date: ${eventDateMillis}`);
      return '';
    }
    
    // Extract date components in event timezone for DST handling
    const eventDateStr = eventDate.toLocaleDateString('en-CA', {
      timeZone: eventTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [year, month, day] = eventDateStr.split('-').map(Number);
    
    // Iteratively refine to find correct UTC timestamp for local time in event timezone
    let guess = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
    
    for (let attempt = 0; attempt < 3; attempt++) {
      const formatted = guess.toLocaleString('en-US', {
        timeZone: eventTimezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      
      const match = formatted.match(/(\d+):(\d+):(\d+)/);
      if (!match) break;
      
      const [, gotHour, gotMin, gotSec] = match.map(Number);
      
      if (gotHour === hours && gotMin === minutes && gotSec === seconds) {
        return guess.toLocaleTimeString(locale, TIME_FORMAT_OPTIONS);
      }
      
      const wantedSeconds = hours * 3600 + minutes * 60 + seconds;
      const gotSeconds = gotHour * 3600 + gotMin * 60 + gotSec;
      guess = new Date(guess.getTime() + (wantedSeconds - gotSeconds) * 1000);
    }
    
    return guess.toLocaleTimeString(locale, TIME_FORMAT_OPTIONS);
  } catch (error) {
    window.lana?.log(`Error converting event time: ${error.message}`);
    return '';
  }
}

/**
 * Converts time string to locale format without timezone conversion.
 * Fallback for when timezone metadata is unavailable.
 * @param {string} time - Time in HH:MM:SS format
 * @param {string} locale - Locale (e.g., 'en-US')
 * @returns {string} Formatted time string
 */
export function convertToLocaleTimeFormat(time, locale) {
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, seconds, 0);
  return new Intl.DateTimeFormat(locale, TIME_FORMAT_OPTIONS).format(date);
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
  const eventTimezone = getMetadata('timezone');
  const eventStartMillis = getMetadata('local-start-time-millis');

  const agendaItemContainer = createTag('div', { class: 'agenda-item-container' }, '', { parent: agendaItemsCol });
  const column1 = createTag('div', { class: 'column' }, '', { parent: agendaItemContainer });

  // Use two columns if no venue image and more than 6 items
  let column2 = column1;
  if (!venueImage && agendaArray.length > 6) {
    column2 = createTag('div', { class: 'column' }, '', { parent: agendaItemContainer });
  }

  const splitIndex = Math.ceil(agendaArray.length / 2);
  agendaArray.forEach((agenda, index) => {
    const agendaListItem = createTag('div', { class: 'agenda-list-item' }, '', { parent: (index >= splitIndex ? column2 : column1) });
    
    // Format time with timezone conversion if metadata available, otherwise use legacy format
    let formattedTime = '';
    if (agenda.startTime && eventTimezone && eventStartMillis) {
      formattedTime = convertEventTimeToLocalTime(agenda.startTime, eventTimezone, eventStartMillis, localeString);
    } else if (agenda.startTime) {
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
