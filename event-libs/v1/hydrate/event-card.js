import { META_REG } from '../utils/constances.js';
import { getMetadata } from '../utils/utils.js';

const SESSION_CODE_PATTERN = /^[a-z]{1,4}\d+$/i;
// event-card.js's own aspect-ratio variant classes (e.g. "ratio-3-4") can be authored
// alongside the hydrate classes on the same block — exclude them here too, or they'd
// get mistaken for the metadata-key class.
const RATIO_VARIANT_PATTERN = /^ratio-\d+-\d+$/;

function getMetadataKeyAndSessionCode(block) {
  let metadataKey;
  let sessionCode;
  [...block.classList].forEach((cls) => {
    if (cls === 'event-card' || cls === 'hydrate' || RATIO_VARIANT_PATTERN.test(cls)) return;
    if (SESSION_CODE_PATTERN.test(cls)) {
      sessionCode = cls.toLowerCase();
    } else {
      metadataKey = cls;
    }
  });
  return { metadataKey, sessionCode };
}

function getSessions(metadataKey) {
  const raw = getMetadata(metadataKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    window.lana?.log(`event-card hydrator: failed to parse page metadata "${metadataKey}": ${e.message}`);
    return null;
  }
}

function rewriteToken(str, metadataKey, index) {
  return str.replace(META_REG, (match, token) => {
    if (token.includes(':')) return match;
    if (token.startsWith(metadataKey)) {
      return `[[${metadataKey}:${index}${token.slice(metadataKey.length)}]]`;
    }
    if (!token.includes('.')) {
      return `[[${metadataKey}:${index}.${token}]]`;
    }
    return match;
  });
}

// Rewrites this card's own authored, indexless `[[metadataKey.field]]` (or bare
// `[[field]]`) tokens to point at one item — `featured-sessions.enTitle` (or `enTitle`)
// becomes `featured-sessions:2.enTitle`. Mirrors repeat-template.js's setTokenIndex, but
// applied to an already-authored card instead of a cloned template row: content stays
// in authoring, never built here.
function rewriteTokensToIndex(block, metadataKey, index) {
  // Plain-text tokens (title, description, ...) round-trip through innerHTML fine.
  block.innerHTML = rewriteToken(block.innerHTML, metadataKey, index);

  // DA percent-encodes `[[`/`]]` inside attribute values on save, so href tokens never
  // match METAREG against raw innerHTML. Decode first, matching the same convention
  // decorate.js's own processDATemplateLinks already uses for authored template links.
  block.querySelectorAll('a[href]').forEach((a) => {
    const raw = a.getAttribute('href');
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch (e) {
      // Not percent-encoded — use as-is.
    }
    const rewritten = rewriteToken(decoded, metadataKey, index);
    if (rewritten !== decoded) a.setAttribute('href', rewritten);
  });
}

function applySessionData(block, session) {
  if (session.sessionId) block.dataset.sessionId = session.sessionId;
  if (session.mrStreamId) block.dataset.mrStreamId = session.mrStreamId;
  if (session.url) block.dataset.sessionUrl = session.url;
  if (session.watchUrl) block.dataset.watchUrl = session.watchUrl;

  const { startTimeMillis, endTimeMillis } = session.sessionTime || {};
  if (startTimeMillis) block.dataset.startTimeUtc = new Date(startTimeMillis).toISOString();
  if (endTimeMillis) block.dataset.endTimeUtc = new Date(endTimeMillis).toISOString();
}

// One authored card per session, matched to its data by an explicit session-code class
// (e.g. "s6304").
function hydrateSingle(block, metadataKey, sessionCode, sessions) {
  const index = sessions.findIndex((s) => (s.sessionCode || '').toLowerCase() === sessionCode);
  if (index === -1) return false;
  rewriteTokensToIndex(block, metadataKey, index);
  applySessionData(block, sessions[index]);
  return true;
}

// One authored template card with no session-code class — cloned once per item in the
// metadata collection instead, each clone indexed by its own array position rather than
// matched by identifier. Lets an author write a single event-card row for e.g. a
// Featured Sessions rail instead of one hand-duplicated card per session.
function hydrateRepeated(block, metadataKey, sessions) {
  if (!sessions.length) return false;
  sessions.forEach((session, index) => {
    const clone = block.cloneNode(true);
    rewriteTokensToIndex(clone, metadataKey, index);
    applySessionData(clone, session);
    block.before(clone);
  });
  block.remove();
  return true;
}

export default function hydrateEventCard(block) {
  const { metadataKey, sessionCode } = getMetadataKeyAndSessionCode(block);
  if (!metadataKey) return false;

  const sessions = getSessions(metadataKey);
  if (!sessions) return false;

  return sessionCode
    ? hydrateSingle(block, metadataKey, sessionCode, sessions)
    : hydrateRepeated(block, metadataKey, sessions);
}
