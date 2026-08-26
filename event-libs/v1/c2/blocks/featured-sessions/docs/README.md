# featured-sessions

Horizontally-scrolling carousel of featured session cards, fully generated from data
— never hand-authored.
An author builds the session list (including a per-session image, required for a
session to render) in the Tier 1 Event Configurator's Homepage editor, copies its
"Copy Link" output, and pastes that link into the page's doc body. `decorate.js`'s
`tec-homepage` auto-block builder decodes the link's hash payload and replaces it
with a `.featured-sessions` div carrying the decoded `{ entries }` config as
a `data-featured-sessions-config` attribute, which this block's `init()` reads.
Unlike Upcoming Sessions, this surface has no config-driven heading — always the
same fixed `aria-label`, no author-editable heading text.

Card theme (light/default or dark) is config-level, picked from the same
light/dark `<select>` the Upcoming Sessions configurator already has, saved as
`config.featuredSessionsTheme` and carried in the link as `config.theme` — the exact
same `theme` field/decode path `decorate.js`'s `tec-homepage` builder already uses for
Upcoming Sessions (see its `themeClass` handling). Unlike Upcoming Sessions, though,
that theme class lands on individual `.event-card`s rather than the block wrapper:
`init()` reads `config.theme` and adds a `dark-card` class to each generated card
before calling `event-card.js`'s own `init()` on it, since `event-card.js` owns
dark/light styling generically (`getTheme()`/`data-card-theme` in
`event-card.js`/`event-card.css`) — light is event-card's own default, with no class
needed.

The card CTA text is config-level (authored once for the whole block, not
per-session) via three text boxes in the Featured Sessions configurator — one each
for "prior", "during", and "after" a session. The decoded config carries these as
`config.cta.{prior,during,after}`. For each entry, `init()` compares the entry's own
`sessionTime` (`startTimeMillis`/`endTimeMillis`) against the viewer's clock to pick
which of the three applies — before `startTimeMillis` is "prior", between start and
`endTimeMillis` is "during", after `endTimeMillis` is "after"; an entry with no
`sessionTime` is treated as "prior". Any of the three left blank in the configurator
falls back to a built-in default ("Learn more" / "Watch now" / "Watch on-demand").

For each entry, `init()` builds the same "pre-hydration" DOM shape
`event-card.js`'s own `init()` already expects from hand-authored markup (a media
wrapper with an `<img>`, a content wrapper with title/track/CTA `<p>`s), always with
the `ratio-16-9` variant class, sets the session-routing `data-*` attributes
(`data-session-id`, `data-mr-stream-id`, `data-watch-url`, `data-session-url`,
`data-start-time-utc`, `data-end-time-utc`), then calls `event-card.js`'s own
`init(cardEl)` on it directly — reusing its media/body build and `session-routing.js`
wiring verbatim. An entry with no `imageUrl` is dropped by `event-card.js`'s own
existing rule ("a card with no image is not a valid authored card"), with no
special-casing needed here.

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

Since this block has no heading, the decorated marker (`.carousel-controls`, arrows
only) is simply prepended to `el` ahead of the track — no extra header wrapper needed.

Because this bypasses Milo's normal per-block CSS auto-load (the marker is built
programmatically, not scanned from authored content), `event-carousel.js`'s own
`init()` loads its stylesheet itself — the same reasoning `mobile-rider.js` uses for
its own selfInit case in `event-marquee.js`.
