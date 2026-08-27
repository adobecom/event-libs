import { createTag } from '../../../utils/utils.js';
import { getAttrLabel, getAttrText, getAttrValues } from '../../utils/custom-attributes.js';
import { getTrackIcon, getOverrideTrackIcon, DEFAULT_ICON_COLOR } from '../../../utils/tier-1-event-config.js';
import { resolveIcon } from '../../../features/icons/icon-resolver.js';

const STAR_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 1.2l1.98 4.02 4.44.64-3.21 3.13.76 4.42L8 11.34l-3.97 2.07.76-4.42L1.58 5.86l4.44-.64L8 1.2z"/></svg>';

async function paintTrackIcon(slot, iconName) {
  if (!iconName) return;
  try {
    const svg = await resolveIcon(iconName);
    if (!svg) return;
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    slot.replaceChildren(svg);
  } catch (err) {
    window.lana?.log(`[track-tags] icon "${iconName}" failed to resolve: ${err.message}`);
  }
}

export function renderTrackTags(doc = document) {
  const primaryLabel = getAttrLabel('Primary Event Site Track', doc);
  const overrideText = getAttrText('Override Primary Event Site Track', doc);
  const additional = getAttrValues('Additional Event Site Tracks', doc);

  const tags = [];
  if (overrideText) {
    tags.push({ label: overrideText, kind: 'override', star: !primaryLabel });
  } else if (primaryLabel) {
    tags.push({ label: primaryLabel, kind: 'primary' });
  }
  additional.forEach(({ label }) => label && tags.push({ label, kind: 'additional' }));

  if (!tags.length) return null;

  const el = createTag('div', { class: 'track-tags' });
  tags.forEach(({ label, kind, star }) => {
    const tag = createTag('span', { class: `track-tag track-tag--${kind}` });
    const slot = createTag('span', { class: 'track-tag-icon' });
    const cfg = kind === 'override' ? getOverrideTrackIcon(label) : getTrackIcon(label);
    slot.style.color = cfg?.color || DEFAULT_ICON_COLOR;
    if (cfg?.icon) {
      paintTrackIcon(slot, cfg.icon);
    } else if (star) {
      slot.classList.add('track-tag-icon--star');
      slot.innerHTML = STAR_ICON;
    }
    tag.append(slot, createTag('span', { class: 'track-tag-label' }, label));
    el.append(tag);
  });
  return el;
}
