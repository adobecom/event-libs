import { createTag, getEventConfig, LIBS } from '../../utils/utils.js';
import { dictionaryManager } from '../../utils/dictionary-manager.js';
import { FALLBACK_LOCALES } from '../../utils/constances.js';
import { getImplicitConsentRaw } from '../../utils/rsvp-consent.js';
import { loadFragment } from './milo-bridge.js';

function t(key) {
  return dictionaryManager.getValue(key, 'rsvp-fields');
}

async function getConsentQueryIndexUrl() {
  const miloConfig = getEventConfig()?.miloConfig;
  const libs = miloConfig?.miloLibs || LIBS;
  const { getLocale } = await import(`${libs}/utils/utils.js`);
  const { prefix } = getLocale(miloConfig?.locales || FALLBACK_LOCALES);
  const moduleUrl = new URL(import.meta.url);
  const domain = `${moduleUrl.protocol}//${moduleUrl.host}`;
  return `${domain}${prefix}/event-libs/assets/consents/consent-query-index.json`;
}

function createContactMethodsGroup(options) {
  const group = createTag('div', {
    class: 'rsvp-form-checkbox-group field-wrapper rsvp-form-full-width',
    'data-field-id': 'contactMethods',
    'data-type': 'checkbox-group',
  });
  options.split(';').map((o) => o.trim()).filter(Boolean).forEach((opt) => {
    group.append(createTag('sp-checkbox', { value: opt, name: 'contactMethods' }, t(opt)));
  });
  return group;
}

/**
 * Rebuilds the consent terms/contact-methods region for the selected country.
 * Ported from events-form.js's loadConsent.
 */
async function loadConsent(termsWrapper, submitButton, consentData) {
  const { path, countryCode } = consentData;
  submitButton.disabled = true;
  termsWrapper.innerHTML = '';
  termsWrapper.classList.add('transparent');

  const termsFragLink = createTag('a', { href: new URL(path, import.meta.url).href, target: '_blank' });
  termsWrapper.append(termsFragLink);
  await loadFragment(termsFragLink);
  termsWrapper.classList.remove('transparent');

  const implicitRaw = getImplicitConsentRaw(termsWrapper, consentData);
  if (implicitRaw) termsWrapper.dataset.implicitConsent = implicitRaw;
  else delete termsWrapper.dataset.implicitConsent;

  const uls = [...termsWrapper.querySelectorAll('ul')];
  if (!uls.length) {
    submitButton.disabled = false;
    return;
  }

  uls.forEach((ul) => {
    const items = [...ul.querySelectorAll('li')];

    if (countryCode === 'CN') {
      // FIXME: temporary solution for the China case, ported from events-form.js.
      items.forEach((li) => {
        const val = li.textContent.trim().replaceAll(' ', '-');
        termsWrapper.append(createTag('sp-checkbox', { value: val, class: 'submit-blocker' }, li.innerHTML));
      });
      const blockers = [...termsWrapper.querySelectorAll('.submit-blocker')];
      const recompute = () => {
        submitButton.disabled = blockers.filter((cb) => cb.checked).length !== blockers.length;
      };
      blockers.forEach((cb) => cb.addEventListener('change', recompute));
      recompute();
    } else {
      const options = items.map((li) => li.textContent.trim()).join(';');
      if (options) termsWrapper.append(createContactMethodsGroup(options));
      submitButton.disabled = false;
    }

    ul.remove();
  });
}

/**
 * Adds the country picker + terms/consent region before the submit button,
 * when guest registration requires consent (`allow-guest-registration` +
 * guest profile) or `force-consent-collection` metadata is set. Ported from
 * events-form.js's addConsentSuite.
 * @param {HTMLElement} themeHost
 * @param {HTMLElement} submitButton
 */
export async function addConsentSuite(themeHost, submitButton) {
  const countryText = t('country');
  const label = createTag('sp-field-label', { for: 'consentStringId', required: '' }, countryText);
  const countryPicker = createTag('sp-picker', { id: 'consentStringId', label: countryText, required: '' });
  const fieldWrapper = createTag('div', {
    class: 'field-wrapper rsvp-form-select-wrapper',
    'data-field-id': 'country',
    'data-type': 'select',
    'data-required': 'x',
  }, [label, countryPicker]);
  const termsWrapper = createTag('div', {
    class: 'field-wrapper rsvp-form-full-width terms-and-conditions-wrapper transparent',
    'data-field-id': 'contactMethods',
    'data-type': 'checkbox-group',
  });

  let rows = [];
  try {
    const consentIndex = await fetch(await getConsentQueryIndexUrl()).then((r) => r.json());
    rows = consentIndex?.data || [];
  } catch (error) {
    window.lana?.log(`rsvp-form: failed to load consent query index: ${JSON.stringify(error)}`);
  }

  rows.forEach((c) => {
    countryPicker.append(createTag('sp-menu-item', { value: c.countryCode, 'data-consent-id': c.consentId }, c.countryName));
  });

  countryPicker.addEventListener('change', async () => {
    const consentData = rows.find((c) => c.countryCode === countryPicker.value);
    if (consentData) await loadConsent(termsWrapper, submitButton, consentData);
  });

  const submitWrapper = submitButton.closest('[data-field-id]') || submitButton;
  submitWrapper.before(fieldWrapper, termsWrapper);
}
