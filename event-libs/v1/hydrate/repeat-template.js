import { getMetadata } from '../utils/utils.js';
import { META_REG } from '../utils/constances.js';
import logHydration from './log.js';

const COLLECTION_REG = /^([a-z0-9-]+)(?=[.\]]|$)/i;
const INDEXED_REG = /^[a-z0-9-]+:/i;

function getTokens(el) {
  return [...el.innerHTML.matchAll(META_REG)].map((m) => m[1]);
}

function parseCollection(name) {
  const raw = name && getMetadata(name);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function findCollection(tokens) {
  for (const token of tokens) {
    if (!token.includes('?(') && !token.startsWith('@') && !INDEXED_REG.test(token)) {
      const name = token.match(COLLECTION_REG)?.[1];
      const items = parseCollection(name);
      if (items) return { name, items };
    }
  }
  return null;
}

function setTokenIndex(row, collection, index) {
  row.innerHTML = row.innerHTML.replace(META_REG, (match, token) => {
    if (!token.startsWith(collection)) return match;

    if (token.includes('?(')) {
      logHydration(`Hydrator: per-item conditionals are not supported in a hydrated template ("${token}"); it will evaluate against the whole "${collection}" collection`);
      return match;
    }

    const rest = token.slice(collection.length);
    if (rest && !rest.startsWith('.')) return match;

    return `[[${collection}:${index}${rest}]]`;
  });
}

export default function repeatTemplate(block, { selectItems } = {}) {
  const blockName = block.classList[0];
  const rows = [...block.querySelectorAll(':scope > div')];
  const candidates = rows
    .map((row) => ({ row, tokens: getTokens(row) }))
    .filter(({ tokens }) => tokens.length > 0);

  if (!candidates.length) {
    logHydration(`Hydrator: no [[token]] template row authored in ${blockName}`);
    return false;
  }

  if (candidates.length > 1) {
    logHydration(`Hydrator: ${blockName} has ${candidates.length} rows with [[tokens]]; only the first row whose tokens resolve to metadata is used as the template`);
  }

  const templateRows = candidates.map(({ row }) => row);
  let template = null;
  let collection = null;

  for (const candidate of candidates) {
    collection = findCollection(candidate.tokens);
    if (collection) {
      template = candidate.row;
      break;
    }
  }

  if (!collection) {
    logHydration(`Hydrator: no metadata array matches the [[tokens]] in ${blockName}; check the collection name is spelled correctly and its metadata is present`);
    templateRows.forEach((row) => row.remove());
    return false;
  }

  const { name, items } = collection;
  const selected = selectItems ? selectItems(items, block) : items;

  if (!selected.length) {
    logHydration(`Hydrator: no "${name}" items to render in ${blockName}`);
    templateRows.forEach((row) => row.remove());
    return false;
  }

  let rendered = 0;

  selected.forEach((item) => {
    const index = items.indexOf(item);
    if (index === -1) {
      logHydration(`Hydrator: selectItems for ${blockName} returned an item that is not in the "${name}" metadata; return the original objects, not copies`);
      return;
    }

    const clone = template.cloneNode(true);
    setTokenIndex(clone, name, index);
    block.append(clone);
    rendered += 1;
  });

  templateRows.forEach((row) => row.remove());

  return rendered > 0;
}
