# Video Playlist (C2)

Authored on an Individual Session Page, in its own grid-column fragment
(alongside a separate `video-player` block, in a different grid-column
fragment — see that block's own README for embedding/tracking). This block
handles the topic-playlist/chapters list only; it does not embed or track
the current session's own video itself — including deciding whether to
render at all: it requires a real embeddable video to exist on the page
(same check `video-player.js` uses; see "No video, no playlist" below), not
merely that the session has ended.

The two blocks communicate only through `localStorage`
(`video-playlist:progress`, `video-playlist:play-all`) and page-wide
`CustomEvent`s (`video-player:progress`, `video-player:state`) — never a
direct reference — so either can load independently, in either order,
regardless of which grid column/fragment it's actually authored in.
`video-player.js` only reports raw playback state (play/pause/ended); this
block owns every decision about what to do with that state (e.g. "Play
all" advancing on `ended` — see Play all below).

Renders one of two variants automatically — no explicit variant to author:

- **Chapters** — when the page's own `session-type` metadata is `Keynote`
  (long-form Keynotes/Sneaks content), or when a `chapters` row is authored
  (see below).
- **Topic playlist** — otherwise: a list of other on-demand sessions sharing a
  topic with the current session, auto-resolved from real session-catalog data.

If there's nothing to show — fewer than the configured minimum on-demand
sessions for the topic playlist, or no chapters authored for the chapters
variant — the block removes itself. There's no empty state.

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
| `playlist-title` | No | `More like this` | Heading shown above the topic playlist. Ignored in the Chapters variant (always titled "Chapters"). |
| `minimum-sessions` | No | `4` | Minimum number of matching on-demand sessions required before the topic playlist renders at all. |
| `maximum-sessions` | No | `7` | Ceiling on total rows ever rendered — rows beyond this are never built, so "Show more" can never reveal more than this. Once expanded, the list scrolls internally beyond ~4 visible rows. |
| `default-thumbnail` | No | — | Fallback thumbnail URL used for a row whose own session has no thumbnail of its own. |
| `chapters` | No | — | JSON array authored for the Chapters variant: `[{"label": "Intro", "timestampSeconds": 0}, ...]`. No backend field exists for this — it's hand-authored per session. |

## How the topic playlist is resolved

Reads the **current session's own** `Playlist on session page` value(s) —
preferring the page's own `custom-attributes` metadata (parsed with
`sessions-api.js`'s exported `extractCustomAttributeSlugs`, the same
extractor the real catalog fetch uses), falling back to the session's entry
in the fetched catalog only if that metadata is missing. This means the
current session's own topic value is known **synchronously**, without
depending on that session having already loaded into the catalog.

That topic value then filters the full session-catalog (`sessions.value`
from `utils/session-store.js`) for **other** sessions whose `Playlist
assignment/name` includes it. No mapping table between the two attributes
is needed or maintained — both draw from the same slug vocabulary.
`isKeynote`/Chapters detection follows the same page-metadata-first
pattern, via the page's own `session-type` value.

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

## Chapter seeking

Chapters seek within the **same, already-loaded** player — `window.__mr_player`
(Mobile Rider). This has not been exercised against a live page before; if
the real player's seek API differs from the `seek(seconds)`/`currentTime`
attempt in `video-playlist.js`, that needs correcting against a real embed.

## Loading the current session's own video

Handled entirely by the separate `video-player` block — see its own README
for embedding, provider handling, and resume-on-load. This block never
embeds a player itself.

## No video, no playlist

`init()` requires the current page to actually have a real, embeddable
video (`hasEmbeddableVideo()`, checking `session-times` metadata for an
`mpc`/`youtube` provider entry) before rendering anything at all — the same
check `video-player.js` uses to decide whether it has anything to embed,
deliberately duplicated here rather than shared via a cross-block signal
(per product: this block should use the same underlying logic the player
itself uses, not depend on whether that block actually loaded/rendered
successfully as a separate concern). A session having *ended* is a
different question from a session *having a video at all* — both gates are
checked independently, and either one failing removes this block.

## Play all

A "Play all" toggle is rendered alongside the topic-playlist title (not
shown for Chapters — advancing to a different session doesn't apply
there). Its state persists to `localStorage` (`video-playlist:play-all`) —
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

The current session is **prepended** to the topic playlist's displayed rows
(`render()` in `video-playlist.js`) and highlighted via the same
`highlightRow` used for the Chapters variant's first chapter — so the
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

Each row is a `<div role="listitem" tabindex="0">`, not a native
`<button>` — see Favorites above for why — with its own `keydown` handler
(Enter/Space) restoring the keyboard activation a real button would give
for free.

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
  `clampedTitleBottom` in `video-playlist.js` — the drawer can never expand
  far enough to fully cover the session title; at least 2 lines of it stay
  visible (Option B, per product decision).
