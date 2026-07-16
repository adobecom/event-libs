import { createTag, getMetadata, resolveRoutedCampaignId } from '../../utils/utils.js';
import BlockMediator from '../../deps/block-mediator.min.js';
import {
  getAndCreateAndAddAttendee, getEvent, getCampaign, registerForSessionTime,
} from '../../utils/esp-controller.js';
import { dictionaryManager } from '../../utils/dictionary-manager.js';
import { stripTags } from '../../utils/sanitize-utils.js';
import { applyImplicitContactMethodsToPayload } from '../../utils/rsvp-consent.js';
import { CAMPAIGN_ID_PATTERN } from '../../utils/constances.js';
import { sanitizeComment } from './milo-bridge.js';
import { constructPayload } from './payload.js';

export const VALID_REGISTRATION_STATUS = ['registered', 'waitlisted'];

const NON_INPUT_TYPES = new Set(['submit', 'clear', 'heading', 'legal', 'divider']);

/**
 * sp-* controls are not native form elements and don't participate in
 * `form.checkValidity()`, so this manually walks each field-wrapper, checking
 * the control's own `checkValidity()` plus a `required`-emptiness check
 * against the current payload. Flags invalid fields with `.invalid` +
 * an `sp-help-text`. Replaces events-form.js's reliance on
 * `form.checkValidity()`.
 * @param {HTMLElement} themeHost
 * @returns {boolean}
 */
export function validateForm(themeHost) {
  const payload = constructPayload(themeHost);
  let valid = true;

  themeHost.querySelectorAll('[data-field-id]').forEach((wrapper) => {
    const { type, fieldId, required } = wrapper.dataset;
    if (NON_INPUT_TYPES.has(type) || wrapper.classList.contains('hidden')) return;

    const control = wrapper.querySelector(
      'sp-textfield, sp-picker, sp-combobox, sp-radio-group, .rsvp-form-radio-group, .rsvp-form-combobox',
    );
    let fieldValid = control?.checkValidity ? control.checkValidity() : true;

    if (required === 'x') {
      const value = payload[fieldId];
      const empty = value == null || value === '' || value === false
        || (Array.isArray(value) && value.length === 0);
      if (empty) fieldValid = false;
    }

    wrapper.classList.toggle('is-invalid', !fieldValid);
    if (control) control.invalid = !fieldValid;

    const existingMsg = wrapper.querySelector('sp-help-text.rsvp-form-required-msg');
    if (!fieldValid && !existingMsg) {
      wrapper.append(createTag(
        'sp-help-text',
        { variant: 'negative', class: 'rsvp-form-required-msg' },
        dictionaryManager.getValue('rsvp-field-required-msg', 'rsvp-fields'),
      ));
    } else if (fieldValid) {
      existingMsg?.remove();
    }

    if (!fieldValid) valid = false;
  });

  return valid;
}

/**
 * Resolves full state from event and optionally campaign (when campaign ID
 * in URL). Ported from events-form.js's getFullState.
 * @param {string} eventId
 * @returns {Promise<{ full: boolean, waitlistEnabled: boolean, usedCampaign: boolean }>}
 */
export async function getFullState(eventId) {
  const eventObj = await getEvent(eventId);
  if (!eventObj.ok) return { full: false, waitlistEnabled: false, usedCampaign: false };

  const { isFull, allowWaitlisting, attendeeCount, attendeeLimit } = eventObj.data;
  let full = isFull || (!allowWaitlisting && +attendeeCount >= +attendeeLimit);
  const waitlistEnabled = allowWaitlisting;
  let usedCampaign = false;

  const campaignId = new URLSearchParams(window.location.search).get('campaign');
  if (campaignId && CAMPAIGN_ID_PATTERN.test(campaignId)) {
    const campaignInfo = await getCampaign(eventId, campaignId);
    if (campaignInfo.ok && campaignInfo.data.attendeeLimit != null) {
      const { attendeeLimit: campLimit, attendeeCount: campCount, waitlistAttendeeCount } = campaignInfo.data;
      full = campLimit === campCount || (campLimit > campCount && waitlistAttendeeCount > 0);
      usedCampaign = true;
    }
  }

  return { full, waitlistEnabled, usedCampaign };
}

/** Ported from events-form.js's buildErrorMsg. */
export async function buildErrorMsg(parent, status) {
  const eventId = getMetadata('event-id');
  const eventObj = await getEvent(eventId);
  if (!eventObj.ok) return;

  let errorKey = 'rsvp-error-msg';
  if (status === 400) {
    const { full, waitlistEnabled, usedCampaign } = await getFullState(eventId);
    if (full && usedCampaign) {
      errorKey = waitlistEnabled ? 'campaign-full-error-msg' : 'campaign-full-no-waitlist-error-msg';
    } else {
      errorKey = eventObj.data?.allowWaitlisting === 'true' ? 'event-full-error-msg' : 'event-full-no-waitlist-error-msg';
    }
  }

  parent.querySelectorAll('.error').forEach((err) => err.remove());
  const error = createTag('p', { class: 'error' }, dictionaryManager.getValue(errorKey));
  parent.append(error);
  setTimeout(() => error.remove(), 3000);
}

async function buildSubmitPayload(themeHost) {
  const payload = constructPayload(themeHost);

  const countryPicker = themeHost.querySelector('#consentStringId');
  if (countryPicker?.value) {
    const item = countryPicker.querySelector?.(`sp-menu-item[value="${countryPicker.value}"]`);
    payload.countryRegion = countryPicker.value;
    if (item?.dataset.consentId) payload.consentStringId = item.dataset.consentId;
  }

  applyImplicitContactMethodsToPayload(themeHost, payload);

  const textWrappers = [...themeHost.querySelectorAll('[data-type="text"], [data-type="text-area"]')];
  await Promise.all(textWrappers.map(async (wrapper) => {
    const { fieldId } = wrapper.dataset;
    if (payload[fieldId]) payload[fieldId] = await sanitizeComment(stripTags(payload[fieldId]));
  }));

  const campaignId = await resolveRoutedCampaignId();
  if (campaignId) payload.campaignId = campaignId;

  return payload;
}

export async function submitForm(themeHost) {
  const payload = await buildSubmitPayload(themeHost);
  return getAndCreateAndAddAttendee(getMetadata('event-id'), payload);
}

export function clearForm(themeHost) {
  themeHost.querySelectorAll('[data-field-id]').forEach((wrapper) => {
    const { type } = wrapper.dataset;
    if (type === 'checkbox' || type === 'checkbox-group') {
      wrapper.querySelectorAll('sp-checkbox').forEach((cb) => { cb.checked = false; });
    } else if (type === 'radio-group') {
      wrapper.querySelectorAll('sp-radio, input[type="radio"]').forEach((r) => { r.checked = false; });
    } else if (type === 'multi-select') {
      const control = wrapper.querySelector('sp-combobox, .rsvp-form-combobox');
      if (control) { if ('values' in control) control.values = []; else control.value = ''; }
    } else if (type !== 'submit' && type !== 'clear' && type !== 'heading' && type !== 'legal' && type !== 'divider') {
      const control = wrapper.querySelector('sp-textfield, sp-picker');
      if (control) control.value = '';
    }
  });
}

/** Ported from events-form.js's autoRegisterSessions. */
async function autoRegisterSessions() {
  let sessions;
  try {
    sessions = JSON.parse(getMetadata('sessions') || '[]');
  } catch (e) {
    return;
  }

  const autoRegTimes = sessions.flatMap((s) => (s.sessionTimes || []).filter((t) => t.isAutoRegistrationEnabled));
  if (!autoRegTimes.length) return;

  const results = await Promise.allSettled(
    autoRegTimes.map((t) => registerForSessionTime(t.sessionTimeId, 'me', { registrationStatus: 'registered' })),
  );

  const newIds = new Set();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.ok) newIds.add(autoRegTimes[i].sessionId);
    else window.lana?.log(`rsvp-form: auto-registration failed for session time ${autoRegTimes[i]?.sessionTimeId}`);
  });

  if (!newIds.size) return;
  const existing = BlockMediator.get('registeredSessionIds') || new Set();
  BlockMediator.set('registeredSessionIds', new Set([...existing, ...newIds]));
}

/**
 * Wires the submit/clear `sp-button` click handlers built by fields.js
 * (`[data-action="submit"]`/`[data-action="clear"]`).
 * @param {HTMLElement} themeHost
 * @param {{ onSuccess?: Function, onError?: Function }} [callbacks]
 */
export function wireSubmitClear(themeHost, { onSuccess, onError } = {}) {
  const submitButton = themeHost.querySelector('[data-action="submit"]');
  const clearButton = themeHost.querySelector('[data-action="clear"]');

  submitButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    if (!validateForm(themeHost)) return;

    submitButton.disabled = true;
    submitButton.classList.add('submitting');
    let respJson;
    try {
      respJson = await submitForm(themeHost);
    } finally {
      submitButton.disabled = false;
      submitButton.classList.remove('submitting');
    }
    if (!respJson) return;

    if (respJson.ok) {
      BlockMediator.set('rsvpData', respJson.data);
      if (respJson.data?.registrationStatus === 'registered') autoRegisterSessions();
      onSuccess?.(respJson.data);
    } else {
      const { status } = respJson;
      if (status === 400) {
        const fullState = await getFullState(getMetadata('event-id'));
        if (fullState.full) {
          if (fullState.waitlistEnabled) {
            submitButton.textContent = dictionaryManager.getValue('waitlist-cta-text');
            submitButton.disabled = false;
          } else {
            submitButton.textContent = dictionaryManager.getValue('event-full-cta-text');
            submitButton.disabled = true;
          }
        }
        BlockMediator.set('rsvpData', null);
      }
      buildErrorMsg(themeHost, status);
      onError?.(respJson);
    }
  });

  clearButton?.addEventListener('click', (e) => {
    e.preventDefault();
    clearForm(themeHost);
  });

  return { submitButton, clearButton };
}
