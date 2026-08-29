# Video Playlist (C2)

Authored on an Individual Session Page as a sibling of a separate
`video-player` block, inside the same `.section` (see that block's own
README for embedding/tracking). This block handles the topic-playlist list
only; it does not embed or track the current session's own video itself —
including deciding whether to render at all: it requires a real,
**on-demand** embeddable video to exist on the page (same onDemand-only
check `video-player.js`'s own `pickEmbeddableVideo()` uses; see "No video,
no playlist" below), not merely that the session has ended. A page whose
only video entry is, say, a `liveStream` kind is treated the same as having
no video at all — this block never renders "more like this" next to a
player that itself has nothing to embed.

The two blocks communicate only through `localStorage`
(`video-playlist:progress`, `video-playlist:play-all`), page-wide
`CustomEvent`s, and one shared `BlockMediator` store — never a direct
reference — so either can load independently, in either order:

- `video-player:progress` / `video-player:state` — dispatched by
  `video-player.js`, reporting progress and raw playback state
  (play/pause/ended). This block owns every decision about what to do with
  that state (e.g. "Play all" advancing on `ended` — see Play all below);
  `video-player.js` makes none of those decisions itself.
- `videoLayoutDecision` — a `BlockMediator` store (get/set/subscribe, same
  pattern `session-store.js` uses for `imsProfile`/`rsvpData`) set by
  **this** block (`announceVideoDecision()`) once it knows whether it has
  anything to show at all (`hasPlaylist: true`/`false`). The `video-player`
  instance on the page (see that block's own "Which instance actually
  plays" section) reads/subscribes to this to know whether it should
  actually embed. This block also acts directly on the two author-applied
  marker classes (`.video-container`/`.video-playlist-container` — see
  Authoring below) to remove whichever side lost.

Renders exactly one variant — a topic playlist: a list of other on-demand
sessions sharing a topic with the current session, auto-resolved from real
session-catalog data.

If there's nothing to show — no on-demand embeddable video on the page,
the session hasn't ended yet, or fewer than the configured minimum
on-demand sessions match the current session's topic — the block removes
itself (via `removeBlock()`, so `video-player.js` is always notified).
There's no empty state.

## Authoring

The Individual Session Page template already carries the current session's
own identity as **page metadata** — `session-id` and `custom-attributes`
(that session's own raw customAttributes blob) — so nothing needs to be
authored on the block itself for the topic playlist to work:

```
| Video Playlist |  |
| --- | --- |
```

Block-level rows are only for the optional overrides below, and for
authoring environments where that page metadata isn't present (a fallback,
not the primary path):

| Field | Required | Default | Notes |
|---|---|---|---|
| `session-id` | No | page's own `session-id` metadata | Only needed as a fallback if that metadata is missing. |
| `playlist-title` | No | `Playlist on session page` metadata's own label, else `More like this` | Heading shown above the topic playlist. Only used when that metadata label isn't available — see "How the playlist title is resolved" below. |
| `minimum-sessions` | No | `4` | Minimum number of matching on-demand sessions required before the topic playlist renders at all. |
| `maximum-sessions` | No | `7` | Ceiling on total rows ever rendered — rows beyond this are never built, so "Show more" can never reveal more than this. Once expanded, the list scrolls internally beyond ~4 visible rows. |
| `default-thumbnail` | No | — | Fallback thumbnail URL used for a row whose own session has no thumbnail of its own. |
| `background` | No | light/dark theme default (`--vp-bg`) | Same authored "Background" row + `readBackgroundConfig()` utility every other block in this section (event-featured-products, event-speakers, event-session-resources, event-session-details) already supports — sets an inline `background` that overrides the theme default. |

**This block's own containing SECTION also needs a marker class**, authored
via that Section Metadata block's own "Style" row (standard Milo
convention — adds the given class(es) to the section) —
`video-playlist-container`. See `video-player`'s own README, "Authoring,"
for the matching `video-container` class on the other, full-width section —
these two are how `announceVideoDecision()` below finds each side without
depending on the page's actual DOM/fragment structure.

## Which video-player wins, and what gets removed

Full mechanism (both instances, the shared `BlockMediator` decision store,
timing) lives in `video-player`'s own README — this section covers only
what THIS block does once it knows whether it has anything to show:

- **Has a playlist** (`announceVideoDecision(true)`): the whole
  `.video-container` section is collapsed/removed (fade-out via
  `.is-collapsing` — see the CSS) — it only ever holds a `.video-player`,
  so removing all of it is safe.
- **No playlist** (`announceVideoDecision(false)`, via `removeBlock()`):
  only the specific `.video-player` and `.video-playlist` elements inside
  `.video-playlist-container` are collapsed/removed — never the container
  itself, since it's shared with other, unrelated blocks authored
  alongside it (event-featured-products, event-speakers,
  event-session-resources, ...). This block's own `el.remove()` (from
  `removeBlock()`) handles removing itself; `announceVideoDecision` here
  additionally removes the sibling `.video-player` in the same container.

Both branches look up their target via `document.querySelector('.video-container')`/
`.querySelector('.video-playlist-container')` — the author-applied marker
classes, not inferred DOM structure. This replaced an earlier
`.grid-column`/`.closest('.section')` structural walk that broke once the
two columns turned out to live in separate `.fragment > .section` trees
with no section reachable from either side.

## How the playlist title is resolved

Three-tier fallback, in order: the `Playlist on session page` custom attribute's own
human-readable **label** (e.g. `"Social Media and Marketing"`, not the machine slug
`"social-media-and-marketing"` that same attribute's other use needs for topic matching)
takes precedence whenever it's available — this is the SAME attribute the topic filter
itself already reads (see below). An authored `playlist-title` row is only consulted as
a fallback when that metadata label isn't available (not the other way around); if
neither is available, the hardcoded `"More like this"` is the final fallback. This
attribute is a multi-select field but only ever carries one value in practice for this
purpose, so `extractCustomAttributeValue` (first value only) is correct here, unlike
`extractCustomAttributeSlugs` (all values) used for topic matching.

## How the topic playlist is resolved

`Playlist on session page` is a **hard gate**, not just a data source: if
the current session's own `custom-attributes` page metadata doesn't carry
this attribute at all, this session has no playlist — full stop. Nothing
is built, and the fetched catalog is never even filtered/looped for topic
matches. There is deliberately **no fallback** to the fetched catalog's own
`playlistOnSessionPage` field for this check — if the page metadata is
missing the attribute, that's treated the same as "no playlist," even if
the catalog might have a value once it loads.

When the attribute IS present, its value(s) are read via
`sessions-api.js`'s exported `extractCustomAttributeSlugs` (the same
extractor the real catalog fetch uses) — known **synchronously**, without
depending on that session having already loaded into the catalog.

That topic value then filters the full session-catalog (`sessions.value`
from `utils/session-store.js`) for **other** sessions whose `Playlist
assignment/name` includes it. No mapping table between the two attributes
is needed or maintained — both draw from the same slug vocabulary.

A matching session must also qualify as a real, watchable row:

1. **Has a video source at all** — `hasVideoSource` (`sessions-api.js`),
   true when either the `MPC ID` or `YouTube ID` custom attribute is
   present. A session with neither is never included, regardless of topic
   or timing.
2. **Has premiered** — via `hasPremiered()`:
   - Scheduled sessions (real `session-times`): exactly `'on-demand'` per
     `utils/session-state.js`'s `deriveSessionState` (current time past
     the session's own end time).
   - **IPOD sessions** (recorded in-person, no scheduled session-times of
     their own — `startTimeUtc`/`endTimeUtc` both `''`): premiere
     `dvrTimingHours` hours after the **event's** own start time instead
     (there's no session-level end time to compare against). Formula and
     both real attribute names confirmed against Northstar's
     `SessionsDataSyncServiceImpl.java`/`SessionUtil.java`:
     `sessionPageStart + "DVR Timing (in hours)"`. `dvrTimingHours` is
     `sessions-api.js`'s normalized form of that custom attribute
     (defaults to `0`). The event's own start time comes from the current
     page's own `local-start-time-millis` metadata (same key
     `event-agenda.js` already reads) — one event start time applies to
     every session in the topic playlist, not just the current one. If
     that metadata is missing, IPOD rows are excluded rather than guessed
     at (`eventStartMs == null` → `hasPremiered` returns `false`).

**Known limitation, not solved by this block**: there's no signal in the
session-catalog data for "recording has actually finished processing" —
`deriveSessionState` returns `'on-demand'` purely from the session's end
time having passed. A session whose recording isn't processed yet could
theoretically still appear as a row. Flagged to product; no existing data
field supports fixing this today.

## Loading the current session's own video

Handled entirely by the separate `video-player` block — see its own README
for embedding, provider handling, and resume-on-load. This block never
embeds a player itself.

## No video, no playlist

`init()` requires the current page to actually have a real, **on-demand**
embeddable video (`hasEmbeddableVideo()`, checking `session-times`
metadata for an `mpc`/`youtube` provider entry whose `kind` is
`'onDemand'`) before rendering anything at all — the same onDemand-only
check `video-player.js`'s own `pickEmbeddableVideo()` uses, deliberately
duplicated here rather than shared via a cross-block signal (per product:
this block should use the same underlying logic the player itself uses,
not depend on whether that block actually loaded/rendered successfully as
a separate concern, and should never render "more like this" for a page
whose only video is something the player itself would never embed, e.g. a
`liveStream` entry). A session having *ended* is a different question from
a session *having an on-demand video at all* — both gates are checked
independently, and either one failing removes this block.

## Play all

A "Play all" toggle is rendered alongside the topic-playlist title. Its
state persists to `localStorage` (`video-playlist:play-all`) —
a plain in-memory flag wouldn't survive the full-page navigation that
advancing to the next session's own page requires.

**This block owns the entire advance decision** — `video-player.js` only
reports raw playback state (a page-wide `video-player:state` `CustomEvent`,
detail `{ sessionId, state }` where `state` is `'play'`/`'pause'`/`'ended'`);
it makes no decision about what should happen on `ended`. `init()` here
listens for that event, and on `ended` for the *current* session
specifically (a different session's video is never embedded on this page):
reads the "Play all" preference, and if enabled, resolves the next session
by reading `data-href` directly off this block's own rendered rows (the
first row whose `data-item-id` isn't the current session, in
`resolveTopicPlaylist`'s own ascending-by-start-time order) and navigates.
No direct reference between the two blocks — they may load in either order
and don't share JS scope.

## Watch progress + resume

Every session's own page saves its own watch progress to `localStorage`
(`video-playlist:progress`, keyed by **session id**, not any provider's
video id — only the session's own page ever embeds its video, so which
session is playing is always unambiguous) — written by `video-player.js`,
not this block. `getVideoProgress`/`computeProgressPercent` here only
**read** that map:

- **Per-row progress bars** — each topic-playlist row reads the matching
  session's saved progress at render time and shows it as a filled bar next
  to the duration. Since a row's own session isn't embedded on THIS page
  (except the current session's own row), this is a snapshot from the last
  time the viewer was on that session's own page, not live for those rows.
- **Live updates for the current session's own row** — `video-player.js`
  dispatches a page-wide `video-player:progress` `CustomEvent` (detail:
  `{ sessionId }`) whenever it saves new progress; this block listens for
  it in `init()` and re-reads/re-renders that one row's progress bar and
  duration label, so the "now playing" row updates live as the video
  actually plays, without the two blocks referencing each other directly.

Resume-on-load is handled entirely in `video-player.js`.

Client-only persistence (no backend field exists for per-viewer watch
progress today).

## Favorites

Each topic-playlist row has a favorite/heart toggle backed by the same
shared, real RF-backed mechanism `upcoming-sessions.js`/`sessions-guide`
use (`favorited`/`pendingActions` signals in `utils/session-store.js`,
`toggleFavoriteWithFeedback` in `services/sessions/action-feedback.js`) —
not a local/`localStorage` reimplementation. The button is a real, separate
`<button>` sibling next to the row's thumbnail/meta (a row can't be a
native `<button>` itself once it needs to contain another `<button>`) —
its click handler calls `stopPropagation()` so favoriting a row never also
navigates to it.

## The current session's own row

The current session is merged into the topic playlist's displayed rows
(`render()` in `video-playlist.js`, sorted into its correct chronological
position, not force-prepended) and highlighted via `highlightRow` so the
viewer can tell which row is theirs while browsing "more like this". This
is purely a **display** concern: `resolveTopicPlaylist`'s own return value
(used for `minimum-sessions` gating) still only ever contains **other**
qualifying sessions, unaffected — the current session never counts toward
it. It does occupy one of the `maximum-sessions` display slots, though,
since that cap applies to the final, current-session-included display
list. (See Play all above for how `video-player.js` determines the actual
next-session target from these rendered rows.)

## Row selection

Selecting a topic-playlist row **navigates to that session's own page**
(`sessionPageUrl`) rather than swapping the player in place — real
session-catalog data has no per-row video source (only the current
session's own page carries `session-times`), so there's nothing to swap
to. Navigating is always correct regardless: the destination page loads
its own video the exact same way, via its own `session-times` metadata.

Each row is a `<div role="listitem">` wrapping a real `<a href>` (giving
native browser affordances — status-bar URL preview on hover,
right-click/middle-click/ctrl-click "open in new tab" — a synthetic click
handler can't) — the favorite/play `<button>`s sit outside that `<a>` as
siblings, since a `<button>` can never validly nest inside a real `<a>`
(see Favorites above).

## Responsive layout

**Known gap, not yet solved**: the previous desktop right-rail treatment
depended on this block and its player sharing one `.section`
(`.section:has(> .video-playlist)`), so the player took the remaining flex
space and this block became a fixed-width rail beside it. Now that the
player lives in a separate `video-player` block/fragment (see the top of
this README), that `:has()`-based layout no longer applies — this block
currently only has its own standalone width per breakpoint (349px at
1024px, 392px at 1440px, 487px at 1920px, per Figma inspect), with no
side-by-side arrangement wired up yet. The actual two-column grid layout
(via `grid-column` fragments) needs revisiting once the real page-template
DOM is confirmed.

- **Desktop (≥1024px)**: this block's own standalone width per breakpoint
  above. A "Show more" button (topic-playlist only, shown once there are
  more than `SHOW_MORE_INITIAL_ROWS` (4) rows) reveals the remaining rows
  via a CSS `nth-child` cap — independent of the mobile drawer's
  `is-expanded` state below, which covers an unrelated need (the full list
  already scrolls on mobile, so there's no cap there). Per Figma, expanding
  never changes the rail's own width — only the row count — so
  `is-expanded` has no CSS width effect on desktop at all (it's
  mobile-drawer-height-only; see Drawer).
- **Mobile (<1024px)**: a `position: fixed` bottom sheet, open on load.
  Collapsing/expanding is governed by `computeDrawerCapPx`/
  `clampedTitleBottom` in `video-playlist.js` — the drawer's expanded height
  is capped by whichever is more restrictive of two constraints (never
  fully covers the session title's first 2 lines; never covers the video
  player either, wherever its own bottom edge is, since it may live in a
  sibling fragment — see `findPlayerBottom`), but never shrinks below
  `DRAWER_MIN_EXPANDED_PX` (150px, roughly one row) even on a very short
  viewport where both of those constraints would otherwise squeeze it
  smaller — the minimum floor wins in that edge case, over strict
  title/player avoidance.
  - The chevron toggle jumps between two fixed states: fully collapsed
    (`DRAWER_FLOOR_PX`, 75px) and the cap above.
  - The handle bar (`.video-playlist-handle`) supports real drag-to-resize
    via Pointer Events (`Drawer`'s own `#bindDrag`) — dragging moves the
    drawer freely between those same two bounds, snapping to whichever
    fixed state is closer once released, so the toggle button's own
    `aria-expanded`/chevron rotation always end up correct regardless of
    whether the user tapped or dragged.
  - An authored `background` row (see Authoring above) only ever applies
    at desktop — set as the `--vp-authored-bg` custom property, not a
    direct inline `background`, specifically so it can't outrank (via
    inline-style specificity) the mobile drawer's own dark theme.
