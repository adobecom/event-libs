import { createTag } from '../../utils/utils.js';
import { dictionaryManager } from '../../utils/dictionary-manager.js';
import { PHONE_FIELD_RE, PHONE_PATTERN } from '../../utils/constances.js';
import { hasNativeRadio } from './spectrum.js';
import { createRadioGroup, createCombobox } from './handroll-fallback.js';

function t(key) {
  return dictionaryManager.getValue(key, 'rsvp-fields');
}

/** `label::value` syntax mirrors events-form.js's createCheckItem option parsing. */
function parseOption(raw) {
  const [customLabel, customVal] = raw.split('::');
  return { label: customLabel || raw, value: customVal || raw };
}

function splitOptions(options) {
  return (options || '').split(';').map((o) => o.trim()).filter(Boolean).map(parseOption);
}

const NO_LABEL_TYPES = new Set(['heading', 'legal', 'divider', 'submit', 'clear']);

function createFieldLabel({ field, label }) {
  if (!label) return null;
  return createTag('sp-field-label', { for: field }, t(label));
}

function createTextField({
  field, type, placeholder, required, defval, pattern, limit,
}) {
  const isPhoneField = type === 'tel' || type === 'phone'
    || (type !== 'text' && typeof field === 'string' && PHONE_FIELD_RE.test(field));
  const attrs = { id: field, name: field, placeholder: placeholder ? t(placeholder) : '' };
  if (defval) attrs.value = defval;
  if (isPhoneField) {
    attrs.type = 'tel';
    attrs.pattern = pattern || PHONE_PATTERN;
  } else if (type === 'email') {
    attrs.type = 'email';
  }
  if (limit != null) attrs.maxlength = limit;
  if (required === 'x') attrs.required = '';
  return createTag('sp-textfield', attrs);
}

function createTextAreaField({ field, placeholder, required, defval, limit }) {
  const attrs = { id: field, name: field, multiline: '', placeholder: placeholder ? t(placeholder) : '' };
  if (defval) attrs.value = defval;
  if (limit != null) attrs.maxlength = limit;
  if (required === 'x') attrs.required = '';
  return createTag('sp-textfield', attrs);
}

function createPickerField({ field, placeholder, options, defval, required }) {
  const attrs = { id: field, label: placeholder ? t(placeholder) : '' };
  if (required === 'x') attrs.required = '';
  const picker = createTag('sp-picker', attrs);
  splitOptions(options).forEach(({ label, value }) => {
    picker.append(createTag('sp-menu-item', { value }, t(label)));
    if (defval === value) picker.value = value;
  });
  return picker;
}

// sp-combobox (Spectrum Web Components 1.7.0) is single-select only, so
// there's no native replacement to feature-detect toward here — unlike
// radio-group, this fallback isn't a stop-gap for a missing Milo build;
// it's the only control that actually supports multi-select.
function createMultiSelectField(fd) {
  return createCombobox({ ...fd, multiple: true });
}

function createRadioGroupField(fd) {
  const { field, options, defval, required } = fd;
  if (hasNativeRadio()) {
    const attrs = { id: field };
    if (required === 'x') attrs.required = '';
    const group = createTag('sp-radio-group', attrs);
    splitOptions(options).forEach(({ label, value }) => {
      const radio = createTag('sp-radio', { value }, t(label));
      if (defval === value) radio.checked = true;
      group.append(radio);
    });
    return group;
  }
  return createRadioGroup(fd);
}

/** Single-option checkbox groups collapse to a boolean payload (see payload.js). */
function createCheckboxGroupField({ field, options, defval }) {
  const wrapper = createTag('div', { id: field, class: 'rsvp-form-checkbox-group' });
  const defList = splitOptions(defval).map((o) => o.value);
  splitOptions(options).forEach(({ label, value }) => {
    const checkbox = createTag('sp-checkbox', { value, name: field }, t(label));
    if (defList.includes(value)) checkbox.checked = true;
    wrapper.append(checkbox);
  });
  return wrapper;
}

function createHeadingField({ label }) {
  return createTag('h3', {}, t(label));
}

function createLegalField({ label }) {
  return createTag('p', {}, t(label));
}

function createDividerField() {
  return createTag('sp-divider', { size: 's' });
}

function createButtonField({ type, label }) {
  return createTag('sp-button', {
    type: 'button',
    variant: type === 'clear' ? 'secondary' : 'accent',
    'data-action': type,
  }, t(label));
}

const FIELD_BUILDERS = {
  text: createTextField,
  email: createTextField,
  tel: createTextField,
  phone: createTextField,
  'text-area': createTextAreaField,
  select: createPickerField,
  'multi-select': createMultiSelectField,
  'radio-group': createRadioGroupField,
  checkbox: createCheckboxGroupField,
  'checkbox-group': createCheckboxGroupField,
  heading: createHeadingField,
  legal: createLegalField,
  divider: createDividerField,
  submit: createButtonField,
  clear: createButtonField,
};

/**
 * Builds a `.field-wrapper` div for one resolved field-config entry: label
 * (when applicable) + the Spectrum 2 (or hand-rolled fallback) control.
 * `data-field-id`/`data-type`/`data-required` live on this wrapper — every
 * other module (payload.js, rules.js, submit.js's validateForm) reads state
 * through it instead of walking `form.elements`, since sp-* controls don't
 * participate in native HTML form semantics.
 */
export function buildField(fd) {
  const builder = FIELD_BUILDERS[fd.type] || createTextField;
  const wrapper = createTag('div', {
    class: `field-wrapper rsvp-form-${fd.type}-wrapper`,
    'data-field-id': fd.field,
    'data-type': fd.type,
  });
  if (fd.required === 'x') wrapper.dataset.required = 'x';
  if (!NO_LABEL_TYPES.has(fd.type)) {
    const label = createFieldLabel(fd);
    if (label) wrapper.append(label);
  }
  wrapper.append(builder(fd));
  return wrapper;
}
