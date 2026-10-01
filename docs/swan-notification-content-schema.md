# SWAN Notification Content: the `timeline` Payload Schema

`channel_details.payload` (see [swan-unc-dependencies.md](./swan-unc-dependencies.md)) must
contain a `timeline` block for the notification card to render. UNC's official web-host wiki
states this requirement but gives no schema for the block's own shape. This doc records what
was reverse-engineered from a real fetched example plus a direct read of UNC's rendering code
(`OneAdobe/unc`, branch `anjali1/MAX`) — `src/UX/NotificationBaseObject.jsx`,
`src/UX/components/BaseTimeline/BaseTimelineNotification.jsx`,
`src/UX/EventNotificationUtils.jsx`, `src/UX/Utils.jsx`, `src/UX/components/RenderingUtility.jsx`.

**Confidence**: field shape and rendering-gate behavior are source-confirmed (not just
inferred from the one example). Actual visual rendering has not been confirmed against a
real Widget/bell — recommend one live QA pass before treating this as fully done.

## Why `viewtype: 'eventTimeline'`

`NotificationBaseObject.initPayload()` silently drops a notification entirely (no error
surfaced anywhere) if `payload.timeline` is missing, or if `payload.timeline.viewtype` isn't
one of a fixed 8-value enum (`simpleTimeline1`, `inviteTimeline`, `inviteCommentTimeline`,
`commentTimeline`, `multipleIconsTimeline`, `commentCTATimeline`, `commentActionTimeline`,
`eventTimeline`). SWAN uses `'eventTimeline'` specifically — the viewtype built for go-live/
expire countdown content, gated on `eventData.title`/`goLiveTime`/`goLiveExpireTime` all
being present (`EventNotificationUtils.js`: omit any one and "event-specific UI won't
render"). This matches SWAN's actual use case (a session with a start/end time) exactly —
`'simpleTimeline1'` would ignore `eventData` entirely and lose that countdown UI.

## Field-by-field mapping

| Source (session/swanConfig) | Destination | Notes |
| --- | --- | --- |
| `'eventTimeline'` (constant) | `timeline.viewtype` | Required — silently drops the notification if missing/invalid. |
| `session.title` \|\| fallback, + a per-stage phrase | `timeline.content` | Required for **all** viewtypes, not just `eventTimeline` — rendered as sanitized HTML body text (`BaseTimelineNotification.jsx`). Varies by stage (reminder/live/on-demand) so the three notifications don't render identically. |
| `true` (constant) | `timeline.dismissOnClick` | Read by `RenderingUtility.handleDefaultAction`. A judgment call (dismiss once the user acts on it), not spec-mandated. |
| `session.title` \|\| fallback | `timeline.eventData.title` | Only read for `viewtype: 'eventTimeline'` specifically. |
| `session.startTimeUtc` | `timeline.eventData.goLiveTime` | Epoch **seconds, as a string** — matches the real example's format exactly. |
| `session.endTimeUtc` | `timeline.eventData.goLiveExpireTime` | Epoch **seconds, as a string**. |
| `session.thumbnailUrl` \|\| track-icon URL \|\| `swanConfig.defaultNotificationIconUrl` \|\| `''` | `timeline.serviceIconDetails.serviceIcon` | Confirmed icon-resolution field (`Utils.getAvatarIconURLAndServiceIconInfo`) — SWAN has no avatar/asset icon, so this is still the only-populated slot. Same source precedence as feds mode's `iconUrl`/`trackIconName` (`buildNotificationEntry`), collapsed into one URL because UNC's plain `<img>` renderer (`BaseTimelineNotification.jsx`) has no client-side thumbnail-then-track-icon fallback the way feds mode's `notification-widget.js` does, so the choice must be fully resolved at payload-build time. The track-icon URL comes from `getOverrideTrackIcon`/`getTrackIcon` (`tier-1-event-config.js`) resolved to a bare URL via `buildFederalTrackIconUrl` (`features/icons/federal-icons.js`) — the same federal CDN path feds mode fetches and inlines as an SVG. |
| `session.sessionPageUrl` (resolved to an absolute URL) | `timeline.defaultAction.url` | Confirmed click-through target (`RenderingUtility.handleDefaultAction`). |

## Known limitation: no per-track color tinting in UNC (accepted gap)

Feds mode recolors the track-icon SVG (`black` fill/stroke → `currentColor`, via
`federal-icons.js`'s `useCurrentColorForBlack`) so a per-track CSS `color` can tint it, using
the `color` field `getTrackIcon`/`getOverrideTrackIcon` return alongside `icon`. UNC's
renderer only ever paints a plain `<img src={...}>` (`BaseTimelineNotification.jsx`) — there
is no SVG inlining, no `currentColor` support, and no color/tint field anywhere in UNC's
contract or engine. UNC-mode notifications therefore show the correct track-icon *shape*, in
that icon's own authored (untinted) artwork colors, never per-track-tinted the way feds mode
is. This is a platform limitation, not something `swan-payload.js` alone can close — accepted
as out of scope.

## Fields deliberately omitted, and why

- `_path`, `_id`, `_variation`, `_variations`, `_metadata`, `_model`, `_tags` at every level —
  confirmed unread by any rendering code path found. Pure AEM Content-Fragment GraphQL
  provenance/bookkeeping, present in the real example only because it came from a live fetch
  (what `contentURL` would otherwise fetch) — irrelevant when delivered inline via `payload`.
- `pinnedCategory`, `announcementNotification`, `onDemandUrl`, `assetIconDetails`,
  `onDemandSSODetails` — feature-specific (comment/invite/announcement notification types) or
  have no equivalent session data.
- `defaultAction`'s CCD-specific sub-fields (`deepLinkWorkflows`, `aupWorkflowDetails`,
  `ccdRoutePath`, `fallbackURL`, `needSSO`, `targetClientID`, `targetScope`, `SSODetails`) —
  confirmed CCD-desktop-only routing/SSO fields, dead weight for a plain web URL click-through.
- `filterDetails` — confirmed inert *unless* the host explicitly configures
  `uiConfig.acceptNotificationsForSurface` at UNC init. SWAN never initializes UNC itself (it
  resolves UNav's already-initialized shared instance), so this should be a non-issue — but
  this is an assumption about UNav's own init config, not directly verified from this repo.
- A separate `image` field (distinct from an icon) — the real example has only one icon-like
  slot; there was never a second one to map to.

## Real example used as reference

`https://odin.adobe.com/content/dam/ccsurfaces/engg-test/en_US/local-notification/max-sample-teamplate.cfm.gql.json`
— what `contentURL` would otherwise fetch for a MAX-branded reminder. This is a full AEM
Content-Fragment GraphQL response, not a minimal hand-authored example — most of its fields
are the bookkeeping listed above.

## Open items

- Live QA against a real UNC Widget/bell to confirm the card actually renders as expected —
  source-reading confirms shape and rendering-gate behavior, not the final visual result.
- `notification_type`/`notification_subtype` (sibling fields in `channel_details`, not part of
  `timeline` itself) deliberately do not copy the wiki's example values verbatim — see
  [swan-unc-dependencies.md](./swan-unc-dependencies.md) for why.
