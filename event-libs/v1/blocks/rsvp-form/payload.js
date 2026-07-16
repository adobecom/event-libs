const NON_PAYLOAD_TYPES = new Set(['submit', 'clear', 'heading', 'legal', 'divider']);
// The consent country picker (data-field-id="country") is read separately by
// submit.js's buildSubmitPayload, which maps the selected option to the
// attendee-payload keys the API expects (`countryRegion`, `consentStringId`)
// — it must not also flow through the generic per-field loop below.
const NON_PAYLOAD_FIELD_IDS = new Set(['country']);

function readCheckboxGroupValue(wrapper) {
  const checkboxes = [...wrapper.querySelectorAll('sp-checkbox')];
  const checked = checkboxes.filter((cb) => cb.checked).map((cb) => cb.value);
  // Single-option checkbox (e.g. "I agree") collapses to a boolean, matching
  // events-form.js's constructPayload post-processing.
  return checkboxes.length === 1 ? checked.length > 0 : checked;
}

function readFieldValue(wrapper, type) {
  switch (type) {
    case 'checkbox':
    case 'checkbox-group':
      return readCheckboxGroupValue(wrapper);
    case 'radio-group': {
      const control = wrapper.querySelector('sp-radio-group, .rsvp-form-radio-group');
      return control?.value || '';
    }
    case 'multi-select': {
      const control = wrapper.querySelector('sp-combobox, .rsvp-form-combobox');
      if (!control) return [];
      if (Array.isArray(control.values)) return [...control.values];
      return control.value ? [control.value] : [];
    }
    case 'select': {
      const control = wrapper.querySelector('sp-picker');
      return control?.value || '';
    }
    default: {
      const control = wrapper.querySelector('sp-textfield');
      return control?.value ?? '';
    }
  }
}

/**
 * Builds the submit payload by reading each field-wrapper's control
 * properties directly (`.value`/`.values`/`.checked`), since sp-* controls
 * are not native form elements and don't appear in `form.elements` — the
 * approach events-form.js's constructPayload relies on.
 * @param {HTMLElement} themeHost - the `<sp-theme>` element containing the form fields
 */
export function constructPayload(themeHost) {
  const payload = {};
  themeHost.querySelectorAll('[data-field-id]').forEach((wrapper) => {
    const { type, fieldId } = wrapper.dataset;
    if (NON_PAYLOAD_TYPES.has(type) || NON_PAYLOAD_FIELD_IDS.has(fieldId)) return;
    payload[fieldId] = readFieldValue(wrapper, type);
  });
  return payload;
}
