import { createTag } from '../../utils/utils.js';
import { dictionaryManager } from '../../utils/dictionary-manager.js';

/**
 * Hand-rolled radio-group and multi-select combobox, styled with Spectrum 2
 * tokens to match the sp-* controls this block otherwise uses. Milo's
 * spectrum-web-components build doesn't ship `sp-radio-group`/`sp-combobox`
 * yet; `spectrum.js` falls back here until a follow-up milo PR adds them.
 *
 * Retirement path: once that PR lands, delete this file and swap the two
 * `fields.js` call sites (`createRadioGroupField`/`createMultiSelectField`)
 * to always use the native components — no other module changes, because
 * both controls below duck-type the same surface real sp-* controls expose:
 * `.value` / `.values`, `.checkValidity()`, `.invalid`, and a `change` event.
 */

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

function dispatchChange(el) {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * @param {{ field: string, options: string, defval: string }} fd
 * @returns {HTMLElement} wrapper exposing `.value` (string), `.checkValidity()`, `.invalid`
 */
export function createRadioGroup({ field, options, defval }) {
  const wrapper = createTag('div', { class: 'rsvp-form-radio-group', role: 'radiogroup' });

  splitOptions(options).forEach(({ label, value }) => {
    const id = `${field}-${value.toLowerCase().replaceAll(' ', '-')}`;
    const input = createTag('input', {
      type: 'radio', name: field, value, id, class: 'rsvp-form-radio-input',
    });
    if (defval === value) input.checked = true;
    const marker = createTag('span', { class: 'rsvp-form-radio-marker' });
    const itemLabel = createTag('label', { for: id, class: 'rsvp-form-radio-label' }, t(label));
    wrapper.append(createTag('div', { class: 'rsvp-form-radio-item' }, [input, marker, itemLabel]));
  });

  Object.defineProperty(wrapper, 'value', {
    get() { return wrapper.querySelector('input:checked')?.value || ''; },
    set(val) {
      const target = wrapper.querySelector(`input[value="${val}"]`);
      if (target) target.checked = true;
    },
  });

  let invalid = false;
  Object.defineProperty(wrapper, 'invalid', {
    get() { return invalid; },
    set(val) { invalid = !!val; wrapper.classList.toggle('is-invalid', invalid); },
  });

  wrapper.checkValidity = () => true; // emptiness is enforced by validateForm via `required`
  wrapper.addEventListener('change', (e) => {
    if (e.target.matches('input[type="radio"]')) dispatchChange(wrapper);
  });

  return wrapper;
}

/**
 * @param {{ field: string, options: string, placeholder: string, defval: string, multiple: boolean }} fd
 * @returns {HTMLElement} wrapper exposing `.values` (array), `.value` (first value),
 *   `.checkValidity()`, `.invalid`
 */
export function createCombobox({
  options, placeholder, defval, multiple = true,
}) {
  const wrapper = createTag('div', { class: 'rsvp-form-combobox', 'data-multiple': multiple });
  const trigger = createTag('button', { type: 'button', class: 'rsvp-form-combobox-trigger', 'aria-haspopup': 'listbox' });
  const triggerText = createTag('span', { class: 'rsvp-form-combobox-trigger-text' });
  const listbox = createTag('ul', { class: 'rsvp-form-combobox-listbox hidden', role: 'listbox' });
  trigger.append(triggerText);

  const placeholderText = placeholder ? t(placeholder) : '-';
  const defaults = new Set(splitOptions(defval).map((o) => o.value));
  const selected = new Set();

  const syncUI = () => {
    triggerText.textContent = selected.size ? [...selected].join(', ') : placeholderText;
    listbox.querySelectorAll('li').forEach((li) => {
      li.setAttribute('aria-selected', selected.has(li.dataset.value) ? 'true' : 'false');
    });
  };

  splitOptions(options).forEach(({ label, value }) => {
    if (defaults.has(value)) selected.add(value);
    const li = createTag('li', { role: 'option', 'data-value': value, tabindex: '0' }, t(label));
    li.addEventListener('click', () => {
      if (multiple) {
        if (selected.has(value)) selected.delete(value);
        else selected.add(value);
      } else {
        selected.clear();
        selected.add(value);
        listbox.classList.add('hidden');
      }
      syncUI();
      dispatchChange(wrapper);
    });
    listbox.append(li);
  });

  trigger.addEventListener('click', () => listbox.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) listbox.classList.add('hidden');
  });

  wrapper.append(trigger, listbox);
  syncUI();

  Object.defineProperty(wrapper, 'values', {
    get() { return [...selected]; },
    set(vals) { selected.clear(); (vals || []).forEach((v) => selected.add(v)); syncUI(); },
  });
  Object.defineProperty(wrapper, 'value', {
    get() { return [...selected][0] || ''; },
    set(val) { selected.clear(); if (val) selected.add(val); syncUI(); },
  });

  let invalid = false;
  Object.defineProperty(wrapper, 'invalid', {
    get() { return invalid; },
    set(val) { invalid = !!val; wrapper.classList.toggle('is-invalid', invalid); },
  });

  wrapper.checkValidity = () => true;

  return wrapper;
}
