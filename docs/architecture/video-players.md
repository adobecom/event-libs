# Video players and playback surfaces

For foundation loading, see [architecture](overview.md). For page-content
scheduling, see [Timing Framework](timing-framework.md); catalog-backed playback
uses [shared session state](session-state.md) instead.

## MobileRider

The C1/C2 `mobile-rider` blocks load the MR SDK from production or integration
assets according to `getEventConfig().miloConfig.env.name` (default `prod`).
They call `window.mobilerider.embed()` with media/skin IDs and Adobe analytics;
the SDK exposes its player through `window.__mr_player`.

Table configuration includes `videoid`, `skinid`, optional `aslid`, and
`autoplay`/`controls`/`muted` overrides (defaults all true). Link auto-blocking
extracts `videoId`, `id`, or the final path segment, plus `skinId`/autoplay details.
C1 concurrent options use `concurrentenabled` and indexed `concurrentvideoidN`,
title/description/thumbnail/ASL fields; selection can use one-based `?video=N`.
C2 instead supports `show-info-bar: true` with a block/section `session-id` for
catalog-backed information and actions.

Inside chrono-box, the player imports the Timing Framework's `mobileRiderStore`.
The plugin initially requests unique media statuses in batches of up to 50 IDs,
handling unknown-ID 404s with bounded retries/per-ID fallback. Non-successful
statuses are initialized inactive. This plugin does **not** continually poll:
subsequent player `streamend` events mark tracked media inactive and broadcast
to the worker. Preserve this read/write connection when changing embedding,
ASL replacement, or concurrent-video selection.

`avoidStreamEndFlag=true` disables the player's stream-end listener and the
worker's MR hold/end rules. See the [timing QA contract](timing-framework.md#timing-qa);
do not implement a player-side-only approximation.

## Other player surfaces

| Surface | Player and scheduling ownership |
| --- | --- |
| C1 `youtube-chat` | `youtube-nocookie.com` video embed plus optional YouTube chat. Authored `videoid`, `chatenabled`, autoplay/mute/control options. No MR timing-plugin connection. |
| C2 `event-youtube` | YouTube embed/chat with lightweight or autoplay path and shared YouTube tracking. Broadcast reuses its `YouTubeChat` class. |
| Milo video assets | Marquee background decoration and already-decorated `.milo-video` assets remain Milo-owned; do not reimplement Milo's video blocks. |
| C2 `session-video-player` | On-demand uses `mpc`/`youtube` entries from `session-times`, then catalog-shaped metadata fallback. DVR-buffer uses `mrDvrVideoId` through the C2 MR block. It does not embed watch-live/simulive phases. |
| C2 `session-broadcast` | `PlayerHost` mounts YouTube or MPC adapters. MPC imports Milo's `adobetv`; YouTube uses `event-youtube`. MobileRider currently renders an unsupported-player message, not an implemented adapter. |

[video-session.js](../../event-libs/v1/c2/utils/video-session.js) classifies LIVE,
IPOD, and SIMULIVE playback and derives pre-event, simulive, watch-live,
DVR-buffer, or on-demand phases. MR activity and DVR timing affect the result;
simulive has a five-minute pre-roll. `session-video-playlist` renders only for
on-demand, not DVR-buffer.

`session-broadcast` has its own catalog schedule resolver and five-second refresh.
Automatic advancement remains within a provider bucket; manual switching can
cross buckets. Neither it nor the session-detail player is driven by the
Schedule Maker worker.

## Progress and layout coordination

`session-video-player` saves progress under `session-video-playlist:progress`.
MPC uses origin-checked `mpcStatus` messages; YouTube uses its iframe API.
Progress/state/playability events update the playlist. Play all navigates to the
next session page after completion.

`videoLayoutDecision` and `videoPlayable` in BlockMediator coordinate full-width
versus playlist player containers. Keep producer/consumer announcements consistent
so players do not wait forever or mount twice. See [testing](testing.md) for
SDK mocks and browser verification requirements.
