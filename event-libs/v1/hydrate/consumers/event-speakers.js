import repeatTemplate from '../repeat-template.js';

/**
 * Hydrator for da-bacom's `event-speakers` block, which event-libs does not own.
 *
 * All content — including the "Read more" label — is authored. The author writes one
 * template row of [[speakers.*]] tokens; this only decides which speakers appear and in
 * what order, then repeatTemplate clones the row and decorateEvent resolves the tokens.
 *
 * Block contract: da-bacom/blocks/event-speakers/event-speakers.js
 */
const TYPE_KEYWORDS = ['speaker', 'judge', 'host', 'keynote'];

function extractTypeFromClassList(classList) {
  return TYPE_KEYWORDS.find((type) => classList.contains(type)) ?? null;
}

function selectSpeakers(speakers, block) {
  const type = extractTypeFromClassList(block.classList);

  const filtered = type
    ? speakers.filter((speaker) => {
      const speakerType = speaker.speakerType || speaker.type;
      return (speakerType || '').toString().toLowerCase() === type;
    })
    : [...speakers];

  return filtered.sort((a, b) => {
    const aHas = a.ordinal != null;
    const bHas = b.ordinal != null;
    if (aHas && bHas) return a.ordinal - b.ordinal;
    if (aHas) return -1;
    if (bHas) return 1;
    return 0;
  });
}

export default function hydrateEventSpeakers(block) {
  repeatTemplate(block, { selectItems: selectSpeakers });
}
