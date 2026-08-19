/*
 * Session Details / Overview (MWPW-203474 + MWPW-200288 state engine)
 * Top white card of the Session Details Page. Reads RF metadata once, owns the
 * time-driven Pre-Live / Live / On-Demand state, and mounts the sub-features in
 * mobile stack order:
 *   eyebrow (track-tags + status) -> title -> gdpr/ipod copy -> closed caption ->
 *   [primary CTA + favorite + share] -> description-clamp -> quick-facts -> legal
 * Sub-features: MWPW-203475 / 203470 / 203468 / 203467 / 203472 / 200288
 */
import { createTag, getMetadata } from '../../../utils/utils.js';
import { initTierOneEventConfig } from '../../../utils/tier-1-event-config.js';
import { applySectionColumnsLayout } from '../../../utils/decorate.js';
import { renderTrackTags } from './track-tags.js';
import { renderGdprCopy, renderClosedCaption, renderLegalDisclaimer } from './disclaimer-cc-legal.js';
import { renderDescriptionClamp } from './description-clamp.js';
import { renderQuickFacts } from './quick-facts.js';
import { renderShare } from './share.js';
import { renderFavorite } from './favorite.js';
import { mountSessionState } from './session-state-view.js';

export default async function init(el) {
  el.replaceChildren();

  // TEMP (demo only — must not ship): applies the opt-in `section-layout: columns`
  // layout. It lives here because the page's entry scripts.js is served from the
  // deployed origin (?eventlibs=local doesn't swap it) and decorateArea() runs
  // before the metadata block reaches <head>. This block's init runs during
  // loadArea, so the metadata is readable. No-op unless authored. The production
  // home is the consuming site's decorateArea (da-events#52).
  applySectionColumnsLayout();

  // Ensure the Tier 1 Event Configurator config is loaded before any sub-feature
  // reads it (getTrackIcon). Idempotent — no-ops if decorateEvent already ran it.
  initTierOneEventConfig();

  // Eyebrow — track tags + a state-driven status (date/time | Live | On-demand).
  const eyebrow = createTag('div', { class: 'session-eyebrow' });
  const trackTags = renderTrackTags();
  if (trackTags) eyebrow.append(trackTags);
  // Persistent live region: the status changes on a timer at the session's
  // start/end boundary, not from a user action, so the swap has to be announced.
  const statusSlot = createTag('span', {
    class: 'session-status-slot', role: 'status', 'aria-live': 'polite',
  });
  eyebrow.append(statusSlot);
  el.append(eyebrow);

  // Session title.
  const title = getMetadata('title') || getMetadata('en-title');
  if (title) el.append(createTag('h1', { class: 'session-title' }, title));

  // Supporting copy under the title. Closed caption is state-gated (On-Demand
  // only) by the controller below — render it, then let mountSessionState toggle.
  const gdpr = renderGdprCopy();
  if (gdpr) el.append(gdpr);
  const closedCaption = renderClosedCaption();
  if (closedCaption) el.append(closedCaption);

  // Action row: [ state-driven primary CTA ] favorite · share. The primary CTA
  // (Add to schedule / Watch now / none) is filled by the state controller.
  const primaryCtaSlot = createTag('span', { class: 'session-primary-cta' });
  const favorite = renderFavorite();
  const share = renderShare();
  const actions = createTag('div', { class: 'session-actions' });
  actions.append(primaryCtaSlot);
  if (favorite) actions.append(favorite);
  if (share) actions.append(share);
  el.append(actions);

  // Wire the time-driven state: eyebrow status, primary CTA, CC visibility.
  mountSessionState({ statusSlot, primaryCtaSlot, ccEl: closedCaption });

  // Abstract: description -> quick-fact tags -> legal disclaimer.
  const description = renderDescriptionClamp();
  if (description) el.append(description);
  const quickFacts = renderQuickFacts();
  if (quickFacts) el.append(quickFacts);
  const legal = renderLegalDisclaimer();
  if (legal) el.append(legal);
}
