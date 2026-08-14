# Video Playlist (C2)

Authored on an Individual Session Page, alongside a video player block
(Mobile Rider, or a `.milo-video` MPC/YouTube embed) in the **same section**.
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

The Individual Session Page's own `session-times` metadata carries this
session's ready-to-embed `videos[]` — entries shaped like `{ provider:
'mpc', url: 'https://video.tv.adobe.com/v/3458940?autoplay=true&quality=9&
end=nothing&learn=on', kind: 'onDemand' }` — confirmed against real data.
On init, this block reads that metadata (independent of whether the
topic-playlist/chapters list ends up rendering at all) and loads the
`provider: 'mpc'` entry's URL — already fully-formed; nothing is
constructed client-side — into the player mounted alongside it in the same
`.section`.

If a `.milo-video` is already mounted there, its iframe is replaced.
**Real pages have been seen with no video block authored in the section at
all** — in that case (or if only a `.mobile-rider` is present, which can't
host either embed as-is), a fresh `.milo-video` container is built and
inserted as a sibling, mirroring Milo's own `adobetv.js`/`youtube.js`
autoblock markup (same classes/attrs), so it picks up the same global
sizing (`libs/styles/iframe.css`) a real Milo-decorated embed would.

Both `mpc` and `youtube` providers are handled — **`youtube`'s exact url
shape is unconfirmed against real data** (no real sample seen yet), so
`extractYouTubeId()` extracts an id defensively from whatever shape shows
up (embed URL, watch URL, or a bare id) rather than assuming one. YouTube
additionally gets `enablejsapi=1` + an `id` added (Milo's own autoblock
doesn't add these — it never needs to observe player state), needed for
completion tracking below.

## Play all / completion tracking

Once loaded, the current session's player is watched for completion —
mechanism depends on provider, since MPC and YouTube signal it completely
differently:

- **`mpc`**: listens for the `window.postMessage` envelope AdobeTV's own
  player posts — `{ type: 'mpcStatus', state: 'load'|'pause'|'tick'|'complete',
  id, currentTime, length }` from `https://video.tv.adobe.com` (origin-checked).
- **`youtube`**: loads the YouTube IFrame API (`https://www.youtube.com/
  iframe_api`, only if not already present) and watches `YT.Player`'s
  `onReady`/`onStateChange`.

A "Play all" toggle is rendered alongside the topic-playlist title (not
shown for Chapters — advancing to a different session doesn't apply
there). Its state persists to `localStorage` (`video-playlist:play-all`) —
a plain in-memory flag wouldn't survive the full-page navigation that
advancing to the next session's own page requires. When the current video
completes and Play all is on, the block navigates to the **first resolved
topic-playlist row's own page** — that page loads its own video the same
way, continuing the chain indefinitely.

## Watch progress + resume

Every session's own page saves its own watch progress to `localStorage`
(`video-playlist:progress`, keyed by **session id**, not any provider's
video id — only the session's own page ever embeds its video, so which
session is playing is always unambiguous). `saveVideoProgress`/
`getVideoProgress` in `video-playlist.js` read/write this map; the same
data drives two things:

1. **Resume on load** — `MPC_STATE_LOAD` (`resumeMpcVideo`) or YouTube's
   `onReady` seeks the player to the last-saved position, unless that
   position is within `RESUME_RESTART_THRESHOLD_SECONDS` (30s) of the end
   (a finished session shouldn't "resume" 1s before its own end).
2. **Per-row progress bars** — each topic-playlist row reads the matching
   session's saved progress (`computeProgressPercent`) at render time and
   shows it as a filled bar next to the duration. Since a row's own session
   isn't embedded on THIS page, its progress is a snapshot from the last
   time the viewer was on that session's own page, not live.

MPC ticks are throttled to `PROGRESS_TICK_SECONDS` (5s); YouTube has no
equivalent continuous event, so progress is polled via
`getCurrentTime()`/`getDuration()` on the same cadence while
`PlayerState.PLAYING`.

Client-only persistence (no backend field exists for per-viewer watch
progress today).

## Favorites

Each topic-playlist row has a favorite/heart toggle (`isFavorite`/
`toggleFavoriteLocal`, `video-playlist:favorites` in `localStorage`,
keyed by session id) — also client-only; no backend field exists for this
either. The button is a real, separate `<button>` sibling next to the
row's thumbnail/meta (a row can't be a native `<button>` itself once it
needs to contain another `<button>`) — its click handler calls
`stopPropagation()` so favoriting a row never also navigates to it.

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

- **Desktop (≥1024px)**: right-rail, `.section:has(> .video-playlist)`
  becomes a row flex container (no JS DOM-wrapping) — the preceding player
  block takes the remaining space, this block becomes a fixed 360px rail.
  A "Show more" button (topic-playlist only, shown once there are more than
  `SHOW_MORE_INITIAL_ROWS` (4) rows) reveals the remaining rows via a CSS
  `nth-child` cap — independent of the mobile drawer's `is-expanded` state
  below, which covers an unrelated need (the full list already scrolls on
  mobile, so there's no cap there).
- **Mobile (<1024px)**: a `position: fixed` bottom sheet, open on load.
  Collapsing/expanding is governed by `computeDrawerCapPx`/
  `clampedTitleBottom` in `video-playlist.js` — the drawer can never expand
  far enough to fully cover the session title; at least 2 lines of it stay
  visible (Option B, per product decision).
