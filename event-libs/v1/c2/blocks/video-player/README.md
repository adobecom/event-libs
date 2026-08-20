# Video Player (C2)

Authored on an Individual Session Page, in its own grid-column fragment
(alongside a separate `video-playlist` block, in a different grid-column
fragment — see that block's own README for the topic playlist/chapters
list). This block handles embedding and tracking the current session's own
video only; it does not resolve or render any playlist itself.

Split out of what was originally a single `video-playlist` block, once the
session-page template moved to a two-column `grid-column` layout (player |
playlist) where each column loads its own fragment independently — the two
blocks no longer share a DOM section, so player-embedding couldn't stay
coupled to the playlist's own rendering. They communicate only through
`localStorage` and a page-wide `CustomEvent`, never a direct reference, so
either can load independently in either order, regardless of which grid
column/fragment it's authored in.

## Authoring

The Individual Session Page template already carries the current session's
own identity as **page metadata** — `session-id` and `session-times` (this
session's own ready-to-embed `videos[]`) — so nothing needs to be authored
on the block itself:

```
| Video Player |  |
| --- | --- |
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `session-id` | No | page's own `session-id` metadata | Only needed as a fallback if that metadata is missing. |

If the current session hasn't ended yet (checked against its own
`session-times` `endTimeMillis`), or it has no embeddable video source at
all, this block removes itself. There's no empty state.

## Loading the current session's own video

The Individual Session Page's own `session-times` metadata carries this
session's ready-to-embed `videos[]` — entries shaped like `{ provider:
'mpc', url: 'https://video.tv.adobe.com/v/3458940?autoplay=true&quality=9&
end=nothing&learn=on', kind: 'onDemand' }` — confirmed against real data.
On init, this block reads that metadata and loads the `provider: 'mpc'`
entry's URL — already fully-formed; nothing is constructed client-side —
into itself.

If a `.milo-video` is already mounted inside this block, its iframe is
replaced. **Real pages have been seen with no video block authored at
all** — in that case (or if only a `.mobile-rider` is present, which can't
host either embed as-is), a fresh `.milo-video` container is built and
appended, mirroring Milo's own `adobetv.js`/`youtube.js` autoblock markup
(same classes/attrs), so it picks up the same global sizing
(`libs/styles/iframe.css`) a real Milo-decorated embed would.

Both `mpc` and `youtube` providers are handled — **`youtube`'s exact url
shape is unconfirmed against real data** (no real sample seen yet), so
`extractYouTubeId()` extracts an id defensively from whatever shape shows
up (embed URL, watch URL, or a bare id) rather than assuming one. YouTube
additionally gets `enablejsapi=1` + an `id` added (Milo's own autoblock
doesn't add these — it never needs to observe player state), needed for
state tracking below.

## Playback state reporting

This block only **reports** raw playback state — it makes no decision
about what should happen when the video ends (e.g. whether to advance to
another session). Mechanism for detecting state depends on provider, since
MPC and YouTube signal it completely differently:

- **`mpc`**: listens for the `window.postMessage` envelope AdobeTV's own
  player posts — `{ type: 'mpcStatus', state: 'load'|'pause'|'tick'|'complete',
  id, currentTime, length }` from `https://video.tv.adobe.com` (origin-checked).
  `tick` (which only ever arrives while actually playing) maps to `'play'`,
  `pause` to `'pause'`, `complete` to `'ended'`.
- **`youtube`**: loads the YouTube IFrame API (`https://www.youtube.com/
  iframe_api`, only if not already present) and watches `YT.Player`'s
  `onReady`/`onStateChange`, mapping `PLAYING`/`PAUSED`/`ENDED` the same way.

Either path dispatches a page-wide `video-player:state` `CustomEvent`
(detail: `{ sessionId, state }`) on `window` for each transition. The
`video-playlist` block (a separate block/fragment, if present on this
page) is the one that actually owns the "Play all" decision — it listens
for this event, reads its own `video-playlist:play-all` toggle state on
`'ended'`, and resolves/navigates to the next session by reading
`data-href` off its own rendered rows. This block has no knowledge of
"Play all," the topic playlist, or where "next" even is — see
`video-playlist`'s own README for that logic.

## Watch progress + resume

This block saves the current session's own watch progress to
`localStorage` (`video-playlist:progress`, keyed by **session id**, not
any provider's video id — only the session's own page ever embeds its
video, so which session is playing is always unambiguous). `saveVideoProgress`/
`getVideoProgress` here read/write this map; the same data drives two things:

1. **Resume on load** — `MPC_STATE_LOAD` (`resumeMpcVideo`) or YouTube's
   `onReady` seeks the player to the last-saved position, unless that
   position is within `RESUME_RESTART_THRESHOLD_SECONDS` (30s) of the end
   (a finished session shouldn't "resume" 1s before its own end).
2. **Live progress updates elsewhere on the page** — whenever progress is
   saved, this block dispatches a page-wide `video-player:progress`
   `CustomEvent` (detail: `{ sessionId }`) on `window`. `video-playlist.js`
   (a separate block, if present) listens for this to update its own
   "now playing" row's progress bar/duration live, without either block
   referencing the other directly.

MPC ticks are throttled to `PROGRESS_TICK_SECONDS` (5s); YouTube has no
equivalent continuous event, so progress is polled via
`getCurrentTime()`/`getDuration()` on the same cadence while
`PlayerState.PLAYING`.

Client-only persistence (no backend field exists for per-viewer watch
progress today).
