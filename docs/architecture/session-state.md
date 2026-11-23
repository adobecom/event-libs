# Shared session state and data contracts

[session-store.js](../../event-libs/v1/utils/session-store.js) is a page-level
signal store, initialized idempotently from `tier-1-event-config` metadata.
It fetches the Events catalog, starts the shared MR poller/session-state ticker,
bridges IMS profile updates, and fetches attendee data through RainFocus.
Unlike the timing plugin's one-time status fetch, this shared MR service polls.
See [configurators](configurators.md) for authoring the Global metadata.

## Separate scheduling pipelines

```text
Tier 1 metadata -> session-store -> Events session catalog + MR poller
                               -> RainFocus attendee favorites/schedule
                               -> C2 guide/cards/details/broadcast/playlist

Schedule Maker link -> auto-block mapper -> chrono-box -> timing worker
                                                    -> published fragments
                                                    -> embedded MR streamend
```

The catalog pipeline is independent of
[Schedule Maker](schedule-maker.md) and the [Timing Framework](timing-framework.md).
Attendee `scheduled` and `favorited` signals describe RainFocus user actions,
not page fragment schedules.

## Producer and consumer shapes

Shared catalog records use `startTimeUtc`/`endTimeUtc` ISO dates and provider
fields such as `mrStreamId`, `mpcId`, `youTubeId`, `mrDvrVideoId`, and
`dvrDelayHours`. Page-level `session-times` uses `startTimeMillis`/
`endTimeMillis` and video entries. These differ from Schedule Maker's
`startDateTime`/`fragmentPath`; do not interchange them.
Playback classification and provider-specific rendering are covered in
[video players](video-players.md).

C1 commonly uses BlockMediator (`imsProfile`, `rsvpData`, `eventData`).
C2 catalog surfaces share signals from `session-store.js`: Preact consumers
read `.value`, vanilla consumers subscribe. Replace Sets when mutating signals.
Guide-local Context owns UI-only drawer/view/filter state, not its own copy of
the shared catalog, authentication, or attendee data.

Use `action-feedback.js`/`session-actions.js` for authorization and attendee
mutations rather than writing Sets or calling RainFocus directly.
Event-wide overlap policy comes from Tier 1 `allowDoubleBooking`, not a
guide-local capability flag. For tests and lifecycle verification, see
[testing](testing.md). Existing
[Session Guide implementation notes](../sessions-guide-implementation-notes.md)
provide additional component detail.
