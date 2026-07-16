import { getMetadata } from '../../utils/utils.js';
import { parseRsvpFieldLimit } from '../../utils/sanitize-utils.js';

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

      // ESP's field type enum has no dedicated multi-select value — `select` is
      // single-choice and `checkbox` is multi-choice. `displayas` (EMC's
      // displayAs) carries the render-style hint; remap to the widget types
      // this block implements.
      if (field.type === 'select' && field.displayas === 'radio') field.type = 'radio-group';
      if (field.type === 'checkbox' && field.displayas === 'dropdown') field.type = 'multi-select';
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
