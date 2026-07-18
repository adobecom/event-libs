import { createTag } from '../../utils/utils.js';
import { miloLibs } from './milo-bridge.js';

const SWC_DIST = `${miloLibs}/features/spectrum-web-components/dist`;
const LIT_URL = `${miloLibs}/deps/lit-all.min.js`;

// Core modules every rsvp-form needs regardless of which fields are configured.
// 'themes/spectrum-two' (rather than plain 'theme') registers sp-theme AND the
// spectrum-two system/color/scale token fragments the theme host below requests
// — Milo's plain theme.js only registers the classic spectrum system.
const CORE_MODULES = ['themes/spectrum-two', 'field-label', 'help-text', 'button', 'divider'];

// Field-type -> extra dist module(s) to load, beyond CORE_MODULES. multi-select
// has no entry: sp-combobox (SWC 1.7.0) is single-select only, so multi-select
// always uses the hand-rolled fallback — there's no native module to load.
const FIELD_MODULE_MAP = {
  text: ['textfield'],
  email: ['textfield'],
  tel: ['textfield'],
  phone: ['textfield'],
  'text-area': ['textfield'],
  select: ['picker', 'menu'],
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

/**
 * Milo's spectrum-web-components build has no radio entry point yet (a
 * follow-up milo PR adds it). Attempt the import; if it 404s or the custom
 * element never registers, the caller falls back to `handroll-fallback.js`.
 * Non-throwing by design — a missing module must not break the rest of the
 * form.
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
 * @param {string[]} fieldTypes - resolved field `type` values from config.js,
 *   plus 'select'/'checkbox' when the consent suite will render (it needs
 *   sp-picker/sp-menu-item/sp-checkbox independent of the configured fields)
 */
export async function loadSwc(fieldTypes = []) {
  await importOnce(LIT_URL);

  const modules = new Set(CORE_MODULES);
  fieldTypes.forEach((type) => (FIELD_MODULE_MAP[type] || []).forEach((m) => modules.add(m)));

  const needsRadio = modules.delete('radio');

  await Promise.all([...modules].map((m) => importOnce(`${SWC_DIST}/${m}.js`)));

  if (needsRadio) nativeRadioAvailable = await tryImportControl('radio', 'sp-radio-group');
}

export function hasNativeRadio() {
  return nativeRadioAvailable;
}

/**
 * Creates the `<sp-theme system="spectrum-two">` host every sp-* control in
 * this block renders under.
 */
export function createThemeHost(attrs = {}) {
  return createTag('sp-theme', { system: 'spectrum-two', color: 'light', scale: 'medium', ...attrs });
}
