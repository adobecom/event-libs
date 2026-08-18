# Page Background

## Overview

`page-background` is a page-wide metadata key that sets a background — a color
(optionally different per breakpoint) or a full-bleed image — behind everything
between the global nav and the footer. It's scoped to `<main>` only, so gnav and
footer are never affected.

This mirrors Milo Section Metadata's own `background` key
(`milo/libs/blocks/section-metadata/section-metadata.js`), applied at the page
level instead of a single section. There is no equivalent in Milo today — Milo's
background support is section-scoped only.

It's implemented the same way as
[the section columns layout](./section-columns-layout.md): an opt-in function,
`applyPageBackground()` (`event-libs/v1/utils/decorate.js`), plus CSS
(`event-libs/v1/libs-styles.css`). No new block, no new `EVENT_BLOCKS` entry.

## Authoring

Add a **Metadata** block at the bottom of the page:

**Solid/per-breakpoint color:**

| Metadata | |
|---|---|
| Page Background | #1d1d1d |

Pipe-separate up to three values for per-breakpoint colors, same convention as
Milo's section `background` key:

| Metadata | |
|---|---|
| Page Background | #000000 \| #1d1d1d \| #2d2d2d |

- 1 value → all viewports
- 2 values → mobile (≤599px) \| tablet+desktop (≥600px)
- 3 values → mobile (≤599px) \| tablet (600–1199px) \| desktop (≥1200px)

Any valid CSS `background` value works (color, gradient, etc.), not just a hex
color.

**Full-bleed image:**

| Metadata | |
|---|---|
| Page Background | https://.../media_1234...jpg |

Paste a link to the image asset as the value. It's decoded through this repo's
existing `createOptimizedPicture()` utility (`event-libs/v1/utils/utils.js`) —
the same helper other blocks already use — rather than a new image pipeline.

## Technical Notes

- The metadata key is `page-background`, read via the existing `getMetadata()`
  utility. Like `applySectionColumnsLayout()`, `applyPageBackground()` is **not**
  called from `decorateEvent()` — a consuming site's own `decorateArea` calls it
  directly, so it also works on non-event pages. It always resolves `<main>`
  directly and re-reads metadata on every call, so it's safe to call repeatedly.
- **Why a metadata value can't carry a live `<picture>` the way Section
  Metadata's `background` key can:** the page-level **Metadata** block is
  converted to `<meta>` tags in `<head>` by the EDS pipeline itself, so
  `getMetadata()` only ever returns plain text — there's no authored DOM node to
  read a `<picture>` from. Section Metadata doesn't have this limitation because
  it stays a live block inside its section. This is why the image path here
  takes a plain URL string and builds the picture itself, instead of relocating
  an authored one.
- A value is treated as an image if it parses as a URL whose path ends in a
  known image extension, or contains `/media_` (the DA/AEM authored-asset link
  pattern) — otherwise it's treated as a `background` value and applied as-is.
- Color values are applied via `main.style.background`, matching per-breakpoint
  color the same way Milo's own `applyBackground` does — `matchMedia` picks the
  right value now and re-applies on breakpoint change (one listener total,
  attached once, always re-reading metadata fresh rather than closing over a
  value list — so a later metadata change is picked up correctly).
- The image is inserted as `<main>`'s first child (`picture.page-background`,
  `position: absolute; inset: 0; z-index: -1`), which requires `<main>` to be
  `position: relative` — set via `main:has(> picture.page-background)` rather
  than unconditionally, so pages without an image background aren't affected.
