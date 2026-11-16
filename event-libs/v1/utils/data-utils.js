import { logWarning } from './lana-log.js';

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
    logWarning('data-utils', `Unexpected boolean field shape for ${key}`);
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

// The submitted key-space isn't fixed, so explicitly reject prototype-chain property names.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Builds the flat payload for the atomic RSVP submit: every submitted form field
 * (base profile, event, and custom) in one object. Which fields belong to the base
 * profile vs. the event registration is decided server-side, so no routing happens here.
 * Empty values and prototype-chain keys are dropped; boolean event fields are coerced.
 * @param {Object} attendeeData - Raw form payload.
 * @param {string} registrationStatus - 'registered' | 'waitlisted'.
 * @returns {Object}
 */
export function getRsvpPayload(attendeeData, registrationStatus) {
  return Object.entries({ ...attendeeData, registrationStatus }).reduce((acc, [key, value]) => {
    if (UNSAFE_KEYS.has(key)) return acc;
    const nextValue = EVENT_ATTENDEE_DATA_FILTER[key]?.type === 'boolean'
      ? coerceBoolean(key, value)
      : value;
    if (isValidAttribute(nextValue)) acc[key] = nextValue;
    return acc;
  }, {});
}

