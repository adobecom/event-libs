# Video Playlist (C2)

Authored on an Individual Session Page, alongside a video player block
(Mobile Rider, or a `.milo-video` MPC/YouTube embed) in the **same section**.
Renders one of two variants automatically — no explicit variant to author:

- **Chapters** — when the current session's `isKeynote` field is true (long-form
  Keynotes/Sneaks content), or when a `chapters` row is authored (see below).
- **Topic playlist** — otherwise: a list of other on-demand sessions sharing a
  topic with the current session, auto-resolved from real session-catalog data.

If there's nothing to show — fewer than the configured minimum on-demand
sessions for the topic playlist, or no chapters authored for the chapters
variant — the block removes itself. There's no empty state.

## Authoring

```
| Video Playlist |  |
| --- | --- |
| session-id | s-100 |
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `session-id` | Yes | — | The *current* page's own session. Drives which topic values (`Playlist on session page`) get matched against other sessions' `Playlist assignment/name`. |
| `playlist-title` | No | `More like this` | Heading shown above the topic playlist. Ignored in the Chapters variant (always titled "Chapters"). |
| `minimum-sessions` | No | `4` | Minimum number of matching on-demand sessions required before the topic playlist renders at all. |
| `chapters` | No | — | JSON array authored for the Chapters variant: `[{"label": "Intro", "timestampSeconds": 0}, ...]`. No backend field exists for this — it's hand-authored per session. |

## How the topic playlist is resolved

Reads the **current session's own** `Playlist on session page` custom
attribute value(s), then filters the full session-catalog (`sessions.value`
from `utils/session-store.js`) for **other** sessions whose `Playlist
assignment/name` includes any of those same values. No mapping table
between the two attributes is needed or maintained — both draw from the
same slug vocabulary. Only sessions in the `'on-demand'` state
(`utils/session-state.js`'s `deriveSessionState`) qualify.

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

## Player switching — explicitly out of scope for this pass

Selecting a topic-playlist row currently **navigates to that session's own
page** (`sessionPageUrl`) rather than swapping the player in place. Real
session pages embed either Mobile Rider or MPC/YouTube depending on the
session — an in-place swap between differently-typed players is a real,
unsolved problem, not attempted here rather than guessed at.

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
