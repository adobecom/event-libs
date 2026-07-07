export function parseRsvpFieldLimit(raw) {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number') {
    const n = Math.trunc(raw);
    if (Number.isFinite(n) && n >= 1) return n;
    window.lana?.log('events-form: limit must be a positive integer');
    return undefined;
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return undefined;
    if (!/^\d+$/.test(s)) {
      window.lana?.log('events-form: limit must be a positive integer (digits only)');
      return undefined;
    }
    return parseInt(s, 10);
  }
  window.lana?.log('events-form: limit must be a positive integer');
  return undefined;
}

// Uses the browser's HTML parser so malformed/nested tags are handled correctly.
export function stripTags(value) {
  if (!value) return value;
  const div = document.createElement('div');
  div.innerHTML = value;
  return div.textContent ?? '';
}
