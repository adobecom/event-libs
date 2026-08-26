# youtube-chat

Embeds a YouTube video with an optional live-chat panel, with one visual variant authored via
class name: `rounded-contained` (default: full-bleed, square corners).

## Configuration

Authored as key/value rows on the block:

| Key | Description |
| --- | --- |
| `videoid` | YouTube video ID (required — the block removes itself if missing) |
| `title` | Accessible video title (defaults to "YouTube video player") |
| `autoplay` | `true`/`false` — autoplays the video instead of showing a click-to-play facade |
| `chatenabled` | `true`/`false` — opt-in, off by default. Live chat only renders when this is authored as exactly `true`; any other value (or the row being absent) keeps chat off |
| `show-controls` / `show-player-title-actions` / `show-suggestions-after-video-ends` | `true`/`false` — pass-through YouTube embed player options |

## Variant

Author the block as `YouTube Chat (rounded-contained)` — plain Milo block-modifier syntax — to
match the rounded, contained look the C2 foundation already applies to Milo's own YouTube
auto-block (`.milo-video`) elsewhere on the page: rounded corners, clipped overflow, and a
centered `1192px` max-width, at `≥1024px`.

This treatment applies to **the video player only**. When `chatenabled` is also on and a chat
pane is showing, the video keeps its existing two/three-column layout and square corners
unchanged — the two-column sizing math (video and chat columns matched to the same height) is
incompatible with the fixed `16:9` aspect ratio the rounded-contained look requires, so the
variant only takes effect while the video is shown on its own.
