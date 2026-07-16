import { constructPayload } from './payload.js';

const RULE_OPERATORS = {
  equal: '=',
  notEqual: '!=',
  lessThan: '<',
  lessThanOrEqual: '<=',
  greaterThan: '>',
  greaterThanOrEqual: '>=',
  includes: 'inc',
  excludes: 'exc',
};

function processNumRule(tf, operator, a, b) {
  if (!tf?.dataset.type?.match(/(?:number|date)/)) {
    throw new Error(`Comparison field must be of type number or date for ${operator} rules`);
  }
  const { type } = tf.dataset;
  const a2 = type === 'number' ? parseInt(a, 10) : Date.parse(a);
  const b2 = type === 'number' ? parseInt(b, 10) : Date.parse(b);
  return [a2, b2];
}

function processRule(tf, operator, payloadKey, value, comparisonFunction) {
  if (payloadKey === '') return true;
  try {
    const [a, b] = processNumRule(tf, operator, payloadKey, value);
    return comparisonFunction(a, b);
  } catch (e) {
    window.lana?.log(`rsvp-form: invalid rule, ${e}`);
    return false;
  }
}

/**
 * Applies conditional show/hide/require rules to field wrappers, based on the
 * current form payload. Ported from events-form.js's applyRules.
 * @param {HTMLElement} themeHost
 * @param {{ fieldId: string, rule: object }[]} rules
 */
export function applyRules(themeHost, rules) {
  const payload = constructPayload(themeHost);
  rules.forEach(({ fieldId, rule }) => {
    const { type, condition: { key, operator, value } } = rule;
    const fw = themeHost.querySelector(`[data-field-id="${fieldId}"]`);
    const tf = themeHost.querySelector(`[data-field-id="${key}"]`);
    if (!fw) return;

    let force = false;
    switch (operator) {
      case RULE_OPERATORS.equal:
        force = (payload[key] === value);
        break;
      case RULE_OPERATORS.notEqual:
        force = (payload[key] !== value);
        break;
      case RULE_OPERATORS.includes:
        if (typeof payload[key] === 'boolean') force = payload[key] === true;
        else if (Array.isArray(payload[key])) force = payload[key].includes(value);
        else if (typeof payload[key] === 'string') force = payload[key].split(';').map((s) => s.trim()).includes(value);
        break;
      case RULE_OPERATORS.excludes:
        if (typeof payload[key] === 'boolean') force = payload[key] === false;
        else if (Array.isArray(payload[key])) force = !payload[key].includes(value);
        else if (typeof payload[key] === 'string') force = !payload[key].split(';').map((s) => s.trim()).includes(value);
        break;
      case RULE_OPERATORS.lessThan:
        force = processRule(tf, operator, payload[key], value, (a, b) => a < b);
        break;
      case RULE_OPERATORS.lessThanOrEqual:
        force = processRule(tf, operator, payload[key], value, (a, b) => a <= b);
        break;
      case RULE_OPERATORS.greaterThan:
        force = processRule(tf, operator, payload[key], value, (a, b) => a > b);
        break;
      case RULE_OPERATORS.greaterThanOrEqual:
        force = processRule(tf, operator, payload[key], value, (a, b) => a >= b);
        break;
      default:
        window.lana?.log(`rsvp-form: unsupported rule operator ${operator}`);
        return;
    }
    fw.classList.toggle(type, force);
  });
}
