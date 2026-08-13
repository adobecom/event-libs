# featured-sessions

Grid of Featured Sessions cards, fully generated from data — never hand-authored.
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
