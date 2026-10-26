import { logWarning } from './lana-log.js';

// ESP's RainFocus sync maps each RF role onto speakerType (Speaker -> 'Speaker',
// Co-Presenter -> 'Presenter', Moderator -> 'Host'). `ordinal` is RF's displayorder,
// which restarts at 1 in every role, so it only orders speakers within one role.
// Any other or missing speakerType goes after the Presenters.
const ROLE_ORDER = ['Speaker', 'Presenter'];
const OTHER_ROLE = ROLE_ORDER.length;

function roleRank(speaker) {
  const rank = ROLE_ORDER.indexOf(speaker?.speakerType);
  return rank === -1 ? OTHER_ROLE : rank;
}

// null when missing or non-numeric; a numeric string counts, as it did for the old sort.
function numericOrdinal(speaker) {
  const raw = speaker?.ordinal;
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return Number.isFinite(value) ? value : null;
}

// A missing ordinal sorts last within its group.
function compareOrdinals(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

// The index tiebreak keeps equal entries in incoming order without relying on
// sort stability.
function compareRanked(a, b) {
  return a.role - b.role
    || compareOrdinals(a.ordinal, b.ordinal)
    || a.index - b.index;
}

// Logs ids and ordering fields only, never names.
function reportFallbacks(fallbacks, total, context) {
  const label = context ? `${context}: ` : '';
  logWarning(
    'session-speakers',
    `${label}${fallbacks.length} of ${total} speaker(s) ordered by fallback`
      + ' (speakerType not Speaker/Presenter, or ordinal not a number)',
    fallbacks.map(({ speaker }) => ({
      speakerId: speaker?.speakerId ?? null,
      speakerType: speaker?.speakerType ?? null,
      ordinal: speaker?.ordinal ?? null,
    })),
  );
}

/**
 * Orders a session's speakers like RainFocus: Speakers, then Presenters (RF
 * Co-Presenters), then any other or missing speakerType; by ordinal within each
 * group. Returns a new array (never mutates; non-array input yields []) and logs
 * one diagnostic per call when a fallback was needed, labelled with `context`.
 */
export function sortSessionSpeakers(speakers, context = '') {
  if (!Array.isArray(speakers)) return [];
  const ranked = speakers.map((speaker, index) => ({
    speaker,
    index,
    role: roleRank(speaker),
    ordinal: numericOrdinal(speaker),
  }));
  const fallbacks = ranked.filter((r) => r.role === OTHER_ROLE || r.ordinal === null);
  if (fallbacks.length) reportFallbacks(fallbacks, ranked.length, context);
  return ranked.sort(compareRanked).map(({ speaker }) => speaker);
}
