/**
 * @typedef {Object} EventAttendeeDataFilter
 * @property {string} type - The type of the attribute.
 */

export const EVENT_ATTENDEE_DATA_FILTER = {
  attendeeId: { type: 'string' },
  externalAttendeeId: { type: 'string' },
  firstName: { type: 'string' },
  lastName: { type: 'string' },
  email: { type: 'string' },
  registrationStatus: { type: 'string' },
  invitedBy: { type: 'string' },
  shareInfoWithPartners: { type: 'boolean' },
  requiresTicket: { type: 'boolean' },
  ccSentiment: { type: 'string' },
  campaignId: { type: 'string' },
  phoneticFirstName: { type: 'string' },
  phoneticLastName: { type: 'string' },
};

/**
 * @typedef {Object} BaseAttendeeDataFilter
 * @property {string} type - The type of the attribute.
 */

export const BASE_ATTENDEE_DATA_FILTER = {
  attendeeId: { type: 'string' },
  firstName: { type: 'string' },
  lastName: { type: 'string' },
  email: { type: 'string' },
  companyName: { type: 'string' },
  jobTitle: { type: 'string' },
  jobRole: { type: 'string' },
  mobilePhone: { type: 'string' },
  businessPhone: { type: 'string' },
  organizationName: { type: 'string' },
  countryRegion: { type: 'string' },
  zipPostalCode: { type: 'string' },
  industry: { type: 'string' },
  productsOfInterest: { type: 'array' },
  primaryProductOfInterest: { type: 'string' },
  companySize: { type: 'string' },
  specialRequirements: { type: 'string' },
  primarySocialMediaAccount: { type: 'string' },
  approximateFollowerCount: { type: 'string' },
  dietaryRestrictions: { type: 'string' },
  executiveAssistantName: { type: 'string' },
  executiveAssistantEmail: { type: 'string' },
  website: { type: 'string' },
  employeesInOrganization: { type: 'string' },
  department: { type: 'string' },
  dxDepartment: { type: 'string' },
  title: { type: 'string' },
  age: { type: 'string' },
  jobLevel: { type: 'string' },
  contactMethods: { type: 'array' },
  isGuest: { type: 'boolean' },
  consentStringId: { type: 'string' },
  modificationTime: { type: 'string' },
  phoneticFirstName: { type: 'string' },
  phoneticLastName: { type: 'string' },
};

export function isValidAttribute(attr) {
  return (attr !== undefined && attr !== null && attr !== '') || attr === false;
}

const BOOLEAN_TRUE_TOKENS = new Set(['yes', 'true', '1', 'y', 'on']);
const BOOLEAN_FALSE_TOKENS = new Set(['no', 'false', '0', 'n', 'off']);

function coerceBoolean(key, value) {
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    if (value.length === 1) return coerceBoolean(key, value[0]);
    window.lana?.log(`Unexpected boolean field shape for ${key}`);
    return undefined;
  }
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase();
    if (BOOLEAN_TRUE_TOKENS.has(t)) return true;
    if (BOOLEAN_FALSE_TOKENS.has(t)) return false;
    return undefined;
  }
  return undefined;
}

export function getEventAttendeePayload(attendeeData) {
  if (!attendeeData) return attendeeData;
  return Object.entries(attendeeData).reduce((acc, [key, value]) => {
    if (!EVENT_ATTENDEE_DATA_FILTER[key]) return acc;
    const nextValue = EVENT_ATTENDEE_DATA_FILTER[key].type === 'boolean'
      ? coerceBoolean(key, value)
      : value;
    if (isValidAttribute(nextValue)) {
      acc[key] = nextValue;
    }
    return acc;
  }, {});
}

export function getBaseAttendeePayload(attendeeData) {
  if (!attendeeData) return attendeeData;
  return Object.entries(attendeeData).reduce((acc, [key, value]) => {
    if (BASE_ATTENDEE_DATA_FILTER[key] && isValidAttribute(value)) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

// Unlike the two allowlists above, this key-space isn't fixed, so explicitly
// reject prototype-chain property names rather than relying on the filter
// lookups incidentally treating them as "recognized".
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function getUnrecognizedAttendeeFields(attendeeData) {
  if (!attendeeData) return {};
  return Object.entries(attendeeData).reduce((acc, [key, value]) => {
    if (!UNSAFE_KEYS.has(key)
      && !EVENT_ATTENDEE_DATA_FILTER[key]
      && !BASE_ATTENDEE_DATA_FILTER[key]
      && isValidAttribute(value)) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

