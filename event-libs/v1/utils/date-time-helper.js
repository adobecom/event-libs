import { getMetadata } from "./utils.js";

/**
 * Converts a UTC timestamp (in milliseconds) to a user-friendly local date time string.
 * The output is DST sensitive and follows locale format without localization.
 * @param {string|number} timestamp - UTC timestamp in milliseconds
 * @param {string} locale - Locale string (e.g., 'en-US')
 * @returns {string} Formatted local date time string
 */
export function convertUtcTimestampToLocalDateTime(timestamp, locale = 'en-US') {
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

    // Format the date using locale-specific formatting
    // This will automatically handle DST and local timezone
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    };

    return date.toLocaleString(locale, options);
  } catch (error) {
    window.lana?.log(`Error converting timestamp to local date time: ${JSON.stringify(error)}`);
    return '';
  }
}

/**
 * Checks if two timestamps are on the same day in the local timezone.
 * @param {string|number} startTimestamp - Start timestamp in milliseconds
 * @param {string|number} endTimestamp - End timestamp in milliseconds
 * @returns {boolean} True if both timestamps are on the same day
 */
export function areTimestampsOnSameDay(startTimestamp, endTimestamp) {
  if (!startTimestamp || !endTimestamp) return false;

  try {
    const startNum = typeof startTimestamp === 'string' ? parseInt(startTimestamp, 10) : startTimestamp;
    const endNum = typeof endTimestamp === 'string' ? parseInt(endTimestamp, 10) : endTimestamp;

    if (Number.isNaN(startNum) || Number.isNaN(endNum)) return false;

    const startDate = new Date(startNum);
    const endDate = new Date(endNum);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false;

    // Compare year, month, and day
    return startDate.getFullYear() === endDate.getFullYear()
           && startDate.getMonth() === endDate.getMonth()
           && startDate.getDate() === endDate.getDate();
  } catch (error) {
    window.lana?.log(`Error comparing timestamps: ${JSON.stringify(error)}`);
    return false;
  }
}

/**
 * Gets the localized timezone abbreviation
 * @param {number} timestamp - UTC timestamp in milliseconds
 * @param {string} locale - Locale string
 * @returns {string} Timezone abbreviation (e.g., 'PST', 'EDT')
 */
function getLocalTimeZone(timestamp, locale) {
  return new Date(timestamp)
    .toLocaleTimeString(locale, { timeZoneName: 'short' }).split(' ').slice(-1)[0];
}

/**
 * Gets the time interval between two timestamps
 * @param {number} startTimestamp - Start timestamp in milliseconds
 * @param {number} endTimestamp - End timestamp in milliseconds
 * @param {string} locale - Locale string
 * @returns {string} Time interval (e.g., '13:00 - 14:45')
 */
function getTimeInterval(startTimestamp, endTimestamp, locale) {
  const options = { hour: '2-digit', minute: '2-digit' };

  const startTime = new Date(startTimestamp).toLocaleTimeString(locale, options);
  const endTime = new Date(endTimestamp).toLocaleTimeString(locale, options);

  return `${startTime} - ${endTime}`;
}

/**
 * Gets the localized day of month
 * @param {number} timestamp - UTC timestamp in milliseconds
 * @param {string} locale - Locale string
 * @returns {string} Day of month, padded (e.g., '06', '20')
 */
function getDay(timestamp, locale) {
  return new Date(timestamp).toLocaleDateString(locale, { day: '2-digit' });
}

/**
 * Gets the localized month abbreviation
 * @param {number} timestamp - UTC timestamp in milliseconds
 * @param {string} locale - Locale string
 * @returns {string} Month abbreviation (e.g., 'Aug', 'Oct')
 */
function getMonth(timestamp, locale) {
  return new Date(timestamp).toLocaleDateString(locale, { month: 'short' });
}

/**
 * Gets the localized day of the week
 * @param {number} timestamp - UTC timestamp in milliseconds
 * @param {string} locale - Locale string
 * @returns {string} Day of week abbreviation (e.g., 'Tue', 'Fri')
 */
function getDayOfTheWeek(timestamp, locale) {
  return new Date(timestamp).toLocaleDateString(locale, { weekday: 'short' });
}

/**
 * Creates a formatted date string using a template
 * @param {number} startTimestamp - Start timestamp in milliseconds
 * @param {number} endTimestamp - End timestamp in milliseconds
 * @param {string} locale - Locale string
 * @param {string} template - Format template with tokens
 * @returns {string} Formatted date string
 */
export function createTemplatedDateRange(startTimestamp, endTimestamp, locale, template) {
  if (!startTimestamp || !endTimestamp || !template) return '';

  const startNum = typeof startTimestamp === 'string' ? parseInt(startTimestamp, 10) : startTimestamp;
  const endNum = typeof endTimestamp === 'string' ? parseInt(endTimestamp, 10) : endTimestamp;

  if (Number.isNaN(startNum) || Number.isNaN(endNum)) return '';

  try {
    return template
      .replace('{LLL}', getMonth(startNum, locale))
      .replace('{dd}', getDay(startNum, locale))
      .replace('{ddd}', getDayOfTheWeek(startNum, locale))
      .replace('{timeRange}', getTimeInterval(startNum, endNum, locale))
      .replace('{timeZone}', getLocalTimeZone(startNum, locale));
  } catch (error) {
    window.lana?.log(`Error creating templated date range: ${JSON.stringify(error)}`);
    return '';
  }
}

/**
 * Creates a smart date range display based on whether start and end are on the same day.
 * @param {string} startTimestamp - Start timestamp
 * @param {string} endTimestamp - End timestamp
 * @param {string} locale - Locale string
 * @returns {string} Smart date range string
 */
export function createSmartDateRange(startTimestamp, endTimestamp, locale) {
  if (!startTimestamp || !endTimestamp) return '';

  const startDateTime = convertUtcTimestampToLocalDateTime(startTimestamp, locale);
  const endDateTime = convertUtcTimestampToLocalDateTime(endTimestamp, locale);

  if (!startDateTime || !endDateTime) return '';

  // If same day, return just the start date time
  if (areTimestampsOnSameDay(startTimestamp, endTimestamp)) {
    return startDateTime;
  }

  // If different days, return range format
  return `${startDateTime} - ${endDateTime}`;
}

/**
 * Metadata hydration rules for transforming raw metadata into user-friendly formats.
 * Each rule defines how to transform a specific metadata field.
 */
const METADATA_MASSAGE_RULES = {
  'local-start-time-millis': {
    outputKey: 'user-start-date-time',
    transform: (originalValue, locale) => convertUtcTimestampToLocalDateTime(originalValue, locale),
  },
  'local-end-time-millis': {
    outputKey: 'user-end-date-time',
    transform: (originalValue, locale) => convertUtcTimestampToLocalDateTime(originalValue, locale),
  },
  // Smart date range that shows single date for same-day events, range for multi-day events
  // This is a computed rule that doesn't depend on a specific metadata field
  'computed-event-date-range': {
    outputKey: 'user-event-date-time-range',
    isComputed: true,
    transform: (locale) => {
      const startTimestamp = getMetadata('local-start-time-millis');
      const endTimestamp = getMetadata('local-end-time-millis');
      const customTemplate = getMetadata('custom-date-time-format');

      // If custom template is provided, use templated formatting
      if (customTemplate) {
        return createTemplatedDateRange(startTimestamp, endTimestamp, locale, customTemplate);
      }

      // Otherwise, use smart date range (fallback)
      return createSmartDateRange(startTimestamp, endTimestamp, locale);
    },
  },
  // Future hydration rules can be added here
  // 'some-other-field': {
  //   outputKey: 'user-friendly-field',
  //   transform: (value, locale) => someOtherTransform(value, locale),
  // },
};

/**
 * Hydrates metadata by applying transformation rules to create user-friendly data.
 * This function processes multiple metadata fields and adds transformed versions
 * to the extraData object for content population.
 * @param {Object} extraData - The extraData object to populate with hydrated data
 * @param {string} locale - Locale string for formatting (e.g., 'en-US')
 * @returns {Object} Updated extraData object with hydrated metadata
 */
export function massageMetadata(locale = 'en-US') {
  const massagedData = {};

  // Process each hydration rule
  Object.entries(METADATA_MASSAGE_RULES).forEach(([metadataKey, rule]) => {
    try {
      let transformedValue;

      if (rule.isComputed) {
        // Computed rules don't depend on a specific metadata field
        transformedValue = rule.transform(locale);
      } else {
        // Standard rules depend on a specific metadata field
        const metadataValue = getMetadata(metadataKey);
        if (metadataValue) {
          transformedValue = rule.transform(metadataValue, locale);
        }
      }

      if (transformedValue) {
        massagedData[rule.outputKey] = transformedValue;
      }
    } catch (error) {
      window.lana?.log(`Error processing rule ${metadataKey}: ${error.message}`);
    }
  });

  return massagedData;
}
