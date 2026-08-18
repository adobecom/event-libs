import { createTag, getMetadata } from '../../../utils/utils.js';
import { initTierOneEventConfig } from '../../../utils/tier-1-event-config.js';
import { renderTrackTags } from './track-tags.js';
import { renderGdprCopy, renderClosedCaption, renderLegalDisclaimer } from './disclaimer-cc-legal.js';
import { renderDescriptionClamp } from './description-clamp.js';
import { renderQuickFacts } from './quick-facts.js';
import { renderShare } from './share.js';
import { renderFavorite } from './favorite.js';
import { mountSessionState } from './session-state-view.js';

export default async function init(el) {
  el.replaceChildren();

  initTierOneEventConfig();

  const eyebrow = createTag('div', { class: 'session-eyebrow' });
  const trackTags = renderTrackTags();
  if (trackTags) eyebrow.append(trackTags);
  const statusSlot = createTag('span', { class: 'session-status-slot' });
  eyebrow.append(statusSlot);
  el.append(eyebrow);

  const title = getMetadata('title') || getMetadata('en-title');
  if (title) el.append(createTag('h1', { class: 'session-title' }, title));

  const gdpr = renderGdprCopy();
  if (gdpr) el.append(gdpr);
  const closedCaption = renderClosedCaption();
  if (closedCaption) el.append(closedCaption);

  const primaryCtaSlot = createTag('span', { class: 'session-primary-cta' });
  const favorite = renderFavorite();
  const share = renderShare();
  const actions = createTag('div', { class: 'session-actions' });
  actions.append(primaryCtaSlot);
  if (favorite) actions.append(favorite);
  if (share) actions.append(share);
  el.append(actions);

  mountSessionState({ statusSlot, primaryCtaSlot, ccEl: closedCaption });

  const description = renderDescriptionClamp();
  if (description) el.append(description);
  const quickFacts = renderQuickFacts();
  if (quickFacts) el.append(quickFacts);
  const legal = renderLegalDisclaimer();
  if (legal) el.append(legal);
}
