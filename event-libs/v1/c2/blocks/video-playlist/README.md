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
host an AdobeTV iframe as-is), a fresh `.milo-video` container is built and
inserted as a sibling, mirroring Milo's own `adobetv.js` autoblock markup
exactly (same classes/attrs), so it picks up the same global sizing
(`libs/styles/iframe.css`) a real Milo-decorated embed would.

**Out of scope**: no `youtube` provider has been confirmed in real session
data yet — if/when one is, its embed convention (is `url` already an
embeddable iframe src, or does it need conversion like a watch URL?) needs
confirming before wiring it the same way `mpc` is wired today.

## Row selection

Selecting a topic-playlist row **navigates to that session's own page**
(`sessionPageUrl`) rather than swapping the player in place — real
session-catalog data has no per-row video source (only the current
session's own page carries `session-times`), so there's nothing to swap
to. Navigating is always correct regardless: the destination page loads
its own video the exact same way, via its own `session-times` metadata.

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
