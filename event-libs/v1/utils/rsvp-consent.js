import { getMetadata } from './utils.js';

const CHANNEL_ORDER = ['email', 'phone'];

/**
 * Resolves implicit-consent authoring: fragment meta, consent query-index row, then page meta.
 * @param {HTMLElement | null} termsWrapper - `.terms-and-conditions-wrapper`
 * @param {Record<string, unknown>} consentData - Row from consent query index
 * @returns {string} Raw string for {@link parseImplicitConsentChannels}, or empty string
 */
export function getImplicitConsentRaw(termsWrapper, consentData) {
  const fromFrag = termsWrapper?.querySelector('meta[name="implicit-consent"]')?.content;
  if (fromFrag != null && String(fromFrag).trim()) return String(fromFrag).trim();
  const fromIndex = consentData?.implicitConsent ?? consentData?.implicit_consent;
  if (fromIndex != null && String(fromIndex).trim()) return String(fromIndex).trim();
  const fromPage = getMetadata('implicit-consent', document);
  if (fromPage != null && String(fromPage).trim()) return String(fromPage).trim();
  return '';
}
const ALLOWED = new Set(CHANNEL_ORDER);

/**
 * Parses authored implicit-consent metadata into ESL contactMethods channel tokens.
 * @param {string} [raw] - e.g. "email, phone", "email", "phone"
 * @returns {string[]} Deduplicated channels in stable order (email, then phone).
 */
export function parseImplicitConsentChannels(raw) {
  if (raw == null || typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(/[,;]+/u)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const seen = new Set();
  parts.forEach((p) => {
    if (ALLOWED.has(p)) seen.add(p);
  });

  return CHANNEL_ORDER.filter((c) => seen.has(c));
}

/**
 * When the consent region has no checkboxes, fills payload.contactMethods from
 * implicit-consent metadata (fragment dataset or page meta).
 * @param {HTMLFormElement} form - RSVP form
 * @param {Record<string, unknown>} payload - constructPayload result (mutated)
 */
export function applyImplicitContactMethodsToPayload(form, payload) {
  const cmWrapper = form.querySelector('[data-field-id="contactMethods"]');
  if (!cmWrapper) return;
  if (cmWrapper.querySelector('input[type="checkbox"]')) return;

  const existing = payload.contactMethods;
  if (Array.isArray(existing) && existing.length > 0) return;

  let raw = '';
  try {
    const termsWrapper = form.querySelector('.terms-and-conditions-wrapper');
    const fromDataset = termsWrapper?.dataset?.implicitConsent;
    if (fromDataset != null && String(fromDataset).trim()) {
      raw = String(fromDataset).trim();
    } else {
      const fromPage = getMetadata('implicit-consent', document);
      if (fromPage != null && String(fromPage).trim()) {
        raw = String(fromPage).trim();
      }
    }
  } catch (e) {
    window.lana?.log(`implicit consent read failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  const channels = parseImplicitConsentChannels(raw);
  if (channels.length) {
    payload.contactMethods = channels;
  }
}
