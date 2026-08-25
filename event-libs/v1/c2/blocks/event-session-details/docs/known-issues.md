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

## 2. `liveStream` handling diverges from `video-player`

**Files:** `event-session-details/session-state-view.js` (`hasPlayableVideo`) vs.
`c2/blocks/video-player/video-player.js` (`pickEmbeddableVideo`)

**Impact:** two related defects in the player, and a visible disagreement with the eyebrow.

`pickEmbeddableVideo()` accepts **any** `kind` and returns the **first** embeddable entry
*by array order*. On the real MPC template the youtube `liveStream` sits at index 0, ahead
of the mpc `onDemand` — and the player only runs post-event, so it embeds the livestream
URL and never reaches the authored recording, losing that URL's `quality=9`,
`end=nothing`, `learn=on` params plus MPC captions/analytics. It usually does not *look*
broken, because YouTube leaves the archived stream at the same watch URL.

Separately, `hasPlayableVideo()` deliberately excludes `kind: 'liveStream'`, so a session
whose **only** embeddable entry is a liveStream gets a player while the eyebrow says
"Coming soon" — a contradiction on one page.

**Fix (owner: Hari):** in `pickEmbeddableVideo`, skip `liveStream` post-event, and prefer
`onDemand` explicitly rather than relying on array order. The array-order dependency is
the more serious of the two.

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

## 4. `fileTypeName` can repeat across rows

**Files:** `event-session-resources/event-session-resources.js` (`resourceName`)

**Impact:** rows are labelled by `fileTypeName` because `fileName` is often unusable. But
`fileTypeName` is a *type*, not a name — a session publishing two PDFs both typed
"Session slides" renders two identical rows, where `fileName` at least distinguished them.
The `aria-label` inherits the same ambiguity.

**Fix:** check real RainFocus data for how often it repeats (owner: Kat). If common,
disambiguate — e.g. append an index, or fall back to `fileName` on collision.

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
