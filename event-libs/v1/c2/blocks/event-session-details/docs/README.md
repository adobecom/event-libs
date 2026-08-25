# Session Details Page

Covers the four C2 blocks that make up the MAX 2026 Individual Session Page
([MWPW-200288](https://jira.corp.adobe.com/browse/MWPW-200288)):

| Block | Ticket | Role |
|---|---|---|
| `event-session-details` | MWPW-203474 | Anchor block — eyebrow, title, copy, action row, abstract |
| `event-session-resources` | MWPW-203473 | Downloadable/openable session files |
| `event-featured-products` | MWPW-203469 | Product tiles linking to product pages |
| `event-speakers` | MWPW-203471 | Speaker avatar + name/role rows |

Mobile-first. Desktop layout is owned by the section-grid feature, not by these blocks.

## Data sources: page metadata vs. the catalog

The split matters, because it decides what is available synchronously.

**Page metadata (synchronous, no fetch).** Individual Session Pages carry the session's
own identity in `<head>`: `session-id`, `session-times` (a JSON array whose entries hold
`startTimeMillis` / `endTimeMillis` / `timezone` and a `videos[]` sibling),
`custom-attributes` (the raw RainFocus `customAttributes` blob), `description`,
`speakers`, `material-list`, `title`, `url`, `session-length-in-minutes`. Everything the
state engine and all four blocks render comes from here.

**The RainFocus catalog (async).** Only the favorite / add-to-schedule actions need it,
via `utils/session-store.js` (`initSessionState()` → `sessions`, `favorited`,
`scheduled`, `auth` signals). Favorite keys on `rfSessionId`, schedule on `rfCode` —
neither is in page metadata, so those two CTAs resolve a minimal session immediately and
upgrade to the real catalog object when it lands.

## `event-session-details`

`init()` mounts sub-features in mobile stack order:

```
eyebrow (track tags | status) → title → GDPR/IPOD copy → closed caption
→ [primary CTA + favorite + share] → description clamp → quick facts → legal disclaimer
```

It calls `initTierOneEventConfig()` first so `getTrackIcon`/`getProduct` can read the
Tier 1 Event Configurator config; the call is idempotent and no-ops if `decorateEvent`
already ran it.

The status slot is created as a **persistent live region**
(`role="status" aria-live="polite"`) — see Accessibility below.

## Session state engine (`session-state-view.js`)

State is a **pure client-side time comparison**, per the ticket — there is no status
field to read, so it never waits on the catalog:

| State | Condition | Eyebrow | Closed captions |
|---|---|---|---|
| `upcoming` | `now` is before every slot's start | `Nov 11, 9:00 AM PST` | hidden |
| `live` | `now` is inside **any** slot (inclusive) | red dot + `Live` | hidden |
| `on-demand` | anything else — after a slot, or between slots | `On-demand` / `Coming soon` | shown |

The **primary CTA is resolved separately from the state**, because "can I still schedule
this?" is not the same question as "is it on now?":

| Condition | Primary CTA |
|---|---|
| `live` | Watch now |
| `now < finalEnd` (the latest slot's end) | Add to schedule |
| otherwise | none |

Transitions happen with **no reload**: `evaluate()` re-arms a `setTimeout` at the next
boundary. Delays are clamped to `MAX_TIMEOUT` (`2**31 - 1`) and re-armed, because a
far-future session would otherwise overflow a 32-bit delay and fire immediately.

### Multiple time slots

A session can hold several `session-times` entries — a repeat in-person lab, or a 10am
session with a 6pm premiere. `getAllSessionTimes()` returns **every** slot, **sorted by
start**, each with its own `session-length-in-minutes` end fallback. `getSessionTimes()`
returns the earliest, and is what the `upcoming` eyebrow date renders from.

**Sorting is load-bearing, not tidiness.** RainFocus does not order `sessionTimes`
chronologically: of the 40 published multi-slot MAX26 sessions, **21 have a first array
entry that is not the earliest** (e.g. `L6317` is `[Nov 12 13:30, Nov 11 08:00]`). Reading
index 0 would show the later date in the eyebrow and report `upcoming` straight through the
session's real first occurrence. `mapEslPayloadToRawSessions()` sorts for the same reason.

`getState()` accepts either a slot array or a single `{start, end}`, so a 10am/6pm session
walks `upcoming → live → on-demand → live → on-demand`, and `nextBoundary()` finds the
soonest of every remaining start and end — so the page wakes for the premiere instead of
stopping at the first slot's end. It returns `null` only once all slots have ended, which
is what finally cancels the timer.

**The video player is not involved.** It stays gated on post-event and does not react to
these transitions; between slots the on-demand recording is what shows. The only thing that
changes across a premiere boundary is the eyebrow status and the primary CTA.

### "Coming soon" — IPOD sessions with no recording yet

An `on-demand` session reads **"Coming soon"** instead of "On-demand" when it is an IPOD
session whose recording has not been attached. Both signals come from page metadata.

**IPOD (In-Person On Demand)** — delivered in person, then posted as a recording. There
is **no explicit IPOD attribute**; the classifier is the `Format` custom attribute
carrying **both** `in-person` **and** `on-demand-post-event`. Format values are compared
on an alphanumeric-only normalization, because the same value appears as the slug
`on-demand-post-event` and the label `On demand, post event`, and real data includes
values with an empty label.

Only IPOD qualifies because only IPOD has a real gap: an online session's recording is
essentially its stream archive and lands immediately, whereas the real MPC template
carries `DVR Timing (in hours)` of **772** (~32 days).

**Has a recording** — `hasPlayableVideo()` looks for an entry in `session-times[].videos[]`
whose `provider` is `mpc` or `youtube`, **excluding `kind: 'liveStream'`**. A session keeps
its livestream URL after it ends, and that is not the recording; without the exclusion a
stale entry would claim "On-demand". Real data carries all three kinds on one session:

```json
[ { "provider": "youtube",     "kind": "liveStream", "url": "…/watch?v=…" },
  { "provider": "mpc",         "kind": "onDemand",   "url": "…/v/3433462?…" },
  { "provider": "mobilerider", "kind": "dvr",        "url": "…/video/…" } ]
```

Behavior matrix:

| Format | Recording | Status |
|---|---|---|
| in-person + on-demand-post-event | none | **Coming soon** |
| in-person + on-demand-post-event | present | On-demand |
| online / post-event only / in-person only / no Format | either | On-demand |

`renderStatus` adds `session-status--coming-soon` for the pending case; it carries no
styling of its own, so the state is targetable if design wants it differentiated.

See [known-issues.md](known-issues.md) for the `liveStream` divergence from
`video-player` and the `mobilerider`/`dvr` question.

### Watch now destination

`renderWatchNow()` resolves the href through `getWatchDestination()` (Daniel Oliva's
helper in `utils/session-state.js`), fed a session object built from **page metadata** so
the link stays on the no-catalog path:

| Field it reads | Page source |
|---|---|
| `isLivestreamed` | `Livestreamed Content` attribute `=== 'live'` |
| `isOnline` | `Format` attribute includes `online` |
| `sessionPageUrl` | the page's own `url` metadata |

`BROADCAST_URL` is a **fallback only**, used when the helper yields nothing. The real URL
is to be sourced from config inside `getWatchDestination` — see known-issues.

## Favorite, Add to schedule, Share

**Favorite** (`favorite.js`) and **Add to schedule** (`schedule.js`) reuse the production
engine rather than reimplementing it: `toggleFavoriteWithFeedback` /
`toggleScheduleWithFeedback` from `services/sessions/action-feedback.js`, which fire the
login/registration toast and the schedule-conflict modal automatically. Each paints from
its signal (`favorited` / `scheduled`), so state survives changes made elsewhere on the
page.

Both start from a minimal `{ id }` session so the control renders immediately, then
subscribe to `sessions` and swap in the real catalog object once it arrives (needed for
`rfSessionId` / `rfCode`).

**Share** (`share.js`) uses `navigator.share` where available, else copies the link and
shows the shared `features/toast/toast.js` toast. It reads the published `url` + `title`
metadata, falling back to the current document.

## Track tags (`track-tags.js`)

Eyebrow labels — leading icon + track name, one per row, stacked for multiple tracks, no
pill/badge background. Order:

1. `Override Primary Event Site Track` (free text) **replaces** Primary when present
2. else `Primary Event Site Track` (single-select label)
3. then `Additional Event Site Tracks` (multi-select labels), stacked after

Icons and colors come from the Tier 1 Event Configurator: `getOverrideTrackIcon()` for
override tracks (per-text map, then the event-wide default), `getTrackIcon()` for regular
ones, with `DEFAULT_ICON_COLOR` as the color fallback — the same model as
`resolveTrackBadge` in `sessions-guide`. The slug resolves through `resolveIcon` (Milo
icons → `track-icons.svg` sprite). A generic star is the fallback for an Override with no
Primary behind it and no configured icon.

## Quick facts, disclaimers

**Quick facts** (`quick-facts.js`) renders a `<dl>` of label/value rows from
custom-attributes, ordered per the MWPW-200288 abstract: Technical level, Track, AI
Focus, Audience, Category. Each row renders only when its attribute has values.

`Product` is deliberately **not** a quick fact, even though the abstract lists it —
`event-featured-products` already renders the same `Product` attribute as tiles on the same
page, so a row here duplicated it.

**Disclaimer / CC / Legal** (`disclaimer-cc-legal.js`) renders three verbatim text slots,
each only when its attribute is populated: `IPOD or GDPR Copy` (under the title),
`Closed Caption Information` (under the title, visibility state-gated by the state
engine), `Legal Disclaimer` (end of the abstract).

## Description clamp (`description-clamp.js`)

The description collapses to `--desc-lines` (6) via a native `line-clamp`, with a Show
more/less toggle. No character-count truncation — line-based, so it stays responsive.

The clamp's **automatic ellipsis is the affordance**. It replaced an earlier
gradient-fade-to-card: fading otherwise-legible text pushes it under the 4.5:1 contrast
minimum (WCAG 1.4.3), while the ellipsis renders at full contrast. Same `-webkit-box` +
`line-clamp` pattern already used by `profile-cards` and `sessions-hub`, including the
same stylelint exception.

The toggle is revealed only when the text actually overflows. Line count depends on width
**and** the loaded font, both of which settle after first paint, so a single check misses:
a `ResizeObserver` on the paragraph catches width/layout changes and `document.fonts`
`loadingdone` catches the late web-font swap, so it self-corrects without a resize.

## `event-session-resources`

Rows of "name … Open/Download" from the top-level `material-list` (RainFocus `files[]`),
filtered to entries that are published and have a `fileURL`. "No resources" empty state
when none qualify. Links open in a new tab. First 2 shown, rest revealed by Show more;
two-up grid from 900px.

**Row label** comes from `fileTypeName` ("Session slides"), **not** `fileName` — authored
file names are frequently unusable (`Screenshot 2026-08-13 at 11.23.26 AM.png`,
`Magdiel_Lopez_MAX_2026_Session_Outline`). With no `fileTypeName`, it falls back to the
URL's extension: `Resource (PDF)`, `Resource (PPTX)` (query stripped, uppercased), or
plain `Resource` when there is no extension.

**CTA label** is inferred from the file URL — `Download` for known document/media
extensions, else `Open`. RainFocus may later supply explicit CTA text.

**Download gating.** `Download` CTAs require sign-in **and** event registration;
`Open` links are ungated. The click calls `assertAuthorized()` (the shared guard behind
`checkViewAccess` and both toggle actions) and, on failure, `preventDefault()`s and shows
the same login/registration toast via the now-exported `showAuthToast`. Gating on click
rather than rendering a disabled link means the row works the moment the visitor signs in,
with no re-render.

`initSessionState()` **must** be called for this to work — `auth` defaults to
`{ isLoggedIn: null }` and the guard throws unless `isLoggedIn === true`, so without it
every click is blocked, including signed-in users.

⚠️ This is a **UX gate, not access control** — see known-issues.

## `event-featured-products`

Tiles (colored product logo + name + ↗ arrow) from the `Product` custom-attribute. Icon
and page link per product come from the Tier 1 Event Configurator's `products` map
(`getProduct` → `{ icon, pageUrl }`); logos are colored SVGs resolved via
`fetchFederalProductIcon`. Icons only render for products present in that map. A product
with no `pageUrl` renders as a non-interactive `<span>` rather than a fake link. Count
shown next to the title; 2-col grid; links open in a new tab.

## `event-speakers`

Avatar + name + title/company rows from the top-level `speakers` JSON, count next to the
title, first 5 shown.

Photo shape differs by source: da.live sync nests `speaker.photo.imageUrl` (+ `altText`),
the RainFocus API returns a flat `photoURL`. Both are supported, with an initials fallback
when a speaker has no headshot.

## Show-more limits

| Block | Shown before "Show more" | Constant |
|---|---|---|
| Session resources | 2 | `MOBILE_LIMIT` |
| Speakers | 5 | `MOBILE_LIMIT` |
| Featured products | 6 | `VISIBLE_LIMIT` |
| Description | 6 lines | `--desc-lines` |

Unconfirmed against the ticket — see known-issues.

## Accessibility decisions

These are deliberate and were verified; changing them regresses a WCAG criterion.

- **Status is a live region.** The eyebrow status slot is created once as
  `role="status" aria-live="polite"` and its contents updated. The state changes on a
  **timer** at the session boundary, not from a user action, so the swap has to be
  announced (4.1.3).
- **The CTA swap defers while focused.** If the boundary fires while the user is on
  "Add to schedule", replacing it would remove the focused element and drop focus to
  `<body>` (2.4.3). `setCta()` holds the new CTA in `pending` and applies it on
  `focusout`. `apply()` sets the CTA **before** the status so the announcement lands on a
  DOM that already offers it.
- **Favorite:** stable accessible name + `aria-pressed`. **Schedule:** no `aria-pressed`,
  because its visible label itself flips to "Added to schedule" — setting both
  double-announces the state, and a fixed name would contradict the visible text (2.5.3
  Label in Name).
- **Injected SVGs get `aria-hidden` + `focusable="false"`.** `resolveIcon` and
  `fetchFederalProductIcon` return raw sprite SVGs that may carry a `<title>`, which would
  otherwise be announced alongside the adjacent label — or added to a tile link's
  accessible name (1.1.1, 4.1.2).
- **Speaker photo `alt` falls back to `''`, not the name.** The name is the very next
  element, so a name fallback announces it twice; the initials placeholder is
  `aria-hidden` for the same reason (1.1.1).
- **Resource CTAs are named.** `aria-label` is `Download <name> (opens in new tab)` —
  visible text is only "Open"/"Download" and the name is a sibling, so a link list would
  otherwise be a row of identical "Download"s (2.4.4, 3.2.5). Product tiles announce the
  new tab too.
- **All four Show more toggles** are real `<button>`s with `aria-expanded` maintained on
  every toggle and `aria-controls` pointing at the region, using a per-instance id counter
  so multiple instances on a page stay unique (1.3.1). Chevron rotation is driven from
  `[aria-expanded="true"]` in CSS so the visual state cannot drift from the announced one.
- **Live status is not color-alone.** The red dot is `aria-hidden` and the word "Live" is a
  sibling (1.4.1).
- **Card/tile borders use `--s2a-color-gray-500` (`#8f8f8f`, 3.23:1).** It is the lightest
  step in the ramp that clears the 3:1 required for a UI component boundary — `gray-300`
  is 1.64:1 and `gray-400` only 1.71:1, so there is no intermediate token. This matters
  more now that rows are white on a non-white card, where the fill difference alone is
  ~1.17:1 and the border is the only perceivable boundary (1.4.11).
- **Focus rings** use `outline: 2px solid var(--s2a-color-gray-1000, #000)` with
  `outline-offset: 2px` on `:focus-visible`, matching the C2 convention. Nothing sets
  `outline: none`.
