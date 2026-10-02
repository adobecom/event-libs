# event-youtube

Embeds a YouTube video with an optional live-chat panel.

## Configuration

Authored as key/value rows on the block:

| Key | Description |
| --- | --- |
| `videoid` | YouTube video ID (required — the block removes itself if missing) |
| `title` | Accessible video title, also used for the click-to-play label. Takes precedence over the legacy `videotitle` key; defaults to "YouTube video player" when neither has a non-blank value |
| `videotype` | `live` or `vod` for analytics. Defaults to `vod`, independently of chat. Values are trimmed and case-normalized; invalid values log a warning and use `vod`. Authors must set `live` for live streams, even when chat is disabled |
| `autoplay` | `true`/`false` — autoplays the video instead of showing a click-to-play facade |
| `chatenabled` | `true`/`false` — opt-in, off by default. Live chat only renders when this is authored as exactly `true`; any other value (or the row being absent) keeps chat off |
| `show-controls` / `show-player-title-actions` | `true`/`false` — pass-through YouTube embed player options |
| `show-suggestions-after-video-ends` | Legacy key; no longer overrides `rel=0`, which is required by the analytics contract |

## Analytics integration

Each video iframe has a unique ID beginning with `player-`. Both autoplay and
click-to-play URLs include `enablejsapi=1`, `rel=0`, and the resolved `videotype`.
The privacy-enhanced embed host remains `www.youtube-nocookie.com`.
ID generation, required parameters, and once-only Launch registration are shared
with `session-video-player` through `c2/utils/youtube-analytics.js`.

The block calls `window._satellite.track('trackYoutube')` once per inserted video
iframe, after it is connected to the document and `document.readyState` is
`complete`. Click-to-play does not register until the facade is activated.
Chat iframes are not registered. Players removed before document completion are
not registered.

Launch owns the YouTube plugin, Heartbeat libraries, and play/pause/progress/
completion reporting. The block does not install an IFrame API readiness
callback or load analytics scripts. If Launch or its track method is unavailable
at registration time, the block logs a warning without retrying. Tracking errors
are logged without interrupting video playback or chat.

JavaScript consumers should use `YouTubeChat.mountStream(connectedParent)` to
build, insert, and register a player. `buildStream()` remains a detached-markup
builder and does not register analytics on its own. The session-broadcast
adapter uses the shared mount path with `videotype: 'live'`.

### Release verification

Marketing Tech must confirm that the current post-AEP Launch rule detects
`youtube-nocookie.com` and supports this registration timing, including multiple
independently tracked players. Confirm play, pause, progress, and completion
Heartbeat requests on a preview using the intended Launch configuration, and
verify the resulting video data in Adobe Analytics.

Unit tests can verify the iframe contract and registration calls, but cannot
prove Heartbeat delivery. Verify autoplay, click-to-play, chat, and Core Web
Vitals against the existing page baseline before release.

## Video styling

While no chat pane is showing, the video player gets the same rounded, contained look the C2
foundation already applies to Milo's own YouTube auto-block (`.milo-video`) elsewhere on the
page: rounded corners, clipped overflow, and a centered `1192px` max-width, at `≥1024px`.

When `chatenabled` is also on and a chat pane is showing, the video keeps its existing
two/three-column layout and square corners instead — the two-column sizing math (video and chat
columns matched to the same height) is incompatible with the fixed `16:9` aspect ratio the
rounded/contained look requires.
