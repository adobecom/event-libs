# event-youtube

Embeds a YouTube video with an optional live-chat panel.

## Configuration

Authored as key/value rows on the block:

| Key | Description |
| --- | --- |
| `videoid` | YouTube video ID (required — the block removes itself if missing) |
| `title` | Accessible video title (defaults to "YouTube video player") |
| `autoplay` | `true`/`false` — autoplays the video instead of showing a click-to-play facade |
| `chatenabled` | `true`/`false` — opt-in, off by default. Live chat only renders when this is authored as exactly `true`; any other value (or the row being absent) keeps chat off |
| `show-controls` / `show-player-title-actions` / `show-suggestions-after-video-ends` | `true`/`false` — pass-through YouTube embed player options |

## Video styling

While no chat pane is showing, the video player gets the same rounded, contained look the C2
foundation already applies to Milo's own YouTube auto-block (`.milo-video`) elsewhere on the
page: rounded corners, clipped overflow, and a centered `1192px` max-width, at `≥1024px`.

When `chatenabled` is also on and a chat pane is showing, the video keeps its existing
two/three-column layout and square corners instead — the two-column sizing math (video and chat
columns matched to the same height) is incompatible with the fixed `16:9` aspect ratio the
rounded/contained look requires.
