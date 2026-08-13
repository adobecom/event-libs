/*
 * Disclaimer / CC / Legal Info Slots (MWPW-203467) — sub-feature of session-details.
 * Three verbatim text slots from custom-attributes, each rendered only when its
 * attribute is populated:
 *   - GDPR/IPOD copy      -> near the top, under the title
 *   - Closed Caption info  -> under the title (state gating handled by the shell)
 *   - Legal Disclaimer     -> end of the abstract, under the tags
 *
 * State gating (e.g. CC hidden in the IPOD state) is owned by the state engine
 * (MWPW-203474); here each slot renders based on data presence.
 */
import { createTag } from '../../../utils/utils.js';
import { getAttrText } from '../../utils/custom-attributes.js';

const CC_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M14 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1ZM7 9.2A2 2 0 1 1 7 6.8l-1 .58a1 1 0 1 0 0 1.24l1 .58Zm5 0a2 2 0 1 1 0-2.4l-1 .58a1 1 0 1 0 0 1.24l1 .58Z"/></svg>';

export function renderGdprCopy(doc = document) {
  const text = getAttrText('IPOD or GDPR Copy', doc);
  if (!text) return null;
  return createTag('p', { class: 'session-gdpr-copy' }, text);
}

export function renderClosedCaption(doc = document) {
  const text = getAttrText('Closed Caption Information', doc);
  if (!text) return null;
  const el = createTag('p', { class: 'session-closed-caption' });
  const icon = createTag('span', { class: 'session-cc-icon' });
  icon.innerHTML = CC_ICON;
  el.append(icon, createTag('span', { class: 'session-cc-text' }, text));
  return el;
}

export function renderLegalDisclaimer(doc = document) {
  const text = getAttrText('Legal Disclaimer', doc);
  if (!text) return null;
  return createTag('p', { class: 'session-legal-disclaimer' }, text);
}
