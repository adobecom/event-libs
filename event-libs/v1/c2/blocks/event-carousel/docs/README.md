# event-carousel

Carousel controls (heading, filter pills, prev/next arrows) for a track of `event-card`
cards. This block only builds the *controls* — the scrollable track itself is a
separate sibling element in the DOM.

## Locating the track

`locateTrack(el)` looks for an existing `.carousel-track` as a previous/next sibling.
If none exists yet, it scans for a run of adjacent `.event-card` siblings (forward, then
backward) and wraps them in a new `.carousel-track` div. This lets the block work
whether the track markup is authored explicitly or the cards are just placed next to
the event-carousel block.

## Layout notes

- The mobile centered-peek gutter (`padding-inline-start` on `.carousel-track`, see
  `event-carousel.css`) is real padding, so `scrollLeft` never reaches `0` at that breakpoint —
  the first card's resting position already sits past the gutter. `getLeadingGutter()`
  reads that padding so arrow-disabled-state math (`updateArrowState`) accounts for it;
  it's `0` on desktop where there's no such padding.
- `scroll-snap-align` only affects where the browser snaps *after* a scroll gesture —
  it never auto-positions the initial scroll offset. `alignInitialScroll()` sets
  `track.scrollLeft` to the gutter width on load so the peek gutter doesn't render as
  dead blank space in front of the first card.
- The `.carousel-controls` UI (heading/pills/arrows) is desktop-only — hidden below
  900px in CSS. The track itself is a separate sibling, so it keeps scrolling/swiping
  at mobile/tablet regardless; only the controls disappear.
- The 32px vertical margin on `.carousel-track` is an engineering-owned, intra-component
  offset (Figma spec: gap between the controls and the card row), not authorable section
  spacing.

## Arrow enable/disable state

`updateArrowState` runs on every `scroll` event, plus is wrapped in a `ResizeObserver`
watching both the track and its first card. The initial synchronous pass runs before
cards are decorated/sized, so `scrollWidth` still equals `clientWidth` and "next" would
wrongly report disabled until the first scroll — the resize observer catches decoration
settling, image loads, and viewport resizes so the state stays correct without requiring
a user scroll first.

Same right-arrow icon SVG is reused for both buttons — "prev" is rotated 180deg via CSS
(`.carousel-arrow-prev`), matching the Figma component (one icon asset, two directions).

## Theme

Light (the default) or dark, section-driven — mirrors `event-card.js`'s own `getTheme()`.
`init()`'s `getTheme()` checks `el.closest('.section')` for a `dark` class (the same
plain class `decorate.js`'s `applyAreaTheme()`/DA's Section Metadata `style: dark`
authoring already lands on the section) and sets `data-carousel-theme` on `el`
accordingly — nothing to configure per block or per link. The default arrow is a
dark/frosted glass circle with a white icon, built to sit on a light section;
`event-carousel.css`'s `.carousel-controls[data-carousel-theme="dark"] .carousel-arrow`
rules invert that to a light/frosted circle with a black icon so it stays visible
against a dark section instead. A `dark-carousel` class present on `el` itself before
`init()` runs is honored too, as a manual override.
