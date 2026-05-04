/**
 * Implicit RSVP consent: authored fragments may include
 * `<meta name="implicit-consent" content="email, phone">` (or "email", "phone")
 * when no contact-method checkboxes are rendered; values map to attendee consent fields.
 */

export const IMPLICIT_CONSENT_GRANTED = 'Y';

/**
 * @param {string} [content] - Comma-separated channels from meta content (email / phone).
 * @returns {{ email: boolean, phone: boolean }}
 */
export function parseImplicitConsentMetaContent(content) {
  const result = { email: false, phone: false };
  if (!content || typeof content !== 'string') return result;
  content.split(',').forEach((part) => {
    const token = part.trim().toLowerCase();
    if (token === 'email') result.email = true;
    if (token === 'phone') result.phone = true;
  });
  return result;
}

/**
 * When the consent fragment does not render contact-method checkboxes, record implicit
 * consent on the payload per `<meta name="implicit-consent">` (authoring).
 * Does not run when checkboxes are present (explicit consent path).
 *
 * @param {HTMLFormElement} form
 * @param {Record<string, unknown>} payload
 */
export function applyImplicitConsentToPayload(form, payload) {
  if (!form || !payload) return;

  const terms = form.querySelector('.terms-and-conditions-wrapper');
  const meta = terms?.querySelector('meta[name="implicit-consent"]')
    ?? form.querySelector('meta[name="implicit-consent"]');
  const raw = meta?.getAttribute('content')?.trim();
  if (!raw) return;

  const scope = terms ?? form;
  const hasContactMethodCheckboxes = scope.querySelector(
    'input[type="checkbox"][name="contactMethods"]',
  );
  if (hasContactMethodCheckboxes) return;

  const { email, phone } = parseImplicitConsentMetaContent(raw);
  if (email) payload.emailConsent = IMPLICIT_CONSENT_GRANTED;
  if (phone) payload.phoneConsent = IMPLICIT_CONSENT_GRANTED;
}
