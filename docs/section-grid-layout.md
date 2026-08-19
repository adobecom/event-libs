# Section Grid Layout

## Overview

`grid` is an opt-in Section Metadata `style` value that turns a single section into a
responsive 2-column grid. Blocks inside that section join a column and a stacking order
via their own authored variant classnames. There is no page-level metadata and no
custom JS: the whole feature is CSS, keyed off classnames Milo's `section-metadata`
block already applies to the section and Milo already applies to block variants.

**A section only splits into columns at a breakpoint where you've explicitly picked a
ratio for that breakpoint.** With no ratio class at all, a `grid` section renders
identically to a normal stacked section at every width — full-width blocks, source
order. This means mobile never splits (there's no mobile ratio class), and tablet only
splits if you add a `grid-tablet-*` class, independently of whether desktop splits.

## Authoring

**1. Turn a section into a grid** — add a **Section Metadata** block inside that
section, with a `style` row that includes `grid` (comma-separate with any other style
values you already use):

| Section Metadata | |
|---|---|
| style | grid |

On its own this does nothing visible yet — see step 4 to actually split into columns.

**2. Assign each block to a column** — add `grid-col-1` or `grid-col-2` as a variant
classname on the block itself (however your authoring tool exposes block variants —
e.g. a block name written as `Text (grid-col-2)`). A block with no `grid-col-*` variant
defaults to column 1. This only matters once a ratio is active (step 4); before that,
every block is full-width regardless of its column tag.

> **Freeform text/headings not wrapped in a block** land in Milo's own `.content`
> wrapper, which has no variant-classname mechanism — they can't be given a
> `grid-col-*` tag and always stay in column 1. If a piece of content needs to move to
> column 2, wrap it in an actual block instead of leaving it as loose text.

**3. Set the stacking order within a column (optional)** — add `grid-order-1` through
`grid-order-6` as a variant classname. Blocks in the same column stack in that order;
default is source order. Order only affects blocks within the same column — it does
not move a block between columns.

> **Accessibility:** `grid-order-*` is a purely visual reorder (CSS `order`) — it does
> not change DOM order. Screen readers and keyboard tab order still follow the
> underlying source order. Only use it for minor same-column reflow, not to meaningfully
> resequence content — doing so risks a WCAG 1.3.2 (Meaningful Sequence) mismatch
> between what's seen and what's read/tabbed. If content needs a genuinely different
> reading order at a breakpoint, author it in that order in the source instead.

**4. Pick a ratio, per breakpoint** — add one of these to the section's `style` row,
alongside `grid`. Each ratio class only applies at its own breakpoint tier; the other
tier stays stacked unless it also gets a ratio class.

| Ratio class suffix | Effect |
|---|---|
| `1-1` | Equal columns |
| `1-2` / `2-1` | 1:2 / 2:1 |
| `1-3` / `3-1` | 1:3 / 3:1 |
| `10-90` … `90-10` (steps of 10, e.g. `30-70`, `40-60`, `50-50`, `70-30`) | Any 10%-increment split |

Prefix with `grid-tablet-` for `768–1023px` or `grid-desktop-` for `≥1024px`, e.g.
`grid-tablet-1-1`, `grid-desktop-30-70`. Author either or both independently — for
example `grid-desktop-2-1` alone keeps the section stacked through tablet and only
splits 2:1 at desktop, which is the common "stack on tablet, split on desktop" pattern.

**5. Move a block to a different column at a different breakpoint (optional)** — add
`grid-col-1-tablet` / `grid-col-2-tablet` or `grid-col-1-desktop` / `grid-col-2-desktop`
alongside (or instead of) the base `grid-col-1` / `grid-col-2`. The breakpoint-specific
class overrides the base assignment only at that breakpoint (and only matters once that
breakpoint has an active ratio). The same pattern exists for order: `grid-order-1-tablet`
… `grid-order-6-tablet`, `grid-order-1-desktop` … `grid-order-6-desktop`.

**6. Configure spacing (optional)** — `column-gap` and `row-gap` each default to
`var(--s2a-spacing-lg, 24px)` once the section is `grid`, and are independently
overridable via `col-gap-*` / `row-gap-*` on the section's `style` row:

| Size | Value |
|---|---|
| `none` | `0` |
| `xxs` | `2px` |
| `xs` | `8px` |
| `s` | `12px` |
| `m` | `16px` |
| `l` | `24px` (default) |
| `xl` | `32px` |
| `xxl` | `40px` |
| `xxxl` | `48px` |

e.g. `style: grid, grid-desktop-2-1, col-gap-m, row-gap-m` for 16px gaps in both
directions. These apply at any breakpoint the grid is active — there's no separate
tablet/desktop gap override.

### Worked example

A section with two blocks, `A` and `B`, that should stack in one column through tablet
and only split 2:1 at desktop, with 16px gaps:

- Section `style`: `grid, grid-desktop-2-1, col-gap-m, row-gap-m`
- Block A: no variant needed (defaults to column 1, stays there)
- Block B: `grid-col-2-desktop` (stays column 1 — stacked below A — until desktop,
  where `grid-col-2-desktop` moves it into column 2)

## How column stacking behaves

Once a ratio is active, grid auto-placement (`grid-auto-flow: dense`) fills each column
top-to-bottom independently: multiple blocks assigned to column 1 stack down through
rows 1, 2, 3…; blocks in column 2 do the same in their own rows, starting from row 1
regardless of how many blocks column 1 has. `align-items: start` means a column's
content is never stretched to match a taller neighbor, and the two columns are free to
end at different total heights ("misalign" naturally, by design).

`dense` matters here, not just `align-items: start` — without it, the default (sparse)
auto-placement algorithm shares a single row cursor across both columns, so a column's
first block can get pushed down to whatever row the *other* column's cursor has already
reached, instead of starting at row 1. `dense` gives each column its own independent
placement instead.

**Residual limitation:** a row *track*'s height is still shared across both columns —
if column 1 and column 2 each have a block at the same row index (this only ever
happens at row 1, since after that each column's remaining blocks occupy rows the other
column has no block in), that row's height is the taller of the two, even though
`align-items: start` keeps the shorter block's own box from stretching. This can only
visibly matter if the shorter column has more blocks after that shared row — the extra
whitespace shows up above its next block, not around the shared row's own blocks.

## Implementation

- `event-libs/v1/libs-styles.css` — all the `grid`, `grid-col-*`, `grid-order-*`,
  `col-gap-*`/`row-gap-*`, and ratio rules. The base rule (`display: grid`, gaps) is
  gated `@media (min-width: 768px)`; ratio classes are further gated to their own
  breakpoint tier (`768–1023px` or `≥1024px`) so a tablet ratio never leaks into
  desktop or vice versa.
- `event-libs/v1/utils/decorate.js` — `decorateArea()` loads this stylesheet
  (`addStylesToEventPage()`) unconditionally, synchronously, for the main document and
  for every fragment, so the grid classnames always have their CSS available before
  first paint.
- No JS assigns columns, order, or gaps — Milo's own `section-metadata` block turns the
  `style` key into section classnames, and block variant authoring already turns
  `grid-col-*`/`grid-order-*` into block classnames, so there's nothing left for
  event-libs to compute.
- Card-style visual treatment (background, border-radius, padding) for a specific
  page's blocks is **not** part of this feature — that's authored as ordinary CSS in
  the block's own stylesheet (see e.g. the `event-session-details` page family), same
  as any other block-level styling.

## Scope

This supports a 2-column grid, the current requirement. A 3rd column
(`grid-col-3` + 3-track ratios like `1-1-1`) would follow the exact same pattern if
ever needed, but is not implemented.
