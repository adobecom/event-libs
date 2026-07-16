function snakeToCamel(str) {
  return str
    .split('_')
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
}

/** Consent picker uses query-index countryCode as option value; consentId lives on data-consent-id. */
function applyConsentCountrySelectValue(picker, stored) {
  if (!stored || typeof stored !== 'string' || !picker) return;
  const items = [...picker.querySelectorAll('sp-menu-item')];
  const byCode = items.find((i) => i.value?.toLowerCase() === stored.toLowerCase());
  if (byCode) {
    picker.value = byCode.value;
    return;
  }
  const byConsentId = items.find((i) => i.dataset.consentId === stored);
  if (byConsentId) picker.value = byConsentId.value;
}

/**
 * Prefills form fields from profile/existing-attendee data. Ported from
 * events-form.js's personalizeForm — fixes the `!matchedInput.v` typo there
 * (dead code that always evaluated truthy, so prefill silently never ran for
 * fields already carrying a value) to the intended `!matchedInput.value`
 * "don't clobber a value the user already entered" check.
 * @param {HTMLElement} themeHost
 * @param {Record<string, Record<string, unknown>>} data - e.g. `{ profile, existingAttendeeData }`
 */
export function personalizeForm(themeHost, data) {
  if (!data || !themeHost) return;

  Object.entries(data).forEach(([source, value]) => {
    Object.entries(value || {}).forEach(([k, v]) => {
      const matchedInput = themeHost.querySelector(`#${snakeToCamel(k)}`);
      if (!matchedInput || !v || matchedInput.value) return;

      if (Array.isArray(v)) {
        if ('values' in matchedInput) {
          matchedInput.values = v;
        } else {
          v.forEach((val) => {
            const item = matchedInput.querySelector?.(`sp-menu-item[value="${val}"]`);
            if (item) item.selected = true;
          });
        }
      } else if (matchedInput.id === 'consentStringId') {
        applyConsentCountrySelectValue(matchedInput, v);
        if (source === 'profile') matchedInput.disabled = true;
      } else {
        matchedInput.value = v;
        if (source === 'profile') matchedInput.disabled = true;
      }
      matchedInput.dispatchEvent(new Event('change'));
    });
  });
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

/**
 * Auto-selects the consent country picker from profile/cookie/navigator
 * locale, when not already set. Ported from events-form.js's
 * initFormBasedOnRSVPData tail.
 */
export function autoSelectConsentCountry(themeHost, profile) {
  const countryPicker = themeHost.querySelector('sp-picker#consentStringId');
  if (!countryPicker || countryPicker.value) return;

  const items = [...countryPicker.querySelectorAll('sp-menu-item')];
  const findByCode = (code) => {
    if (!code || typeof code !== 'string') return undefined;
    const lower = code.toLowerCase();
    return items.find((i) => i.value?.toLowerCase() === lower);
  };

  const profileCode = profile?.countryCode;
  const cookieCode = getCookie('international_cookie');
  const navigatorRegion = window.navigator.language.toLowerCase().split('-')[1];
  const match = findByCode(profileCode)
    ?? findByCode(cookieCode)
    ?? (navigatorRegion ? findByCode(navigatorRegion) : undefined);

  if (match) {
    countryPicker.value = match.value;
    countryPicker.dispatchEvent(new Event('change'));
  }
}
