import { getMetadata } from '../../utils/utils.js';
import { parseRsvpFieldLimit } from '../../utils/sanitize-utils.js';

/** Valid `displayAs` flavors for the `text` substrate; each is also a valid
 * native `<input type>` (or `text-area`, handled by its own dispatch entry). */
const TEXT_DISPLAY_AS = new Set(['text', 'email', 'phone', 'number', 'date', 'url', 'text-area']);

function lowercaseKeys(obj) {
  return Object.keys(obj).reduce((acc, key) => {
    acc[key.toLowerCase() === 'default' ? 'defval' : key.toLowerCase()] = obj[key];
    return acc;
  }, {});
}

/**
 * Resolves the RSVP form field list from the enriched `rsvp-config` page
 * metadata. This is the ONLY config source rsvp-form supports — unlike
 * events-form.js, there is no legacy per-cloud hosted JSON fallback and no
 * `rsvp-form-fields` allow-list filter. Ported from events-form.js's
 * `getRsvpConfigFromMeta`.
 * @returns {{ fields: object[] } | null}
 */
export function resolveRsvpConfig() {
  const raw = getMetadata('rsvp-config');
  if (!raw) return null;

  try {
    const config = JSON.parse(raw);
    if (!config.rsvpFormFields?.length) return null;

    const fields = config.rsvpFormFields.map((f) => {
      const field = lowercaseKeys(f);
      if (typeof field.field === 'string') field.field = field.field.trim();
      field.type = field.type || 'text';
      field.required = field.required === true ? 'x' : '';
      field.limit = parseRsvpFieldLimit(field.limit);
      if (Array.isArray(field.options)) {
        field.options = field.options.map((o) => (typeof o === 'object' ? o.value : o)).join(';');
      }

      // ESP's field `type` names only the substrate (text/select/multi-select);
      // `displayas` (EMC's displayAs) picks the concrete widget within it.
      // Remap to the internal dispatch types this block implements. Any other
      // `type` (heading/legal/divider/submit/clear, or a legacy direct value
      // like `email`/`checkbox` from before this taxonomy) passes through
      // untouched.
      const da = field.displayas;
      if (field.type === 'text') {
        field.type = TEXT_DISPLAY_AS.has(da) ? da : 'text';
      }
      else if (field.type === 'select') {
        field.type = da === 'radio' ? 'radio-group' : 'select';
      }
      else if (field.type === 'multi-select') {
        field.type = da === 'combobox' ? 'multi-select' : 'checkbox-group';
      }
      else if (field.type === 'checkbox') {
        // Legacy wire value from before the substrate/displayAs taxonomy.
        field.type = da === 'dropdown' ? 'multi-select' : 'checkbox-group';
      }
      return field;
    });

    if (!fields.some((f) => f.type === 'submit')) {
      fields.push({ field: 'Submit', type: 'submit', label: 'Submit', required: '', options: '' });
    }

    return { fields };
  } catch (error) {
    window.lana?.log(`rsvp-form: failed to parse rsvp-config metadata: ${JSON.stringify(error)}`);
    return null;
  }
}
