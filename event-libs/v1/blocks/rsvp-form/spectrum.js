import { createTag } from '../../utils/utils.js';
import { miloLibs } from './milo-bridge.js';

const SWC_DIST = `${miloLibs}/features/spectrum-web-components/dist`;
const LIT_URL = `${miloLibs}/deps/lit-all.min.js`;

// Core modules every rsvp-form needs regardless of which fields are configured.
const CORE_MODULES = ['theme', 'field-label', 'help-text', 'button', 'divider'];

// Field-type -> extra dist module(s) to load, beyond CORE_MODULES.
const FIELD_MODULE_MAP = {
  text: ['textfield'],
  email: ['textfield'],
  tel: ['textfield'],
  phone: ['textfield'],
  'text-area': ['textfield'],
  select: ['picker', 'menu'],
  'multi-select': ['combobox'],
  'radio-group': ['radio'],
  checkbox: ['checkbox'],
  'checkbox-group': ['checkbox'],
};

const importCache = new Map();
function importOnce(url) {
  if (!importCache.has(url)) importCache.set(url, import(url));
  return importCache.get(url);
}

let nativeRadioAvailable = false;
let nativeComboboxAvailable = false;

/**
 * Milo's spectrum-web-components build has no radio/combobox entry points yet
 * (a follow-up milo PR adds them). Attempt the import; if it 404s or the
 * custom element never registers, the caller falls back to
 * `handroll-fallback.js`. Non-throwing by design — a missing module must not
 * break the rest of the form.
 */
async function tryImportControl(moduleName, tagName) {
  try {
    await importOnce(`${SWC_DIST}/${moduleName}.js`);
    return !!customElements.get(tagName);
  } catch (error) {
    window.lana?.log(`rsvp-form: ${moduleName}.js unavailable, using hand-rolled fallback for ${tagName}: ${error?.message || error}`);
    return false;
  }
}

/**
 * Loads Lit + the theme + whichever Spectrum 2 dist modules the resolved
 * field set needs, deduping/caching imports so repeat calls are free. Must be
 * awaited before building any sp-* control.
 * @param {string[]} fieldTypes - resolved field `type` values from config.js
 */
export async function loadSwc(fieldTypes = []) {
  await importOnce(LIT_URL);

  const modules = new Set(CORE_MODULES);
  fieldTypes.forEach((type) => (FIELD_MODULE_MAP[type] || []).forEach((m) => modules.add(m)));

  const needsRadio = modules.delete('radio');
  const needsCombobox = modules.delete('combobox');

  await Promise.all([...modules].map((m) => importOnce(`${SWC_DIST}/${m}.js`)));

  if (needsRadio) nativeRadioAvailable = await tryImportControl('radio', 'sp-radio-group');
  if (needsCombobox) nativeComboboxAvailable = await tryImportControl('combobox', 'sp-combobox');
}

export function hasNativeRadio() {
  return nativeRadioAvailable;
}

export function hasNativeCombobox() {
  return nativeComboboxAvailable;
}

/**
 * Creates the `<sp-theme system="spectrum-two">` host every sp-* control in
 * this block renders under.
 */
export function createThemeHost(attrs = {}) {
  return createTag('sp-theme', { system: 'spectrum-two', color: 'light', scale: 'medium', ...attrs });
}
