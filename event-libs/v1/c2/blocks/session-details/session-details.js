/*
 * Session Details / Overview (MWPW-203474)
 * Top white card of the Session Details Page. Reads RF metadata once, owns
 * time-driven state (chrono-box), CTA + favorite wiring, and mounts the
 * sub-features in mobile stack order:
 *   track-tags -> title -> gdpr/ipod copy -> closed caption -> [CTAs] ->
 *   description-clamp -> quick-facts -> legal disclaimer
 * Sub-features: MWPW-203475 / 203470 / 203468 / 203467 / 203472
 *
 * NOTE: date/time eyebrow, CTA row (Add to schedule -> Watch now), favorite and
 * share, and per-state gating are added with the state engine. Built top-down.
 */
import { createTag, getMetadata } from '../../../utils/utils.js';
import { initTierOneEventConfig } from '../../../utils/tier-1-event-config.js';
import { renderTrackTags } from './track-tags.js';
import { renderGdprCopy, renderClosedCaption, renderLegalDisclaimer } from './disclaimer-cc-legal.js';
import { renderDescriptionClamp } from './description-clamp.js';
import { renderQuickFacts } from './quick-facts.js';
import { renderShare } from './share.js';
import { renderFavorite } from './favorite.js';

export default async function init(el) {
  el.replaceChildren();

  // Ensure the Tier 1 Event Configurator config is loaded before any sub-feature
  // reads it (getTrackIcon). Idempotent — no-ops if decorateEvent already ran it.
  initTierOneEventConfig();

  // Eyebrow — track tags (date/time-or-status added with the state engine).
  const trackTags = renderTrackTags();
  if (trackTags) el.append(trackTags);

  // Session title.
  const title = getMetadata('title') || getMetadata('en-title');
  if (title) el.append(createTag('h1', { class: 'session-title' }, title));

  // Supporting copy under the title.
  const gdpr = renderGdprCopy();
  if (gdpr) el.append(gdpr);
  const closedCaption = renderClosedCaption();
  if (closedCaption) el.append(closedCaption);

  // Action row: favorite + share (persistent across all states). The state
  // engine prepends the primary CTA (Watch now / Add to schedule) here as the
  // leading item.
  const favorite = renderFavorite();
  const share = renderShare();
  if (favorite || share) {
    const actions = createTag('div', { class: 'session-actions' });
    if (favorite) actions.append(favorite);
    if (share) actions.append(share);
    el.append(actions);
  }

  // Abstract: description -> quick-fact tags -> legal disclaimer.
  const description = renderDescriptionClamp();
  if (description) el.append(description);
  const quickFacts = renderQuickFacts();
  if (quickFacts) el.append(quickFacts);
  const legal = renderLegalDisclaimer();
  if (legal) el.append(legal);
}
