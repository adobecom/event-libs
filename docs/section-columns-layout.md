# Section Columns Layout

## Overview

`section-layout` is a page-wide metadata key that lets authors selectively group
top-level sections into shared rows, instead of the usual all-sections-stack
vertically behavior. A section is full-width by default; adding a `column-span-*`
value via that section's own **Section Metadata** block opts it into sharing a row
with its *contiguous* neighbors that carry the same kind of tag, proportioned by
the span ratio.

This is a page-level layout concern, not a block — no new block, no new
`EVENT_BLOCKS` entry. It's implemented entirely as an opt-in class toggle
(`applySectionColumnsLayout()` in `event-libs/v1/utils/decorate.js`) plus CSS
(`event-libs/v1/libs-styles.css`).

## Authoring

**1. Turn on the layout** — add a **Metadata** block at the bottom of the page:

| Metadata | |
|---|---|
| Section Layout | columns |

This applies to the whole page's `<main>`, not any one section.

**2. Split the page into sections** — insert a section break (`---`) between each
block of content you want as a potential column, same as any other EDS page.

**3. Group sections into a row** — add a **Section Metadata** block inside each
section you want side-by-side, with a `style` row set to `column-span-1`,
`column-span-2`, or `column-span-3`:

| Section Metadata | |
|---|---|
| style | column-span-2 |

- `column-span-1` — equal share of the row (default weight for a tagged section)
- `column-span-2` — twice the width of a `column-span-1` neighbor
- `column-span-3` — three times the width of a `column-span-1` neighbor

You can combine this with any other `style` values you already use (background,
spacing, theme, etc.) by comma-separating them in the same row, exactly as today.

**4. Sections without a `column-span-*` tag stay full-width**, stacked normally.
This is the default — you only tag the sections you actually want grouped.

**5. Grouping only works between *contiguous* sections.** An untagged section
between two tagged ones breaks them into two separate single-item rows rather
than merging them — there's nothing to configure here, it falls directly out of
how the CSS works (see Technical Notes), and it's visible immediately in preview.

**6. Blocks inside each section** stack top-to-bottom within their column exactly
as they do in any normal section — nothing changes there.

**7. Below 900px viewport width**, every section collapses back to plain vertical
stacking regardless of tagging — there's no authoring for this, it's automatic.

### Example

```html
<!-- Metadata block at the end of the page -->
<div>
  <div>Section Layout</div>
  <div>columns</div>
</div>
```

A page with four sections, where the middle two sit side-by-side (1:2 ratio) and
the outer two stay full-width:

```
Section 1 (no column-span tag — full width)
---
Section 2 (Section Metadata: style = column-span-1)
---
Section 3 (Section Metadata: style = column-span-2)
---
Section 4 (no column-span tag — full width)
```

Renders (above 900px) as: Section 1 full-width, Sections 2+3 side-by-side split
1:2, Section 4 full-width — each on its own row.

## Technical Notes

- The metadata key is `section-layout`, value `columns` (exact string match).
  Read via the existing `getMetadata()` utility — no new metadata-reading code.
- `applySectionColumnsLayout()` (`event-libs/v1/utils/decorate.js`) is **not**
  called from `decorateEvent()` — `decorateEvent` only runs on pages with an
  `event-id`, but this layout is meant for static/non-event pages too. A
  consuming site's own `decorateArea` must call it directly and unconditionally
  (see `da-events/events/scripts/scripts.js`'s `decorateArea()` for the reference
  integration). It always resolves the real page `<main>` directly and re-reads
  metadata on every call — safe to call repeatedly, since `decorateArea` can
  re-enter multiple times per page load (once per fragment/personalization pass).
- **No DOM reparenting.** Sections are never moved — every `.section` stays
  exactly where Milo's `loadArea()` puts it, as a direct child of `<main>`. This
  was a deliberate choice: an earlier design considered wrapping selected
  sections in a new element to act as their own flex container, but that breaks
  several load-bearing Milo behaviors that depend on `.section` being `<main>`'s
  direct child — `position: relative` (needed by section-metadata's
  background-image feature), `main > .section > .content` max-width rules used
  by several blocks, `sticky-section.js`'s forced `main.prepend`/`append`, and
  personalization's post-LCP `main > div` containment check. None of that is a
  concern here since the DOM structure never changes.
- **Grouping mechanism is pure CSS**, via `flex-wrap`, not CSS Grid. Every
  `.section` defaults to `flex: 1 1 100%` (forces it alone onto its own line —
  visually identical to normal stacking). A `column-span-*` class overrides that
  to `flex: N 1 0; min-width: 0`, letting the section shrink from 100% and pack
  onto a shared line with adjacent similarly-tagged siblings. Flexbox was chosen
  over CSS Grid specifically because it recalculates fill-percentage per line
  independently — a group's flex-grow ratios always sum to fill their shared row
  completely, regardless of how many sections are in the group or what span
  numbers they use. A fixed-track CSS Grid would leave a visible gap whenever a
  group's spans didn't sum to the grid's total column count.
- The 900px breakpoint matches this repo's own existing stack→side-by-side
  precedent (`event-agenda.css`, `event-partners.css`, `bento-cards.css`), rather
  than Milo's own `section-metadata` intra-section grid breakpoint (1200px),
  since a full-page column is much wider than a sub-section grid column at the
  same viewport.
