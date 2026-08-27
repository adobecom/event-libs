/*
 * Custom Attributes Helper (MWPW-203465)
 * Shared util for the Session Details Page C2 blocks. Reads the RF-synced
 * `custom-attributes` JSON (and other JSON-valued metadata) from the page's
 * <meta> tags and extracts values by attribute name.
 *
 * At runtime getMetadata() returns the DOM-decoded meta content, so HTML
 * entities are already resolved (e.g. "Keynotes & Sneaks") — no manual
 * decoding is needed here, matching the JSON.parse(getMetadata(...)) pattern
 * used across the existing event blocks.
 *
 * custom-attributes entry shape:
 *   { attributeId, name, label, inputType, enabled, resources,
 *     values: [{ label, value, valueId }] }
 *   - single-select / text -> values[0]
 *   - multi-select         -> values[]
 */
import { getMetadata } from '../../utils/utils.js';

/**
 * Safe-parse a JSON-valued metadata key.
 * @returns parsed value, or `fallback` when the key is missing/unparseable.
 */
export function getJsonMetadata(name, fallback = null, doc = document) {
  const raw = getMetadata(name, doc);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    window.lana?.log(`[custom-attributes] failed to parse metadata "${name}": ${e.message}`);
    return fallback;
  }
}

/** All enabled `custom-attributes` entries (empty array when none). */
export function getCustomAttributes(doc = document) {
  const attrs = getJsonMetadata('custom-attributes', [], doc);
  return Array.isArray(attrs) ? attrs.filter((a) => a && a.enabled !== false) : [];
}

/** One enabled attribute entry by its RF `name` (case-insensitive), or null. */
export function getCustomAttribute(name, doc = document) {
  if (!name) return null;
  const target = name.toLowerCase();
  return getCustomAttributes(doc).find((a) => (a.name || '').toLowerCase() === target) || null;
}

/**
 * All `{ label, value }` pairs for an attribute (multi-select), or [] when the
 * attribute is absent/disabled. `label` is the display text, `value` the key.
 */
export function getAttrValues(name, doc = document) {
  const attr = getCustomAttribute(name, doc);
  if (!attr || !Array.isArray(attr.values)) return [];
  return attr.values
    .filter((v) => v && (v.label != null || v.value != null))
    .map((v) => ({ label: v.label ?? '', value: v.value ?? '' }));
}

/** First value's display `label` — single-select convenience. '' when absent. */
export function getAttrLabel(name, doc = document) {
  return getAttrValues(name, doc)[0]?.label ?? '';
}

/** First value's raw `value` — text/link inputType convenience. '' when absent. */
export function getAttrText(name, doc = document) {
  return getAttrValues(name, doc)[0]?.value ?? '';
}
