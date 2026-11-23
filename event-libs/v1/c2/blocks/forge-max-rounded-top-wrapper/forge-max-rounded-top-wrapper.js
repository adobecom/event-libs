/**
 * forge-max-rounded-top-wrapper — "Your Adobe Summit experience at a glance."
 *
 * A Milo C2 section that pairs, for each agenda track (in-person / online):
 *  - a MOBILE accordion of collapsible day rows (thumbnail + type + day + schedule)
 *  - a DESKTOP staggered grid of tall portrait day-cards (image + overlaid
 *    type badge + day, schedule revealed on hover/focus)
 * plus two toggle buttons that switch the visible track and a trailing disclaimer.
 *
 * DA serializes this block as a FLAT, class-LESS run of <h2>, <a>, <ul>, text in
 * document order (see author-content.html / mocks/body.html) — there is NO grid,
 * row or tile wrapper and NONE of section.html's authored classes at runtime.
 * init() therefore probes BY CONTENT SHAPE (never by authored class) and
 * RECONSTRUCTS the rich layout with createElement, then replaceChildren once.
 *
 * CANONICAL DEPTH: from libs/c2/blocks/<name>/ to libs/utils/decorate.js is
 * THREE hops up (blocks -> c2 -> libs); the 3-hop specifier is correct.
 *
 * @param {HTMLElement} el The block element Milo passes to every C2 decorator.
 * @returns {Promise<void>}
 */
import { decorateBlockText } from '../../../utils/forge-milo-compat.js';

const BLOCK = 'forge-max-rounded-top-wrapper';
const PANEL_KEYS = ['in-person', 'online'];

// MEP / personalization markers Milo stamps on the row/cell wrapper the un-wrap
// discards — copy any present marker up onto the block root FIRST so a later
// Target/MEP swap still finds them.
const MEP_ATTRS = ['data-manifest-id', 'data-adobe-target-testid'];
function preserveMepAttrs(from, to) {
  if (!from || !to) return;
  for (const attr of MEP_ATTRS) {
    const v = from.getAttribute?.(attr);
    if (v != null) to.setAttribute(attr, v);
  }
  for (const a of [...(from.attributes || [])]) {
    if (a.name.startsWith('data-mep-')) to.setAttribute(a.name, a.value);
  }
}

const slug = (t) => String(t || '').trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function tag(name, className, ...kids) {
  const n = document.createElement(name);
  if (className) n.className = className;
  for (const k of kids) {
    if (k == null) continue;
    n.append(k.nodeType ? k : document.createTextNode(k));
  }
  return n;
}

// Trimmed, non-empty direct text segments of a node (excludes nested media).
function textSegments(node) {
  return [...node.childNodes]
    .filter((n) => n.nodeType === 3 && n.textContent.trim())
    .map((n) => n.textContent.trim());
}

const typeMod = (t) => slug(t) || 'conference';

// Split a day header's text into [type, day]. DA often serializes the authored
// "type" and "day" cells as a SINGLE whitespace/newline-joined text node (not two
// nodes), so a text-node split is unreliable: when there is only one segment, peel
// the leading category word (Preconference / Conference / Online) off as the type.
function splitTypeDay(segs) {
  if (segs.length >= 2) return [segs[0], segs.slice(1).join(' ')];
  const full = (segs[0] || '').replace(/\s+/g, ' ').trim();
  const m = full.match(/^(\S+)\s+(.+)$/);
  return m ? [m[1], m[2]] : [full, full];
}

// An authored <ul> is an ACCORDION when its first meaningful <li> starts with a
// heading (header-first), and a GRID when it starts with media (image-first).
function ulKind(ul) {
  const li = [...ul.children].find((c) => c.tagName === 'LI'
    && (c.querySelector('picture, img, h2, h3, ul') || c.textContent.trim()));
  const first = li && li.firstElementChild;
  return first && /^H[1-6]$/.test(first.tagName) ? 'accordion' : 'grid';
}

function buildAccordionItem(li, idx, key) {
  const head = li.querySelector(':scope > h2, :scope > h3') || li.firstElementChild;
  const pics = head ? [...head.querySelectorAll('picture')] : [];
  const [type, day] = splitTypeDay(head ? textSegments(head) : []);
  const schedule = li.querySelector(':scope > ul');

  const btn = tag('button', 'frmaw-acc-btn');
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('daa-ll', `${BLOCK}|${slug(day) || `day-${idx + 1}`}`);
  pics.forEach((p, i) => {
    p.classList.add('frmaw-acc-thumb', i === 0 ? 'frmaw-acc-thumb--mobile' : 'frmaw-acc-thumb--tablet');
    btn.append(p);
  });
  btn.append(tag('span', 'frmaw-acc-text',
    tag('span', `frmaw-acc-type frmaw-type--${typeMod(type)}`, type),
    tag('span', 'frmaw-acc-day', day)));

  const bodyId = `frmaw-${key}-acc-${idx + 1}`;
  btn.setAttribute('aria-controls', bodyId);
  const body = tag('div', 'frmaw-acc-body');
  body.id = bodyId;
  body.hidden = true;
  if (schedule) {
    schedule.classList.add('frmaw-acc-schedule');
    schedule.querySelectorAll(':scope > li').forEach((s) => s.classList.add('frmaw-acc-sched-item'));
    body.append(schedule);
  }
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!open));
    body.hidden = open;
  });

  const item = tag('li', `frmaw-acc-item frmaw-card--${typeMod(type)}`);
  item.append(tag('h3', 'frmaw-acc-header', btn), body);
  return item;
}

function buildGridItem(li) {
  const hasContent = li.querySelector('picture, img, h2, h3, ul') || li.textContent.trim();
  if (!hasContent) return null; // authored empty <li> spacer — drop it
  const pic = li.querySelector(':scope > picture');
  const type = textSegments(li)[0] || '';
  const dayH = li.querySelector(':scope > h2, :scope > h3');
  const schedule = li.querySelector(':scope > ul');

  const card = tag('li', `frmaw-card frmaw-card--${typeMod(type)}`);
  card.setAttribute('tabindex', '0');
  if (pic) {
    pic.classList.add('frmaw-card-img');
    card.append(pic);
  }
  const day = tag('h3', 'frmaw-card-day');
  if (dayH) while (dayH.firstChild) day.append(dayH.firstChild);
  const overlay = tag('div', 'frmaw-card-text',
    tag('span', `frmaw-card-type frmaw-type--${typeMod(type)}`, type), day);
  if (schedule) {
    schedule.classList.add('frmaw-card-schedule');
    schedule.querySelectorAll(':scope > li').forEach((s) => s.classList.add('frmaw-card-sched-item'));
    overlay.append(schedule);
  }
  card.append(overlay);
  return card;
}

export default async function init(el) {
  if (!el) return;
  el.setAttribute('daa-lh', BLOCK);

  // Un-wrap the EDS row/cell wrappers so we probe the flat authored content.
  const inner = el.querySelector(':scope > div > div');
  if (inner) {
    preserveMepAttrs(inner.parentElement, el);
    while (inner.firstChild) el.appendChild(inner.firstChild);
    inner.parentElement?.remove();
  }

  // Probe by content shape (never by authored class).
  const heading = el.querySelector(':scope > h2');
  const toggles = [...el.querySelectorAll(':scope > a')];
  const uls = [...el.querySelectorAll(':scope > ul')];
  const disclaimer = [...el.childNodes]
    .filter((n) => n.nodeType === 3 && n.textContent.trim())
    .map((n) => n.textContent.trim()).pop();

  const rebuilt = tag('div', 'frmaw-root');

  // Heading + toggle group.
  const head = tag('div', 'frmaw-head');
  const titleWrap = tag('div', 'frmaw-title-wrap');
  if (heading) {
    heading.classList.add('frmaw-title');
    titleWrap.append(heading);
  }
  head.append(titleWrap);
  const group = tag('div', 'frmaw-toggle-group');
  const toggleBtns = toggles.slice(0, 2).map((a, i) => {
    const b = tag('button', `frmaw-toggle ${i === 0 ? 'frmaw-toggle--solid' : 'frmaw-toggle--outline'}`, a.textContent.trim());
    b.type = 'button';
    b.dataset.panel = PANEL_KEYS[i] || `panel-${i}`;
    b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.setAttribute('daa-ll', `${BLOCK}|${slug(a.textContent) || `toggle-${i + 1}`}`);
    group.append(b);
    return b;
  });
  if (toggleBtns.length) head.append(group);
  rebuilt.append(head);

  // Pair consecutive <ul>s into [accordion, grid] tracks (in-person, then online).
  const panels = [];
  let cur = null;
  uls.forEach((ul) => {
    if (ulKind(ul) === 'accordion') {
      cur = { accordion: ul, grid: null };
      panels.push(cur);
    } else if (cur && !cur.grid) {
      cur.grid = ul;
    } else {
      cur = { accordion: null, grid: ul };
      panels.push(cur);
    }
  });

  panels.forEach((p, pi) => {
    const key = PANEL_KEYS[pi] || `panel-${pi}`;
    const panel = tag('div', `frmaw-panel frmaw-panel--${key}`);
    panel.dataset.panel = key;
    if (pi > 0) panel.hidden = true;
    if (p.accordion) {
      const acc = tag('ul', 'frmaw-accordion');
      acc.setAttribute('role', 'list');
      [...p.accordion.children].filter((c) => c.tagName === 'LI')
        .forEach((li, idx) => acc.append(buildAccordionItem(li, idx, key)));
      panel.append(acc);
    }
    if (p.grid) {
      const grid = tag('ul', 'frmaw-grid');
      grid.setAttribute('role', 'list');
      let count = 0;
      [...p.grid.children].filter((c) => c.tagName === 'LI').forEach((li) => {
        const card = buildGridItem(li);
        if (card) { grid.append(card); count += 1; }
      });
      grid.dataset.count = String(count);
      panel.append(grid);
    }
    rebuilt.append(panel);
  });

  if (disclaimer) rebuilt.append(tag('p', 'frmaw-disclaimer', disclaimer));

  // Toggle wiring: show the clicked track, hide the others.
  toggleBtns.forEach((b) => b.addEventListener('click', () => {
    toggleBtns.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    rebuilt.querySelectorAll('.frmaw-panel').forEach((pnl) => {
      pnl.hidden = pnl.dataset.panel !== b.dataset.panel;
    });
  }));

  // Analytics floor: tag every image we carried in (daa-im).
  rebuilt.querySelectorAll('img').forEach((img, i) => {
    if (!img.hasAttribute('daa-im')) img.setAttribute('daa-im', `${BLOCK}|${slug(img.getAttribute('alt')) || `image-${i + 1}`}`);
  });

  el.replaceChildren(rebuilt);

  // C2 typography on the heading via Milo's own service (guarded — layout does
  // not depend on it; .frmaw-title carries the styling regardless).
  try {
    const tw = el.querySelector('.frmaw-title-wrap');
    if (tw && typeof decorateBlockText === 'function') decorateBlockText(tw);
  } catch (e) { /* decorateBlockText is best-effort typography only */ }

  el.dataset.forgeAuthored = BLOCK;
}
