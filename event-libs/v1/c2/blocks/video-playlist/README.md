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
is needed or maintained — both draw from the same slug vocabulary. Only
sessions in the `'on-demand'` state (`utils/session-state.js`'s
`deriveSessionState`) qualify. `isKeynote`/Chapters detection follows the
same page-metadata-first pattern, via the page's own `session-type` value.

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

## Player switching

Rows carry an `mpcId` when the target session's `MPC ID` custom attribute
is present (extracted by `sessions-api.js`, same pattern as
`playlistAssignment`/`playlistOnSessionPage`). Selecting such a row swaps
the player already mounted alongside this block (`.milo-video` or
`.mobile-rider`, in the same `.section`) for a freshly built AdobeTV
iframe — `video.tv.adobe.com/v/{mpcId}?autoplay=true&quality=9&end=nothing&
learn=on` — in place, no full page reload.

**Still out of scope**: rows without an `mpcId` (Mobile-Rider-hosted
sessions) fall back to navigating to that session's own page
(`sessionPageUrl`). No YouTube-specific custom attribute has been confirmed
in real session data yet, so YouTube rows also fall back to navigation
today — if/when that attribute name is confirmed, it should extract into
its own field the same way `mpcId` does, rather than guessed at.

## Responsive layout

- **Desktop (≥1024px)**: right-rail, `.section:has(> .video-playlist)`
  becomes a row flex container (no JS DOM-wrapping) — the preceding player
  block takes the remaining space, this block becomes a fixed 360px rail.
  A "Show more" toggle expands it to 175% width with a scrollbar.
- **Mobile (<1024px)**: a `position: fixed` bottom sheet, open on load.
  Collapsing/expanding is governed by `computeDrawerCapPx`/
  `clampedTitleBottom` in `video-playlist.js` — the drawer can never expand
  far enough to fully cover the session title; at least 2 lines of it stay
  visible (Option B, per product decision).
