# Sessions Guide — implementation notes

Rationale that used to live in code comments. `event-libs` is **buildless** — every module
is served to the browser exactly as written, so comments are bytes every visitor downloads.
Anything longer than a line or two belongs here instead.

Code keeps only short markers. Where one points here, the heading is named in the comment.

---

## sessions-api.js

### sessionPageUrlForEnv

The catalog returns each session's real page URL but always on prod's host. A stage or local
visitor must not be sent to production, so the host is rewritten for any non-prod page. Keyed
on **Milo's page env**, not the ESP tier — the same distinction, for the same reason, as
`session-store.js`'s `defaultRfApiUrlForEnv()`. Anything that isn't an absolute prod-host URL
(root-relative paths, hand-authored fixtures) passes through untouched.

### ENFORCE_PUBLISHED_FILTER

Disabled deliberately. Every row in the real MAX26 catalog is currently a draft/test row, so
enforcing `published` today would hide the entire catalog. Flip to `true` once real published
content exists — `sessions-api.test.js` pins the current value so the test fails and forces
the decision.

### stripRfPrefix

ESP namespaces its own `external*Id` fields with `rf-`. RainFocus's own API always expects the
bare id, with no prefix.

### rfCode vs rfSessionId

Two distinct RainFocus ids, easy to mix up:

| Field | Source | Used by |
|---|---|---|
| `rfCode` | `sessionTimes[].externalSessionTimeId` (per time slot) | scheduling — `addSession` / `removeSession` |
| `rfSessionId` | `sessions[].externalSessionId` (session level) | favoriting — `toggleSessionInterest` |

### Format value folding

Format values are compared on a folded form (lowercased, non-alphanumerics stripped) because
the catalog is inconsistent about them:

- prod labels the value `In-Person`, stage `In person`
- a value with no localized label falls back to its slug, `on-demand-post-event`

Exact string comparison breaks on all of those. This was a real bug: the code compared against
`In person` while prod sent `In-Person`, so `inPerson` was silently false for every real
session and the in-person-only drop never fired.

### hasOnDemandFormat

Carrying `On demand, post event` at all keeps a session out of Live, Upcoming, Previously aired
and Recommended — unconditionally, whatever else its Format or `Livestreamed Content` says.
`Livestreamed Content` takes no part in placement; it only routes a live *Watch now* (see
`getWatchDestination()`). There is no derived "is there video" flag in between — callers read
the three Format booleans directly.

### The two catalog drops, and reporting them

Two rules remove a session from the catalog entirely rather than filtering it per view, so one
rule covers every view, day tab and deep link:

- **no `Format` value** (`isMissingFormat`) — says nothing about how the session can be watched,
  so there is no view it can be placed in.
- **an invalid `Format` combination** (`invalidFormatReason`) — `Format` is multi-select over
  three real values (`In person`, `Online`, `On demand, post event`), but only two shapes give a
  session an unambiguous way to be watched. Confirmed table (PM, 2026-08-26):

  | Format value(s) | Kept? | Reason if dropped |
  |---|---|---|
  | *(none)* | ❌ | `no Format value` |
  | In person | ❌ | `in-person only` |
  | Online | ✅ | — |
  | On demand, post event | ❌ | `on-demand, post event without in-person` |
  | In person, Online | ✅ | — |
  | In person, On demand, post event | ✅ | — |
  | Online, On demand, post event | ❌ | `online and on-demand, post event together` |
  | In person, Online, On demand, post event | ❌ | `online and on-demand, post event together` |

  In short: `Online` and `On demand, post event` are mutually exclusive — a session is either
  online (optionally also in-person), or an in-person-only session whose recording lands later.
  `On demand, post event` with neither `Online` nor `In person` (or any other combination with no
  recognized digital signal at all) falls through to `no digital way to watch`.

Both rules are reported by `reportDroppedSessions()`. `lana` gets the count and a capped enumeration in
every env; **below prod each row is also `console.warn`ed with the rule that removed it**, which
is what an author needs to go and fix the row. Each row is named by `sessionCode` and title as
well as id, because the id alone isn't searchable in RainFocus. The count is always exact; the
enumeration is capped at `DROP_LOG_LIMIT` so a wholesale authoring failure can't flood the log.

`isProd` is an injectable parameter with a `getEventConfig()` default, matching
`sessionPageUrlForEnv()` in the same file, so the env branch is testable without mocking config.

### Attribute name fallbacks

ESP renamed several custom attributes between MAX25 and MAX26. `extractCustomAttributeValue(s)`
takes either a single name or an array of candidates tried in order. A given session only ever
carries one of a renamed pair, so "first found" is unambiguous.

`PRIMARY_TRACK_ATTRIBUTE_NAMES` is exported so `tier-1-event-configurator/utils.js` — which
needs the same attribute for its own track editor — doesn't carry a second copy that can drift.

Names are matched **exactly**: `name === label` on every attribute and there is no machine-safe
slug, so matching means comparing display strings verbatim, parentheses and all.

### MAX26-only fields

`Additional Event Site Tracks` and `Override Primary Event Site Track` don't exist on MAX25
sessions. They come back empty/`''` for those, which is exactly the single-track fallback
wanted — no explicit MAX25 branch needed.

### Track helpers

- `getSessionPrimaryTrack()` / `getSessionAdditionalTracks()` — Additional tracks are a
  multi-select drawing from the same vocabulary as the primary track, and the runtime treats
  them as real tracks: `resolveTrackBadge()` gives them their own swimlanes and `LiveCard`
  badges the first. So it mirrors `getSessionProducts()` (all values) rather than
  `getSessionPrimaryTrack()` (first only).
- On the normalized session object, the ESL "Track" topic-tag customAttribute — a real,
  distinct attribute from `PRIMARY_TRACK_ATTRIBUTE_NAMES` — lands in `tracks` (array); the
  primary track lands in `primaryTrack` (string). Only the detail overlay's "Track" attr row
  reads `tracks`; everything badge/swimlane-related reads `primaryTrack`.
- `extractDistinctAllTracks()` — primary and additional together, which is what a per-track
  icon/colour mapping has to cover since either kind can end up on a badge.
- `extractDistinctOverrideTexts()` — the override is **free text**, not a select, so every
  distinct string an author has typed becomes its own swimlane. The configurator needs the full
  set to offer a per-value icon mapping.

### getProductAttributeId

Product is multi-select, unlike track/override, so `getSessionProducts()` returns every value.
The attribute's own id is also its key in `customAttributeValues`, which is how `FilterPanel.js`
identifies the product filter category — it badges product icons *there only*, because
`Illustrator` is both a product and an `Audience` job role and matching on the value alone would
badge the wrong pills.

### deriveFacetableAttributes

Mirrors the `enabled` / `inputType` / `valueId` filtering ESP's own `/session-facets` endpoint
applies server-side, so results match it without a second network round-trip.

### buildCustomAttributeValueMap

Keyed by `attributeId` and built straight from the raw payload rather than a hand-named
whitelist, so any attribute the configurator offers resolves automatically as new ones get
authored, with no per-field mapping. Applies the same guards as `deriveFacetableAttributes()`,
so it only ever holds attributes that could actually be authored as a filter category.

### Sessions with no sessionTime

Real rows — cancelled, TBD, overflow-room placeholders — can have no scheduled time yet.
`startTimeUtc` / `endTimeUtc` fall through to `''`, and `utils/time.js`'s formatters and
`getSessionDayKey()` are guarded for that.

### Video sources

Four sources, one field each, named for the player. **Alternatives, not a fallback chain** — a
session carries whichever it was produced for, so an empty field means "not this source", never
"try another".

| | Attribute | Field | Player | State |
|---|---|---|---|---|
| LIVE | `Mobilerider Live Stream ID` | `mrStreamId` | Mobile Rider live, polled for on-air status | inbound; name tentative |
| VOD | `MPC ID` | `mpcId` | Adobe Video TV | mapped, unread |
| VOD | `YouTube ID` | `youTubeId` | YouTube | mapped, unread |
| VOD | `Mobilerider Video ID (DVR)` | `mrDvrVideoId` | Mobile Rider recording of a finished stream, gated by `DVR Timing (in hours)` | mapped, unread |

The `mr` prefix marks the two Mobile Rider sources, which is also exactly the pair `Skin ID`
(`mrSkinId`) applies to.

`mrStreamId` is the one with no data: it is authored in RainFocus and inbound on the catalog.
Mapping it is the single change that switches stream polling on — see
`REAL-API-CHECKLIST.md` and the on-demand-vs-live question in `not-tracked/PM-QUESTIONS.md`
before flipping it.

`videoDuration` is kept verbatim: the catalog writes 60 minutes as `00:60:00`, so it is not
reliably `HH:MM:SS`.

`dvrDelayHours` is hours after the event starts that a recording becomes playable. Free text,
so blank / whitespace / non-numeric all mean "no delay" (`null`), never `0` — `0` would mean
available from the moment the event starts. **Not read by the guide's own filtering** — the
`isDvrPending()`/`dvrAvailableAtMs()` gate that used to withhold a session from
`onDemandSessions()` until this window opened was removed from that call site (PM,
2026-08-26): DVR Timing no longer affects which view a session appears in. Both functions
still live in `utils/session-state.js` as shared utilities for any other block that needs
them — they're just unused by `session-filters.js` now. `dvrDelayHours` itself is still
carried on the session for a later "Recording coming soon" vs "On-demand" display treatment
(tracked separately, not yet built for the guide — `event-session-details` already has an
analogous, independent "Coming soon" state, see its own docs).

### aiFocus

`AI Focus` has no catalog attribute yet, but one is coming, so the read is wired up ahead of it
and yields `[]` until then — which hides its row in the detail view rather than showing a blank
one. Both casings are tried: names are matched exactly and every other attribute in the payload
is Title Case (`Technical Level`, `Category`), but the name reached us as "AI focus". Read as
multi-value so a single-select still works whichever way it ends up authored.

### closedCaptions and ipodOrGdprCopy

Both authored as free text. `closedCaptions` is still mapped but no longer rendered — the detail
view's captions row was removed — and carries a whole sentence ("Closed captions available in
…"), not a language list, so it's ready if the copy reappears elsewhere.

`ipodOrGdprCopy` tries two name spellings because the audited payload and the Figma annotation
disagree on the slash. It is **authored HTML**, rendered through `utils/rich-text.js`.

---

## Detail overlay

### Authored HTML

`ipodOrGdprCopy` (`IPOD or GDPR Copy`) arrives as HTML — `<p>`, `<b>`/`<strong>`, `<br/>` and
links. `utils/rich-text.js`'s `sanitizedRichText()` runs it through the vendored
`deps/html-sanitizer.js` (whitelisted tags/attributes, protocol-checked hrefs) and forces links
to `target="_blank" rel="noopener noreferrer"` — following a legal link in place would discard
the visitor's position in the drawer. It renders into a `<div>`, not a `<p>`: the value brings
its own paragraphs and `<p><p>` is invalid nesting, so the browser would close the outer one and
the styling would fall off.

The htm test stub renders object-valued attributes as `=""`, so `dangerouslySetInnerHTML`
content never reaches the asserted string — component tests can only assert the wrapper, and
the markup itself is covered in `rich-text.test.js`. Verify rendering in a browser via
`not-tracked/sg-detail-preview.html`.

`legalDisclaimer` (`Legal Disclaimer`) is carried on the session but deliberately never
rendered in this overlay — see "Session resources and legal disclaimer are pre-event
sensitive" below.

### Attribute list

Fixed order per design: **Technical level, Track, AI focus, Audience, Category**. Each row is
hidden when its value is empty. `Industry` is deliberately absent — not in the design, and it
doesn't exist in the real catalog either.

### Pod heading counts

`sg-detail__count` appears only when the list is actually truncated, so it tracks the Show more
toggle exactly: over 6 products (`COLLAPSED_PRODUCTS`), over 5 speakers (`COLLAPSED_SPEAKERS`).

### Session resources and legal disclaimer are pre-event sensitive

Neither the "Session resources" pod nor the legal disclaimer renders in the detail overlay.
Both are sourced from the public sessions catalog endpoint, which is reachable before an event
goes live, so surfacing them here would leak that data pre-event. The individual session page
hydrates both directly on page creation instead, where the exposure isn't a pre-event leak.
`resources` and `legalDisclaimer` are still carried on the normalized session object
(`services/sessions/sessions-api.js`) for that consumer — they are just never read by
`SessionDetailOverlay.js`.

### Full-height body

`.sg-detail__body` uses `flex: 1 0 auto`, not `flex: 1`, so the tint fills the panel when the
content is shorter than it without ever being compressed below its content height when the
content is taller and scrolls.

---

## Deep linking

`?session=` carries the last path segment of the session's own page url, which the catalog has
already slugified from `enTitle` + `sessionCode`
(`.../sessions/acom-ipod-test-session-no-mpc-1003-1`). Derived on demand by
`sessionUrlSlug()` rather than stored, so there is no second slug to keep in step.

`sessionParamValue()` falls back to the session id for rows with no url, which is also what
`openSessionGuideDetail()` writes. `findSessionByParam()` matches the param **whole** against
either form — both carry dashes, so splitting on one truncates them. The previous
`<slug>-<rfCode>` scheme did split on the last dash, which silently failed for any session with
no `sessionTime` (and therefore no `rfCode`): the id fallback put a UUID in that position.

---

## Filter panel

On mobile the panel is a two-screen drill-down: a category list, then one category's options.
The two screens are never rendered together, so a category button on screen one carries no
`aria-pressed` / `aria-controls` / `aria-expanded` — it navigates and unmounts itself, so it is
neither a toggle nor a disclosure, and either state could only ever announce as permanently off.
Above mobile the options sit alongside, so both attributes apply.

Only the mobile/tablet takeover is `aria-modal`; at desktop the panel is a click-away popover
anchored to the filter button, so claiming modality there would wrongly tell assistive tech the
rest of the drawer is unavailable.

Product icons are scoped to the product filter category alone, keyed on `productAttributeId` —
`Illustrator` is both a product and an `Audience` value, so matching against the products map
isn't enough on its own.

---

## CSS

`sessions-guide.css` / `sessions-guide-overlays.css` are served unminified, so the reasoning
lives here and the files keep one-line markers.

### Structure

Mobile-first throughout, per Sessions Guide VizD R1. The detail view is one structure at every
width: a tinted body holding white pods 8px apart. The pods sit in two column wrappers so the
desktop frame's two independently-stacking columns are possible; below 1280px the wrappers
collapse with `display: contents` and the pods order themselves.

The filter panel is laid out with **grid areas** so a single DOM order — categories → options →
actions, which is also the mobile reading order — serves every breakpoint:

| Width | Layout |
|---|---|
| base | full-screen takeover, stacked: title + scrolling category strip, single-column options, full-width action bar |
| 768px | categories become a fixed 145px sidebar with Apply/Reset pinned beneath, 2-column option grid |
| 1024px | 3-column option grid |
| 1280px | anchored popover card, 4-column grid |

At desktop the panel is a dismiss-on-click-away card anchored to the filter button, overlaying
the widget rather than taking it over — click-away is wired in `DrawerHeader.js`. Width/height
are capped tighter than the Figma frame (1133×560 vs 1307×880), and the options grid derives its
column count from the track width rather than hard-coding 4, so pills reflow to 3 instead of
squeezing on a narrower desktop. Both dimensions are fixed rather than `max-*` so the sidebar's
bottom row pins Apply/Reset as designed; the category list and options grid each scroll
internally.

### Load-bearing declarations

Things that look removable and are not:

- **`flex: none` on the panel's action buttons.** `.sg-filter-panel__actions` is a column, where
  `flex: 1` sets a zero flex-basis on the *height* axis — it collapsed the buttons to their
  18.8px text height regardless of any height declared. `min-height` keeps the 48px touch target
  if a label wraps.
- **`overflow-wrap: anywhere`, not `break-word`,** on the filter category labels. Only `anywhere`
  also lowers the text's min-content size, which is what lets flexbox shrink it instead of
  pushing the count badge past the column edge on a long unbroken label
  ("Playlist assignment/name"). Spaces are still the preferred break.
- **`min-height: 0`** on the nested boxes of the mobile category screen — without it they can't
  shrink below their content, and Apply/Reset get pushed off the viewport when a config has more
  categories than fit.
- **The doubled `.sg-filter-btn--active.sg-filter-btn--active`.** This file is `@import`ed at the
  top of `sessions-guide.css`, so that file's own `.sg-filter-btn { background: transparent }` is
  later in the cascade and wins at equal specificity.
- **Mobile takeover padding must follow the base rule, not lead it.** A media query adds no
  specificity, so the later declaration of the property wins.
- **Show more gap top-ups.** Figma opens the gap between a list and its Show more toggle wider
  than the 16px pod gap — 20px in products, 24px in speakers. The pod's own gap covers 16; the
  per-pod rules top up the remainder.

### Dark theme

Dark rules are hand-written per-theme pairs rather than `*-default` tokens, because those don't
flip inside `.sg-portal` — the dark token scope in `sessions-guide-tokens.css` only covers
`.sessions-guide[data-theme="dark"]`.

The detail view's pods are white-on-tint in light mode. Both surfaces invert to near-black in
dark, which would make pod and body indistinguishable, so the body drops to the darkest surface
and the pods (and the tiles inside them) lift instead — the same treatment as the filter pills.

### Accessibility deviations from Figma

- Figma dims inactive filter category labels to **50% opacity**, which lands at 3.95:1 and fails
  WCAG 1.4.3 for 16px bold. The dim state uses `content-subtle` (6.6:1) instead, which reads
  near-identically. Selection is also carried by `aria-pressed`.
- Below 768px the filter button is a 40px icon-only circle with no room for a count — an 18px
  glyph plus an 18px badge overflows it, which is how the badge ended up colliding with the ring.
  "Filters are applied" is carried by a solid selected fill there and the count is hidden. Its
  `aria-label` carries the count at every width, so assistive tech never depends on the badge.
  Written as a `max-width` block rather than this file's usual mobile-first shape because the
  fill is mobile-only — reverting fill, glyph, hover and both dark variants at 768px would be
  five undo rules instead of one guard.
