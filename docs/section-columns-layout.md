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

## vs. Milo's `two up` / `three up` / `four up` / `five up`

Milo's Section Metadata already has a `columns` style option (`two up`, `three
up`, `four up`, `five up`) that lays multiple blocks out side by side. Use that
instead of this feature when it's sufficient — it's simpler to author and needs
no page metadata. It's built for a different, narrower case though: it groups the
*blocks already inside one section* into a CSS grid, so each column is always
exactly one block, and every column is forced to share that one section's
background/spacing/theme (there's only one Section Metadata block per section).
Columns are also always equal width.

Reach for `section-layout: columns` + `column-span-*` instead when a column needs
to be its own independently-styled section (its own background, spacing, or
theme), or needs more than one block stacked inside it — neither of which
`two up`/`three up` can do.

## vs. Milo's `layout` key and `masonry` grid-span

Weighted (non-equal) ratios specifically are *not* new — Milo's Section
Metadata `layout` key already does this, via four fixed options:
`grid-template-columns-1-2`/`2-1`/`1-3`/`3-1` (authored as `layout: 1 | 2`,
etc.), active at 1200px and up. `masonry`'s `grid-span-1`…`grid-span-11` (out
of a 12-column grid, also 1200px and up) goes further and allows any ratio,
by giving each block inside the section an explicit column-span number. Both
still only place *blocks inside one section* — same single background/
spacing/theme constraint as `two up`/`three up`, and neither has a tablet or
mobile ratio story (masonry's tablet tier is an `auto-fit` card grid, not
span-based; `layout` has no tablet/mobile variant at all).

Use one of those first if all you need is a two-way (or masonry-style
arbitrary) ratio split of blocks that can share one section's styling and
only needs a ratio at desktop. Reach for `column-span-*` when the split needs
to cross section boundaries (independent background/spacing/theme per
column, or multiple blocks stacked in a column), or needs a ratio to hold —
or change — below 1200px. Real designs also aren't limited to `layout`'s four
preset ratios or small integers — e.g. a design calling for a 5:7 split in one
breakpoint band and a 2:1 split in another needs `column-span-<N>` to accept
an arbitrary `N`, not just 1/2/3.

## Authoring

**1. Turn on the layout** — add a **Metadata** block at the bottom of the page:

| Metadata | |
|---|---|
| Section Layout | columns |

This applies to the whole page's `<main>`, not any one section.

**2. Split the page into sections** — insert a section break (`---`) between each
block of content you want as a potential column, same as any other EDS page.

**3. Group sections into a row** — add a **Section Metadata** block inside each
section you want side-by-side, with a `style` row set to `column-span-<N>`,
where `N` is any positive whole number:

| Section Metadata | |
|---|---|
| style | column-span-2 |

- `column-span-1` — equal share of the row (default weight for a tagged section)
- `column-span-2` — twice the width of a `column-span-1` neighbor
- `column-span-3` — three times the width of a `column-span-1` neighbor
- `N` isn't capped at 3 — use whatever number the design calls for (e.g.
  `column-span-5` next to `column-span-7` for a 5:7 split)

`column-span-<N>` is a **weight**, not a slot number — a section's actual share of
the row is *its own weight ÷ the sum of every weight in that row*. So:

- `column-span-1` + `column-span-1` → 50% / 50%
- `column-span-1` + `column-span-2` → 33% / 67%
- `column-span-3` + `column-span-2` → 60% / 40%
- `column-span-1` + `column-span-1` + `column-span-1` → even thirds

You can combine this with any other `style` values you already use (background,
spacing, theme, etc.) by comma-separating them in the same row, exactly as today.

**4. Sections without a `column-span-*` tag stay full-width**, stacked normally.
This is the default — you only tag the sections you actually want grouped.

**5. Any number of contiguous tagged sections can share one row** — two, three,
or more. There's no separate "how many columns" setting; a row is just however
many contiguous `column-span-*` sections you author next to each other.

**6. Grouping only works between *contiguous* sections.** An untagged section
between two tagged ones breaks them into two separate single-item rows rather
than merging them — there's nothing to configure here, it falls directly out of
how the CSS works (see Technical Notes), and it's visible immediately in preview.

**7. Two separate, back-to-back row-groups need a divider between them.** A page
can have as many independent rows as you want, but the *only* thing that ends a
row is an untagged (full-width) section. If two different groups sit directly
next to each other with nothing untagged between them — e.g. you want sections
2+3 in one row and sections 4+5 in a separate row, immediately after — they'll
merge into a single four-column row instead, since there's nothing to force a
break between section 3 and section 4. Insert a plain, untagged section between
the two groups to force the break (it can be empty/purely structural if you
don't want it to show as its own visible row).

**8. Blocks inside each section** stack top-to-bottom within their column exactly
as they do in any normal section — nothing changes there. Use Milo's own section
spacing (`m-spacing`, `xl-spacing-top`, …) and, for grid sections, its `-up` gap
classes (`s-gap`…`xxxl-gap`) for spacing between those blocks — this feature does
not add a separate mechanism for that.

**9. Below 600px viewport width**, every section collapses back to plain vertical
stacking regardless of tagging — there's no authoring for this, it's automatic.

**10. Column ratios can vary by breakpoint.** `column-span-<N>` (no suffix)
applies at **900px and up**, same as before. Two more tiers are available,
each accepting any `N`, independently of what the other tiers use:

- `column-span-<N>-tablet` — applies from **600px up to 1200px**. Use it to
  group sections into a row earlier than the 900px default, or to give a section a
  different ratio in that band. A section with no `-tablet` class stays full-width
  until the next tier that does tag it.
- `column-span-<N>-desktop` — applies at **1200px and up**, overriding whatever
  ratio the section had at the tier below it (own `-tablet` class, or the base
  900px class).
- `column-stack-tablet` — forces a section back to full-width for the 600–1199px
  band specifically, even if it also carries a `column-span-*`/`-desktop` class
  that groups it into a row above or below that band.

A section can carry more than one of these at once (e.g.
`column-span-5-tablet, column-span-4-desktop` — a 5:7 split in the tablet band,
a 4:8 split at desktop) to get a different ratio, with a different weight, at
each tier. Same weight-ratio math applies within each tier independently; a
tier's weight has no relationship to any other tier's weight for that same
section.

**11. Collective row max-width.** By default a row spans `<main>`'s own full
width — untagged sections do too, so there's no visual change. Add a page
**Metadata** `Columns Max Width` key to cap and center every row (and the
untagged sections between them stay full-bleed, escaping back to `<main>`'s
edge):

| Metadata | |
|---|---|
| Section Layout | columns |
| Columns Max Width | 1200px |

Use any valid CSS `background`-style value — including a `var()` reference, since
this is set via `main.style.setProperty()`, not parsed/validated. Prefer
referencing an existing width token over typing its current resolved number, so
the row tracks that token if it's ever redefined:

| Metadata | |
|---|---|
| Columns Max Width | `var(--s2a-layout-rich-media-content-measure-wide, 1192px)` |

For Milo's own container width, skip this key entirely and use the `container`
style keyword instead (below) — it's already a generic, reusable Section
Metadata keyword, unlike the C2 measure tokens, which are only ever consumed
inside specific component CSS (`.milo-video`, `mobile-rider.css`) and have no
equivalent generic keyword to reuse. This never uses `100vw`, so it doesn't
trigger the scrollbar-width overflow bug that viewport-width-based centering
can.

**Reusing Milo's container width directly, without typing `1200px`.** Instead of
authoring a `Columns Max Width` value at all, tag any one of the row's
`column-span-*` sections with Milo's own `container` style keyword (the same
one used on any ordinary Milo section, via Section Metadata's `style` field —
`s spacing, column-span-2, container`). The row then resolves its max-width to
`--grid-container-width` directly, so it stays in sync with Milo's own
container width instead of a copy-pasted value that can drift out of sync with
it. A `Columns Max Width` metadata value takes precedence when both are
present. `container`'s own `width`/`margin: 0 auto` (which would otherwise also
apply directly to that one tagged section, on top of the row-level effect) are
reset to `auto`/`0` on any section that's both `column-span-*` and `container`
tagged, so the class works purely as a signal here — it doesn't also inset that
one section relative to its siblings.

**12. Gap between columns.** Add a `Columns Gap` metadata key with one of Milo's
own spacing keywords — `none`, `xxs`, `xs`, `s`, `m`, `l`, `xl`, `xxl`, `xxxl`
(mapped to Milo's `--spacing-*` tokens, the same scale as its `-up` gap classes).
Default is `none` (today's edge-to-edge behavior, unchanged). This only affects
the gutter *between* columns in a row — it does not add space between separate
rows; use each section's own Milo spacing class for that.

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

### Example: multiple independent rows on one page

Two separate 2-up rows, a solo full-width section, and a 3-up row — s1+s2 and
s3+s4 are *different* groups, so a divider (s2.5) is needed between them:

```
Section 1 (Section Metadata: style = column-span-1)
---
Section 2 (Section Metadata: style = column-span-1)
---
Section 2.5 — untagged divider, needed only because s1+s2 and s3+s4
              are separate groups sitting back-to-back with nothing
              else to force the break between them
---
Section 3 (Section Metadata: style = column-span-1)
---
Section 4 (Section Metadata: style = column-span-1)
---
Section 5 (no column-span tag — full width, "alone in its own row")
---
Section 6 (Section Metadata: style = column-span-1)
---
Section 7 (Section Metadata: style = column-span-1)
---
Section 8 (Section Metadata: style = column-span-1)
```

Renders (above 900px) as five rows: [1, 2] split 50/50 → [2.5, full-width] →
[3, 4] split 50/50 → [5, full-width] → [6, 7, 8] split into even thirds. Section
5 needed no divider on either side — an untagged section always forces a break
before *and* after itself, which is exactly what makes it render alone.

## Technical Notes

- The metadata key is `section-layout`, value `columns` (exact string match).
  Read via the existing `getMetadata()` utility — no new metadata-reading code.
- `applySectionColumnsLayout()` (`event-libs/v1/utils/decorate.js`) is **not**
  called from `decorateEvent()` — `decorateEvent` only runs on pages with an
  `event-id`, but this layout is meant for static/non-event pages too. A
  consuming site's own `decorateArea` must call it directly and unconditionally
  — there is no reference integration inside this repo; `applySectionColumnsLayout`
  is exported for a consuming site to wire in, and is exercised here only by
  `test/unit/scripts/decorate.test.js`. It always resolves the real page `<main>` directly and re-reads
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
- **`sticky-top`/`sticky-bottom` sections are always forced full-width inside a
  column layout**, regardless of any `column-span-*` class also on them.
  `sticky-section.js` itself still moves that section to be `<main>`'s first/last
  child (this feature doesn't and can't prevent that), which would otherwise let
  it land next to, and silently merge into, a row it wasn't authored next to. The
  full-width override makes that outcome impossible — a sticky section always
  renders alone on its own line, wherever it ends up.
- **A grouped section's own `.content` max-width is neutralized (`max-width: 100%`).**
  Milo's default `main > .section > .content { max-width: var(--grid-container-width) }`
  applies to every section regardless of this feature, and `--grid-container-width`
  is a *percentage* (`83.4%`) below the 1440px breakpoint, not a fixed length —
  left in place, a column's own content would shrink by another 83.4% of its
  already-narrowed box on top of whatever cap the row itself got from `Columns Max
  Width`/`container`, compounding down to a visibly over-padded column. The row-level
  cap is meant to be the only width constraint on the group; each column now just
  fills its flex-allocated share.
- **`grid-width-6/8/10` (and their `-desktop` variants) have their padding reset
  to `0` when combined with `column-span-*`.** Those Milo classes compute padding
  from `calc((100vw - Npx) / 2)` — the viewport width, not the section's actual
  box width — which overflows or collapses content once the section is shrunk to
  a fraction of a shared row. Combining `grid-width-*` with `column-span-*` is
  therefore effectively a no-op for the width constraint: the section just fills
  its column's real width, same as carrying no width option at all.
- **Grouping mechanism is `flex-wrap`, not CSS Grid.** Every `.section`
  defaults to `flex: 1 1 100%` (forces it alone onto its own line — visually
  identical to normal stacking). A `column-span-<N>` class overrides that to
  `flex: N 1 0; min-width: 0`, letting the section shrink from 100% and pack
  onto a shared line with adjacent similarly-tagged siblings. `flex-basis: 0`
  means the entire row width counts as free space, distributed by `flex-grow`
  ratio — this is the whole authoring model in the previous section: a row's
  split is always "my weight ÷ the row's total weight," for any number of
  sections in the row, not just two. Because there's no fixed size involved
  (`min-width: 0` removes the min-content floor too), items also never wrap
  based on width alone — the only thing that forces a line break is an
  untagged `flex: 1 1 100%` sibling, which is why grouping/row-separation is
  entirely driven by that mechanism rather than any explicit "row" concept.
  Flexbox was chosen over CSS Grid specifically because it recalculates
  fill-percentage per line independently — a group's flex-grow ratios always
  sum to fill their shared row completely, regardless of how many sections are
  in the group or what span numbers they use. A fixed-track CSS Grid would
  leave a visible gap whenever a
  group's spans didn't sum to the grid's total column count.
- **`N` is arbitrary, not a small enum, which is the one place this feature
  isn't pure CSS.** CSS selectors can match a class *name* but can't parse a
  *number* out of one into a usable `flex-grow` value — that's the one thing
  only JS can do here. `applyColumnSpanWeights()` (`decorate.js`, called from
  `applySectionColumnsLayout()`) reads each direct-child `.section`'s
  classList, regex-matches `column-span-(\d+)(-tablet|-desktop)?`, and writes
  the number onto the section as one of `--column-span-weight`,
  `--column-span-weight-tablet`, or `--column-span-weight-desktop`. Each
  breakpoint tier's CSS rule then just does `flex: var(--column-span-weight-X,
  ...) 1 0` — one rule per tier, not one rule per span value, so this reads a
  weight of `47` exactly as easily as `1`. This is why the mechanism no longer
  needs a hardcoded set of `column-span-1/2/3[-tablet|-desktop]` classes: the
  earlier version enumerated 9 explicit selectors (one per weight, per tier)
  and would have needed a 10th, 11th, … for every new weight a design called
  for — this version needs exactly 3, for the rest of this feature's life.
  Each tier's CSS uses an explicit `var()` fallback chain (rather than relying
  on cascade order between competing same-specificity selectors, which is
  exactly the class of bug a stricter review caught in an earlier version of
  this file) to resolve which tier's weight wins when a section carries more
  than one: at 900px+, the base (unsuffixed) weight wins over `-tablet` if
  both are set; at 1200px+, `-desktop` wins over both.
- The base (unsuffixed `column-span-*`) breakpoint stayed at 900px — this repo's
  own existing stack→side-by-side precedent (`event-agenda.css`,
  `event-partners.css`, `bento-cards.css`) — for back-compat with pages authored
  before the `-tablet`/`-desktop` tiers existed. The tiers themselves (600/900/1200)
  match Milo's own section-metadata breakpoints (mobile ≤599px, tablet 600–1199px,
  desktop ≥1200px) rather than inventing new ones.
- `main.section-columns` sets `align-items: stretch` explicitly (the flex/grid
  default) so sections sharing a row equalize in height — useful for backgrounds
  or borders to line up cleanly across the row. This only stretches each
  section's own box, not its content: `.section` lays out its children as normal
  block flow, not flex/grid, so a shorter section's actual content stays at its
  natural height inside the taller box rather than being force-stretched too.
- **Collective max-width and column gap** are read from the `Columns Max Width`
  and `Columns Gap` page metadata keys and written as `--section-columns-max-width`
  / `--section-columns-gap` custom properties on `<main>`, consumed by
  `libs-styles.css`. Centering uses `padding-inline` computed from `%`, never
  `100vw`, so it can't trigger the scrollbar-width overflow that viewport-relative
  centering is prone to; untagged (full-width) sections escape that padding via an
  equal-and-opposite `margin-inline`, so they stay flush with `<main>`'s real edge
  instead of getting inset along with the columns.
- `Columns Gap` only sets `column-gap`, not `gap` — vertical space between wrapped
  rows is left to each section's own Milo spacing class, so the two don't stack on
  top of each other.
- The `[class*='column-span-']` attribute selector (rather than enumerating
  every `column-span-<N>` and its `-tablet`/`-desktop` variants) is what the
  min-width reset, the `grid-width-*` padding reset, the weight `flex` rule,
  and the max-width escape margin all key off — one rule per concern, for any
  `N`, instead of one per span value.
