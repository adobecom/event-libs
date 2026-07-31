# Design Doc: `carousel` + `card` blocks

## 1. Summary

Two new, independent blocks to power the "Featured Sessions" and "Speakers"
sections seen in the design (see screenshot referenced in ticket):

- **`carousel`** — a generic, content-agnostic horizontal scroller/controller
  (prev/next arrows, optional pagination dots, optional filter pills). It does
  not know or care what's inside it — it just arranges and scrolls its
  children.
- **`card`** — a single content card, authored standalone or as a repeated
  child inside a `carousel`. Supports two visual variants via authoring
  classes: **featured** (image + title/description/CTA) and **speaker**
  (elongated image with name/title overlay, no CTA).

This mirrors the existing C2 authoring pattern (e.g. `upcoming-sessions`):
plain nested `<div>`s authored in DA, decorated into semantic markup by JS,
styled with CSS driven by authored/utility classes.

## 2. Authoring model

Both blocks are manually authored as siblings under a common wrapper, exactly
as given in the ticket:

```html
<div>
  <div class="carousel">
    <div>
      <div></div> <!-- optional: eyebrow/headline group, see 2.1 -->
      <div></div> <!-- optional: filter pills group, see 2.1 -->
    </div>
  </div>

  <div class="card featured">
    <div><div><picture>...</picture></div></div>
    <div>
      <div>
        <p>Session Title</p>
        <p>Session description</p>
        <p><a href="adobe.com">CTA</a></p>
      </div>
    </div>
  </div>

  <div class="card featured">
    <div><div><picture>...</picture></div></div>
    <div>
      <div>
        <p>Session Title</p>
        <p>Session description</p>
      </div>
    </div>
  </div>

  <div class="carousel">
    <div>
      <div></div> <!-- second carousel instance: controls only -->
    </div>
  </div>
</div>
```

Key point from the ticket's markup: **`carousel` appears twice** — once
before the cards (header row: heading/description/pills + arrows) and once
after (a second, arrows-only instance). Both `carousel` divs and the `card`
divs are **siblings**, not nested. The `carousel` block does not physically
wrap the cards in the DOM as authored — it locates its target card group at
runtime (see §3.2) and applies scroll/DOM manipulation to it directly. This
matches the flat sibling structure shown in the ticket and avoids requiring
authors to nest content in DA.

### 2.1 `carousel` inner rows

The single child `<div>` inside `.carousel` holds 1–2 optional rows,
positionally interpreted (matches the ticket's `<div><div></div><div></div></div>`
shape):

| Row | Content | Required |
|---|---|---|
| Row 1 | Rich text: heading (as `<p>`/`<h*>`), description | No |
| Row 2 | Filter pills — one `<p>` per pill, text becomes pill label | No |

If a `carousel` instance has **no rows** (empty first child, as in the
ticket's second carousel), it's treated as an **arrows-only / footer**
instance — no heading, no pills, just prev/next controls (and pagination
dots if `data-dots` / a `dots` class is present).

### 2.2 `card` inner structure

```html
<div class="card [featured|speaker]">
  <div><div><picture>...</picture></div></div>   <!-- media -->
  <div><div>                                      <!-- content -->
    <p>Title</p>
    <p>Description</p>
    <p><a href="...">CTA label</a></p>            <!-- optional, featured only -->
  </div></div>
</div>
```

- First top-level child = media wrapper → first image/picture found becomes
  the card image.
- Second top-level child = content wrapper → first `<p>` = title, second
  `<p>` = description, an optional third `<p>` containing only an `<a>` =
  CTA.
- For `speaker` cards, only title + description (used as name + role) are
  read; a CTA paragraph, if authored by mistake, is ignored and stripped.

## 3. `card` block

### 3.1 Variants (authoring classes)

| Class | Use case | Media shape | CTA | Extra authored classes |
|---|---|---|---|---|
| `card featured` | Featured session | ~1:1 / 4:3, image on top | Yes, if third `<p><a>` present | `card-size-s`, `card-size-m` (default), `card-size-l` — controls card min-width for carousel snapping |
| `card speaker` | Speaker | Elongated (taller aspect, ~3:4/2:3), name+role overlaid on image bottom | Never rendered, even if authored | `card-size-s`, `card-size-m` (default), `card-size-l` (same sizing tokens as featured) |

`featured` is the default if no variant class is authored (keeps existing
markup non-breaking), but authors should always be explicit.

Size classes are shared across variants so both card types line up with the
same size scale inside a carousel:

- `card-size-s` — min-width ~200px (compact, 5+ per row on desktop)
- `card-size-m` — min-width ~260px (default, matches screenshot's 4-per-row featured cards)
- `card-size-l` — min-width ~320px (fewer per row, more prominent — e.g. hero speaker)

### 3.2 JS responsibilities (`card.js`)

```js
export default async function init(el) {}
```

1. Read variant from `el.classList` (`featured` | `speaker`), default to `featured`.
2. Extract media wrapper → build an optimized `<picture>` via Milo's
   `createOptimizedPicture` (never hand-roll `<img>` sizing).
3. Extract content wrapper → title, description, and (featured only) CTA
   anchor.
4. Rebuild semantic DOM:
   - `featured`: `<div class="card-media">picture</div>` +
     `<div class="card-body"><p class="card-title">…</p><p class="card-description">…</p><a class="card-cta">…</a></div>`
   - `speaker`: `<div class="card-media">picture<div class="card-overlay"><p class="card-name">…</p><p class="card-role">…</p></div></div>`
     (name/role rendered as an overlay on the image itself, per screenshot).
5. Set `data-card-variant` on `el` for CSS hooks and for the carousel to
   query card groups by variant.
6. No fetch/data dependency — purely a DOM-transform block, so it's testable
   with static HTML fixtures only.

### 3.3 CSS (`card.css`)

- `.card[data-card-variant="featured"]`: vertical flex, media on top with
  fixed aspect-ratio (`aspect-ratio: 4/3`), body padded below.
- `.card[data-card-variant="speaker"]`: media aspect-ratio taller
  (`aspect-ratio: 2/3` or per Figma spec), overlay positioned
  `absolute; inset-block-end: 0` with gradient scrim for text legibility,
  no separate body area.
- Card width driven purely by `card-size-*` classes (CSS custom property,
  e.g. `--card-min-width`), so the carousel can lay cards out in a row/grid
  without knowing variant internals.
- Focus-visible / hover states on the CTA link and on the whole card if the
  whole card is meant to be clickable (confirm with design — screenshot only
  shows CTA as clickable, not full card).

## 4. `carousel` block

### 4.1 JS responsibilities (`carousel.js`)

```js
export default async function init(el) {}
```

1. Parse the authored inner rows (§2.1) into heading/description (rendered
   as-is) and filter pills (rendered as `<button>` toggles, `role="tablist"`
   pattern or plain button group — confirm with design whether pills filter
   the card set or navigate to a different view).
2. Locate its target scroll region: the **nearest sibling group of `.card`
   elements** immediately following (or preceding, for the footer-only
   instance) the carousel in the DOM. Wrap that sibling run in a
   `<div class="carousel-track">` at runtime so it can be scrolled/panned as
   a unit — this is the one structural DOM change the block makes beyond its
   own subtree.
3. Render `prev`/`next` arrow buttons (`<button aria-label="Previous/Next">`)
   wired to scroll the track by one card-width (`scrollBy` with
   `behavior: 'smooth'`), using Milo's `createTag` for all elements.
4. Optionally render pagination dots if there are more cards than fit in one
   view — one dot per "page" (viewport-width's worth of cards), synced to
   scroll position via `IntersectionObserver` on the first card of each page
   (matches the dot indicator visible under the speakers row in the
   screenshot).
5. Disable/hide arrows at start/end of scroll range; re-enable on scroll.
6. Respect `prefers-reduced-motion` — no smooth scroll if set.
7. Two carousel instances in the same authored block (header controls +
   footer-only controls, per the ticket's markup) must stay in sync if they
   both target the same track — the second instance re-uses the same track
   ref instead of creating a second one, keyed by a shared `data-carousel-id`
   (auto-generated if not authored).

### 4.2 CSS (`carousel.css`)

- `.carousel-track`: `display: flex; overflow-x: auto; scroll-snap-type: x mandatory;`,
  each direct child (`.card`) gets `scroll-snap-align: start`.
- Hide native scrollbar, rely on arrows/dots for affordance (with a
  keyboard/touch-scroll fallback for accessibility — track remains
  focusable and scrollable by keyboard/swipe even with scrollbar hidden).
- Arrow buttons: circular, positioned per screenshot (top-right of the
  header row for the featured section; same top-right position for the
  speakers section).
- Filter pills: horizontal row, active state = filled/dark pill per
  screenshot.

## 5. Registration

1. Add `'card'` and `'carousel'` to `EVENT_BLOCKS` (or `EVENT_BLOCKS_C2` if
   these should follow the same C2 authoring track as `upcoming-sessions` —
   **recommend `EVENT_BLOCKS_C2`** since the flat, class-driven, no-fetch
   authoring pattern matches that track, not the legacy `EVENT_BLOCKS`
   fetch-heavy blocks) in `event-libs/v1/libs.js`.
2. New directories:
   - `event-libs/v1/c2/blocks/card/{card.js,card.css}`
   - `event-libs/v1/c2/blocks/carousel/{carousel.js,carousel.css}`
3. Tests:
   - `test/unit/blocks/card/card.test.js` + `mocks/featured.html`,
     `mocks/speaker.html`
   - `test/unit/blocks/carousel/carousel.test.js` + `mocks/default.html`
     (two-instance fixture matching the ticket's markup, with cards between
     them)

## 6. Open questions for design/PM

1. Do filter pills under the Speakers headline **filter** the visible
   speaker cards, or **link out** (they render as `<a>`-like buttons in the
   screenshot)?
2. Is the whole featured card clickable, or only the CTA link/arrow?
3. Exact aspect ratio / min-width targets per breakpoint for both card
   variants (mobile: likely 1 card + peek, per standard carousel pattern) —
   needs Figma spec, not fully inferable from the single desktop screenshot.
4. Should `carousel` support nesting the cards directly as DOM children
   (author drags cards inside the carousel `<div>`) as an alternative to the
   sibling-run pattern in §2, for cases outside this specific page?
