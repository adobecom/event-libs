# Session Details Page — known issues

Open items across the four session page blocks (`event-session-details`,
`event-session-resources`, `event-featured-products`, `event-speakers`). Extracted from
the code as of 2026-08-24 so the source can stay comment-free — see
[README.md](README.md) for how the blocks work.

## 1. Download gating is a UX gate, not access control

**Files:** `event-session-resources/event-session-resources.js`

**Impact:** `Download` CTAs are gated on sign-in + registration client-side, but the
`fileURL` is in the DOM. A copied link, a modifier-click, or View Source still reaches the
asset. No browser-side technique can prevent this. If these files are genuinely
entitlement-restricted rather than login-encouraged, the current gate is worse than
nothing, because it implies protection that does not exist.

**Fix:** server-side. Either (a) an auth-checked endpoint that validates IMS +
registration then streams or 302s — best option here, since the row can stay a real
`<a href>` so ⌘-click and keyboard still work for entitled users; (b) signed/expiring
URLs; or (c) a token-gated CDN origin.

**Lead:** `fetchAttendeeAccess()` in `services/sessions/rainfocus.js` (RainFocus
`attendeeAccess` endpoint) already exists and is unit-tested, but is **called by nothing**.
If it returns per-session entitlement or gated asset URLs, that is the hook. Owner: Sekhar
/ Daniel.

## 2. `video-player` reads an unsorted `sessionTimes[0]`

**Files:** `c2/blocks/video-player/video-player.js` (`currentSessionHasEnded`) —
on the unmerged **`latest-playlist`** branch, not on `dev`

**Resolved since first written:** `pickEmbeddableVideo()` used to accept any `kind` and
return the first embeddable entry by array order, which meant the youtube `liveStream` at
index 0 won over the mpc `onDemand` on the real MPC template. It now resolves
`.find((v) => v.kind === 'onDemand')`, so that defect is gone, and
`hasPlayableVideo()` has been aligned to the same `kind === 'onDemand'` test — the two
predicates are now identical and cannot disagree.

**Still open:** the player's post-event gate is
`nowMs >= sessionTimes[0].endTimeMillis`, reading the array **unsorted**. RainFocus does not
order `sessionTimes` chronologically — 21 of the 40 published multi-slot MAX26 sessions have
a first entry that is not the earliest. Two consequences:

- A repeat lab authored later-slot-first (`L6317` = `[Nov 12 13:30, Nov 11 08:00]`) hides the
  player for a full day after its real first occurrence has ended.
- A 10am session with a 6pm premiere authored premiere-first compares against 7pm, so the
  intended 10:45–18:00 on-demand window renders **no player at all**.

`mapEslPayloadToRawSessions()` and `session-state-view.js` both sort before taking the
earliest; this is the remaining place that does not.

**Fix (owner: Hari):** sort by `startTimeMillis` before indexing, or import
`getAllSessionTimes()` from `session-state-view.js`.

**Also worth confirming:** `currentSessionHasEnded()` returns `true` when there is no entry
or `endTimeMillis` is not a finite number, so an unscheduled session that has a video would
pass the gate.

## 3. `mobilerider` / `dvr` is a recording but is not counted as one

**Files:** `event-session-details/session-state-view.js` (`EMBEDDABLE_PROVIDERS`)

**Impact:** a `dvr` entry is a real recording, but `mobilerider` is not one of
`video-player`'s embeddable providers, so a DVR-only session reads **"Coming soon"**
indefinitely. That is honest about what *this page* can play — the `mobile-rider` block
takes an **authored** video id via its own `cfg` and does **not** read `session-times` — but
it is wrong if an author places a `mobile-rider` block on the page, since there would then
be a player.

**Fix:** confirm whether IPOD sessions will ever ship DVR-only (owner: Hari / Sekhar). If
yes, add `mobilerider` to the recording test rather than sniffing the DOM for a
`.mobile-rider` block, which is timing-fragile during decoration.

## 4. `description` repeats across rows, and internal file types can leak

**Files:** `event-session-resources/event-session-resources.js` (`readMaterials`)

**Impact (label collisions):** rows are labelled by `description` (RF's `fileTypeName`)
because `title` is often unusable. But it is a *type*, not a name, so two published files of
the same type render two identical rows — and this is now confirmed at scale rather than
hypothetical. Across the 275-session MAX26 dump, of 125 files: **107 are typed `Outline`** and
8 `Draft Presentation`. Any session publishing two of a type collides. The `aria-label`
inherits the ambiguity.

**Impact (type leakage):** the block filters on published state only, never on *type*. The
`fileTypeCode` values present in real data are:

| `fileTypeCode` | `fileTypeName` | Count | Attendee-facing? |
|---|---|---|---|
| `outline` | Outline | 107 | No — speaker's own `.docx`/`.pdf` submission |
| `draftpresentation` | Draft Presentation | 8 | No — explicitly a draft |
| `speaker` | Sponsor Speaker Headshot | 7 | No — a `.jpg`/`.png` portrait |
| `finalpresentation` | Final Presentation | 2 | **Yes** |
| `sessionimageupload` | Session Image Upload | 1 | No — the session card image |

Only **1 of 125** is currently `published: true` (a `finalpresentation`), so the publish flag
is doing the work today. But nothing stops an accidentally-published `outline` from rendering
as an attendee "Download" of the speaker's internal notes, or a headshot appearing as a
session resource.

**Fix:** confirm the attendee-facing allowlist with Kat — almost certainly
`finalpresentation` alone — and filter on `fileTypeCode` in addition to publish state, so the
publish flag stops being the only guard. Note `fileTypeCode` is present in the RainFocus
`files[]` payload but **not** in the synced `material-list`, whose entries expose
`description` / `title` / `url` / `ordinal` only — so exposing it is a sync-side ask first.

## 5. `auth` has a pending window that reads as "not signed in"

**Files:** `utils/session-store.js` (`auth` signal), consumed by
`event-session-resources.js`, `favorite.js`, `schedule.js`

**Impact:** `auth` starts as `{ isLoggedIn: null }` and only syncs once `imsProfile`
arrives via `BlockMediator`; `initSessionState()` also no-ops entirely without a Tier 1
config. `assertAuthorized()` throws unless `isLoggedIn === true`, so in that window — or on
a page with no Tier 1 config — a **signed-in** user clicking Download gets "Login
required". Pre-existing and shared with favorite/schedule, but more annoying on a download.

**Fix:** decide whether a pending-auth state should hold the click (and show a brief
pending state) rather than rejecting it outright.

## 6. Show-more limits are unconfirmed

**Files:** `event-session-resources.js` (`MOBILE_LIMIT` 2), `event-speakers.js`
(`MOBILE_LIMIT` 5), `event-featured-products.js` (`VISIBLE_LIMIT` 6)

**Impact:** Featured Products' acceptance criteria prose says mobile 4 / desktop 6, while
the Figma appears to show 6 at both. Holding at 6, non-responsive. Session resources now
renders two-up from 900px but still shows only 2 before "Show more", so desktop gets a
single row of two — the desktop limit likely wants to be 4.

**Fix:** confirm each limit and whether any are responsive (owner: Kat).

## 7. Desktop behavior is deferred in three places

**Files:** `description-clamp.js`, `event-speakers.js`

**Impact:** the description clamp and the speakers toggle were specified as mobile-only —
desktop should show the full text and all speakers with no toggle. Both currently clamp at
every width. Noted in the original tickets as part of "the desktop pass".

**Fix:** unclamp above the desktop breakpoint once the desktop design is settled.

## 8. Toggle labels are not internationalized

**Files:** all four blocks ("Show more" / "Show less"), `session-state-view.js`
("Live", "On-demand", "Coming soon", "Watch now"), `event-session-resources.js`
("Download", "Open", "No resources", "Session resources")

**Impact:** every user-facing string is a hardcoded English placeholder.

**Fix:** route through the project's localization mechanism once one is established for
C2 blocks.

## 9. "Coming soon" wording is unconfirmed

**Files:** `session-state-view.js` (`renderStatus`)

**Impact:** "Coming soon" is proposed, not signed off. The IPOD-only scoping also rests on
the assumption that online sessions never sit recording-less for long — if they can, they
need the same treatment (a one-line change to the test).

**Fix:** confirm both with Kat.

## 10. Broadcast URL is a hardcoded fallback

**Files:** `session-state-view.js` (`BROADCAST_URL`)

**Impact:** the live "Watch now" destination resolves through `getWatchDestination()`,
which currently returns a generic path; `BROADCAST_URL`
(`https://www.adobe.com/max/2026/broadcast.html`) is the fallback when it yields nothing.
A hardcoded event URL in a shared library will go stale.

**Fix:** Daniel is sourcing the real URL from config inside `getWatchDestination()`; remove
the fallback once that lands.

## 11. Authored backgrounds can create contrast failures

**Files:** `c2/utils/background-config.js` (`readBackgroundConfig`), consumed by all four
blocks

**Impact:** authors can now set any block background via a "Background" row, but the blocks
hardcode near-black text (`--s2a-color-gray-1000`) and a black focus ring. The current
cream (`#F0EDE9`) is safe at 18:1, but a mid or dark authored value would drop body text to
roughly 1–3:1 with no guard, no validation, and no light-on-dark variant. Before the
background was authorable this could not happen.

**Fix:** constrain the allowed values, or add a dark variant that flips text and
focus-ring colors (owner: Qiyun / Kat).

## 12. `Track` and `AI Focus` quick facts await the RF→DA sync

**Files:** `event-session-details/quick-facts.js` (`QUICK_FACTS`)

**Impact:** both rows are configured and both attributes **do** exist in RainFocus, but
neither reaches the page, so both silently never render. Confirmed 2026-08-24 against the
RF `entityDataDump` for `MAX26sss1mIiY19qLgszzzSESSIONHUB` (272 sessions):

| Attribute | In RainFocus | In page `custom-attributes` |
|---|---|---|
| `Track` | yes — 260 sessions | **no** |
| `AI Focus` | yes — 147 sessions | **no** |

`Track` is a distinct attribute from the three the eyebrow uses (`Primary event site
track` 135, `Additional event site tracks` 23, `Override Primary Event Site Track` 1) and
is the most widely populated of the four. The test session
`session-page-template-columns` carries `Track = Accelerating Creativity with AI` in RF
while its page metadata has no `Track` entry at all.

**Watch the synced name, not the RF name.** The sync renames attributes in transit, so an
exact-name lookup can miss even once the attribute flows: RF `Programming Category` →
page `Category`, RF `Session Type` → page `Type`, RF `LegalDisclaimer` → page `Legal
Disclaimer`, RF `Video Duration (hr:min:sec)` → page `Video Duration`. `getCustomAttribute`
matches case-insensitively but does no fuzzy matching, so if `Track` or `AI Focus` land
under a different name the rows stay empty.

**Fix:** no code change — both render as soon as the sync carries them. Confirm the exact
synced names with Sekhar; add a name-alias array (as `sessions-api.js` already does with
`['AI Focus', 'AI focus']`) if they differ from the RF names.
