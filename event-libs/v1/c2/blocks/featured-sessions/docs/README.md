# featured-sessions

Horizontally-scrolling carousel of featured session cards, fully generated from data
— never hand-authored.
An author builds the session list (including a per-session image, required for a
session to render) in the Tier 1 Event Configurator's Homepage editor, copies its
"Copy Link" output, and pastes that link into the page's doc body. `decorate.js`'s
`tec-homepage` auto-block builder decodes the link's hash payload and replaces it
with a `.featured-sessions` div carrying the decoded `{ heading, entries }` config as
a `data-featured-sessions-config` attribute, which this block's `init()` reads.

For each entry, `init()` builds the same "pre-hydration" DOM shape
`event-card.js`'s own `init()` already expects from hand-authored markup (a media
wrapper with an `<img>`, a content wrapper with title/track/CTA `<p>`s), sets the
session-routing `data-*` attributes (`data-session-id`, `data-mr-stream-id`,
`data-watch-url`, `data-session-url`, `data-start-time-utc`, `data-end-time-utc`),
then calls `event-card.js`'s own `init(cardEl)` on it directly — reusing its media/body
build and `session-routing.js` wiring verbatim. An entry with no `imageUrl` is dropped
by `event-card.js`'s own existing rule ("a card with no image is not a valid authored
card"), with no special-casing needed here.

This replaced the retired `hydrate`/`featured-sessions`-classname/session-code
mechanism (`event-libs/v1/hydrate/event-card.js`, now deleted) that required one
hand-placed `event-card` div per session and never supported images at all.

## Carousel controls

`init()` builds a `.carousel-track` (the same class `event-carousel.js` looks for)
holding the cards, plus a bare `.event-carousel` marker element with no authored rows.
It places the marker and track as siblings and calls `event-carousel.js`'s own `init()`
on the marker directly — the same reuse this block already does for cards via
`event-card.js`'s `init()`, so the carousel arrows and track scrolling aren't
reimplemented here. Since the marker carries no heading/pills rows,
`event-carousel.js`'s `parseRows()`/`buildHeader()`/`buildPills()` produce nothing for
it, and it ends up holding only `.carousel-arrows`.

The heading is deliberately *not* routed through that marker: `event-carousel.js`'s own
`.carousel-controls` container (the marker, once decorated) is hidden below 900px by
design, which is fine for optional arrows but not for the block's actual heading text.
Instead `init()` builds its own always-visible `.featured-sessions-header` (with an
`<h6 class="featured-sessions-heading">`), then moves the now-decorated marker into
that header afterward, purely for layout — safe to do since `event-carousel.js`'s
click handlers and `ResizeObserver` are bound to elements directly, not to DOM position.

Because this bypasses Milo's normal per-block CSS auto-load (the marker is built
programmatically, not scanned from authored content), `event-carousel.js`'s own
`init()` loads its stylesheet itself — the same reasoning `mobile-rider.js` uses for
its own selfInit case in `event-marquee.js`.
