import { createTag, getMetadata, getImageSource } from '../../utils/utils.js';
import logHydration from '../log.js';

/**
 * Hydrator for da-bacom's `event-speakers` block, which event-libs does not own.
 * The block reads cells positionally — 0 image, 1 name, 2 bio, 3 "read more" label —
 * and throws on `name.parentNode` if cell 1 is missing, so authored rows are replaced
 * rather than appended to.
 * Source of truth: da-bacom/blocks/event-speakers/event-speakers.js
 */
const CONFIG = {
  metadataKey: 'speakers',
  filterKey: 'speakerType',
  typeKeywords: ['speaker', 'judge', 'host', 'keynote'],
  readMoreLabel: 'Read more',
};

function extractTypeFromClassList(classList) {
  for (const type of CONFIG.typeKeywords) {
    if (classList.contains(type)) return type;
  }
  return null;
}

// Metadata keeps title/bio top level; the ESP record nests them under localizations.
function normalizeSpeaker(speaker) {
  return {
    firstName: speaker.firstName || '',
    lastName: speaker.lastName || '',
    title: speaker.localizations?.['en-US']?.title || speaker.title || '',
    bio: speaker.localizations?.['en-US']?.bio || speaker.bio || '',
    company: speaker.company || '',
    photo: speaker.photo || null,
    ordinal: speaker.ordinal,
  };
}

function sortByOrdinal(data) {
  return [...data].sort((a, b) => {
    const aHas = a.ordinal != null;
    const bHas = b.ordinal != null;
    if (aHas && bHas) return a.ordinal - b.ordinal;
    if (aHas) return -1;
    if (bHas) return 1;
    return 0;
  });
}

function buildImageCell(photo, fullName) {
  const cell = createTag('div');
  const imgSrc = photo ? getImageSource(photo) : '';
  if (!imgSrc) return cell;

  const picture = createTag('picture');
  picture.append(createTag('img', {
    src: imgSrc,
    alt: photo.altText || fullName,
    loading: 'lazy',
  }));
  cell.append(picture);

  return cell;
}

// createTag treats a string as HTML, so set these as text — unlike bio, they are never
// authored as markup.
function textEl(tag, value) {
  const el = createTag(tag);
  el.textContent = value;
  return el;
}

// Title and company ride along in the name cell — the block has none of their own.
function buildNameCell(speaker, fullName) {
  const cell = createTag('div');
  cell.append(textEl('h3', fullName));
  if (speaker.title) cell.append(textEl('p', speaker.title));
  if (speaker.company) cell.append(textEl('p', speaker.company));

  return cell;
}

// Full length: the block truncates to a preview and keeps the rest for "read more".
function buildBioCell(bio) {
  const cell = createTag('div');
  if (bio) cell.append(createTag('p', {}, bio));

  return cell;
}

// Authored rows are placeholders. They must go even when there is nothing to render:
// the block throws on `name.parentNode` for a row with fewer than two cells, whereas a
// block with no rows at all initializes cleanly.
function clearRows(block) {
  block.querySelectorAll(':scope > div').forEach((row) => row.remove());
}

export default function hydrateEventSpeakers(block) {
  const metadataValue = getMetadata(CONFIG.metadataKey);
  if (!metadataValue) {
    clearRows(block);
    return;
  }

  let data;
  try {
    data = JSON.parse(metadataValue);
  } catch (error) {
    logHydration(`Hydrator: Failed to parse metadata "${CONFIG.metadataKey}": ${error.message}`);
    clearRows(block);
    return;
  }

  const type = extractTypeFromClassList(block.classList);
  const filteredData = (data?.length && type)
    ? data.filter((speaker) => {
      const speakerType = speaker[CONFIG.filterKey] || speaker.type;
      return (speakerType || '').toString().toLowerCase() === type;
    })
    : data ?? [];

  if (!filteredData.length) {
    logHydration(`Hydrator: No speakers to render for event-speakers${type ? ` (type "${type}")` : ''}`);
    clearRows(block);
    return;
  }

  clearRows(block);

  sortByOrdinal(filteredData.map(normalizeSpeaker)).forEach((speaker) => {
    const fullName = `${speaker.firstName} ${speaker.lastName}`.trim();
    const row = createTag('div');

    row.append(
      buildImageCell(speaker.photo, fullName),
      buildNameCell(speaker, fullName),
      buildBioCell(speaker.bio),
      createTag('div', {}, CONFIG.readMoreLabel),
    );

    block.append(row);
  });
}
