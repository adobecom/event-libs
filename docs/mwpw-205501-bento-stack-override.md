# Bento stack mobile override (MWPW-205501)

**Status:** implemented — [PR #289](https://github.com/adobecom/event-libs/pull/289).

**Update (2026-09-04):** Milo merged `site-redesign-foundation` into `main` via
[PR #6614](https://github.com/adobecom/milo/pull/6614) on 2026-09-02. `libs/features/bento-stack.js`
now ships on `main` unconditionally, so it's no longer vendored as a local copy —
`index.js` imports it live from Milo instead (same `LIBS`/`miloConfig.miloLibs` pattern
as `event-libs/v1/features/icons/icon-resolver.js`). The CSS block is still vendored:
`handleBentoStack()` and the `.section.bento.stack-mobile` styles only exist in `main`'s
`libs/mep/ace1209/section-metadata/` (an MEP-experiment copy), not in the default
`libs/c2/blocks/section-metadata.css` that Milo's block loader uses without an active
experiment. See "Decision" and "Opting out later" below for the updated state.

## Problem

[MWPW-205501](https://jira.corp.adobe.com/browse/MWPW-205501) asks for the "Explore
Sessions by Topic" bento-grid section on the Post-Event Homepage to use an elastic,
stacking/overlay scroll effect on mobile instead of a standard grid.

Two terminology corrections against the ticket text:

- The relevant event-libs component for a bento grid of cards is `bento-cards`
  (`event-libs/v1/blocks/bento-cards/`) — a non-C2 block with its own DOM shape, its
  own tokens, and its own existing mobile behavior (a `milo-carousel`-based swap below
  900px). No block named "explore-card/bento-layout" exists in event-libs.
- The reference implementation lives in Milo's `section-metadata` block, under
  `libs/mep/ace1209/section-metadata/` on the `site-redesign-foundation` branch — not
  in a standalone carousel block.

## Where the effect lives in Milo

The mobile stacking effect is part of Milo's `section-metadata` block, applied to
`explore-card` children:

- `.section.bento.stack-mobile` — a class combination on a Milo Section, applied by
  `section-metadata.js`'s generic, keyword-driven class-adding logic (it accepts
  whatever an author types into the `style`/`layout` metadata row — no allow-list).
- `explore-card` — the block used for each card inside that section.
- `libs/features/bento-stack.js` — a small, dependency-free feature module that measures
  each card's natural height via `ResizeObserver`, sets `--card-idx` (per card) and
  `--slides` (per section) as CSS custom properties, and adds a `.bento-stack-ready`
  class to unlock the stacking CSS. If it fails to load, the section renders as a
  normal static grid.
- The stacking itself is pure CSS: `position: sticky` + CSS Scroll-Driven Animations
  (`animation-timeline: view()`, `animation-range`), with per-card offsets computed
  generically from `--card-idx`/`--slides` (works for any card count — unlike the
  unrelated `elastic-carousel` C2 block, which hardcodes exactly 5 slides via
  `nth-child`). Two fallbacks are already built into the CSS: `@supports not
  (animation-timeline: view())` and `prefers-reduced-motion`, both degrading to a plain
  static stacked column.
- Dark mode needs no separate handling — the token system and `.dark`/`.light`
  convention already ship on Milo `main`, and the only stack-specific dark-mode nuance
  is a few `.dark`-aware rules already inside the stacking CSS block itself.

This has been in active development on `site-redesign-foundation` since May 2026
(PRs #5913 "Bento layout foundation", #6322 "Mobile bento support", #6515 "Align
side-by-side to Bento") — a maturing part of an in-progress site-wide redesign, not a
throwaway experiment.

## Constraint: da-events loads both Milo and event-libs

da-events loads Milo and event-libs together, not one or the other. Milo `main`
already ships everything except two pieces:

| Already on Milo `main` | Only on `site-redesign-foundation` |
|---|---|
| `libs/c2/blocks/explore-card/` | `libs/features/bento-stack.js` (new file) |
| `libs/c2/blocks/section-metadata/` (incl. some `.bento` desktop grid styling) | The `.section.bento.stack-mobile` CSS block in `section-metadata.css` (keyframes, custom properties, both fallbacks) |
| C2 `--s2a-*` design tokens, `--parallax-easing` | A 6-line hook in `section-metadata.js` (`handleBentoStack()` + one call site) |

_(As of the 2026-09-04 update above: `libs/features/bento-stack.js` has since shipped
to `main` directly and is imported live rather than vendored. The CSS block and the
`handleBentoStack()` hook still only exist in `main`'s `ace1209` MEP-experiment copy of
`section-metadata`, not its default `libs/c2/blocks/` version, so those two remain
vendored.)_

Because `section-metadata.js` on `main` already applies whatever classes an author
supplies, a da-events page can author a `section-metadata` + `explore-card` section
with `bento, stack-mobile` styles today, using stock Milo — the authoring experience
doesn't depend on anything below.

The two missing pieces are not on `main` yet. Waiting for them to graduate off a WIP
branch has no defined timeline, and reimplementing the effect from scratch in
event-libs would mean maintaining a second, divergent version while Milo's own keeps
evolving underneath it.

## Authoring

Two page-level metadata flags, plus two blocks inside the target section.

**Metadata block** (page-level):

| Metadata | |
|---|---|
| foundation | c2 |
| override-milo-ace1209 | true |

`foundation: c2` is a Milo-level flag, not an event-libs one — Milo resolves blocks
from `libs/c2/blocks/` only when it's set. `explore-card` has no C1 counterpart at all,
so without this flag the block won't load; `section-metadata` has both a C1 and C2
version, so without it you'd silently get the wrong one. `override-milo-ace1209` must
be the literal string `true` — the check in `scripts.js` is `=== 'true'`, not a bare
presence check.

**Section Metadata block**, inside the section that should stack on mobile — `bento,
stack-mobile` goes in its own `layout` row, separate from `style` (which carries
unrelated per-viewport classes like spacing/parallax/container, if any are already
used on that section):

| Section Metadata | |
|---|---|
| layout | bento, stack-mobile |

`layout` and `style` both route through the same generic class-adding logic in
`section-metadata.js`, so this is a naming convention rather than a functional
requirement — but real authored content (a live page on `site-redesign-foundation`)
uses `layout` specifically for `bento, stack-mobile`, so match that rather than
`style`.

**Explore Card blocks**, one per topic card, authored inside the same section per that
block's own shape (a content column — icon, heading, link — and a background
image/video column). Any number of cards works; this implementation computes
per-card stacking depth generically, unlike the unrelated `elastic-carousel` block,
which hardcodes exactly 5.

## Decision: vendor only what's still missing, import the rest live

Vendor only what's still confirmed-missing from Milo `main` into event-libs, gated by a
metadata flag, as a page-level feature — not a block, since `explore-card`/`section-metadata`
are Milo's own blocks and already render correctly on `main` with zero changes. No
Milo block is forked or shadowed.

- `libs/features/bento-stack.js` now ships on Milo `main`, so it's no longer vendored —
  `index.js` imports it live at runtime via `${getEventConfig()?.miloConfig?.miloLibs || LIBS}/features/bento-stack.js`,
  the same pattern `icon-resolver.js` already uses for Milo's icon sprite. This means the
  module can never drift out of sync locally (it's fetched fresh from Milo every time),
  at the cost of depending on Milo not moving/removing that path without notice.
- `event-libs/v1/features/milo-site-redesign-override/bento-stack.css` — just the
  `.section.bento.stack-mobile` block extracted from Milo's `section-metadata.css`
  (keyframes, custom properties, both fallbacks). Every token it references
  (`--s2a-*`, `--parallax-easing`) already ships on Milo `main`, so nothing else needs
  vendoring alongside it.
- `event-libs/v1/features/milo-site-redesign-override/index.js` — event-libs' own
  substitute for Milo's not-yet-shipped `handleBentoStack()` hook: scans for
  `.section.bento.stack-mobile` sections and, since it can run before those classes
  exist yet (see below), also watches for them via a `MutationObserver`, loading the
  CSS and calling `initBentoStack()` per section as they appear.
- `event-libs/v1/libs.js` exports `initMiloSiteRedesignOverride()` — a dedicated,
  purpose-built entry point: checks the `override-milo-ace1209` metadata flag and, if
  set to `true`, dynamically imports and runs the feature module above. Zero cost for
  every page that doesn't opt in.
- `da-events/events/scripts/scripts.js` calls `initMiloSiteRedesignOverride()`
  unconditionally in its own `decorateArea()`, alongside `processAutoBlockLinks(area)`
  and before the `if (!getMetadata('event-id')) return;` gate. This requires a
  companion change in the `da-events` repo (separate PR) — not a workaround to avoid
  one.

### base-card CSS override (removed)

A second, unrelated feature was briefly stacked on top of this one, using the same
`initMiloSiteRedesignOverride()` entry point and `override-milo-ace1209` flag: a
token-only CSS fix for `base-card` (`libs/c2/blocks/base-card/`). It was removed on
2026-09-04 because Milo `main`'s own `base-card.css` already ships the identical fix as
of PR #6614 — see
[docs/mwpw-205498-base-card-override.md](./mwpw-205498-base-card-override.md) for the
full history.

### Integration point

This is a static-authoring feature — it must work on pages with no `event-id`, not
just event pages. Two existing functions were tried and rejected as homes for this
because neither actually fits, even though both are technically callable early and
unconditionally:

- `eventsDelayedActions()` (`event-libs/v1/libs.js`) is documented as
  `// Lazy-loaded delayed actions for event pages` — scoped to event pages by its own
  stated purpose, which is exactly wrong here.
- `processAutoBlockLinks()` (`event-libs/v1/utils/decorate.js`) is specifically about
  auto-block link processing (chrono-box, mobile-rider, sessions-guide, tec-homepage
  links) — an unrelated concern. It happens to run early and unconditionally in
  da-events, which made it a tempting place to attach unrelated code, but that's
  piggybacking on another function's contract rather than having one of its own.

`event-libs/scripts/scripts.js` and `decorateEvent()` were also considered and
rejected — see git history on this doc for why (`scripts.js` never runs on a live
site; `decorateEvent()` is itself gated on `event-id`, both internally and at its only
call site in da-events).

The fix is a dedicated function with its own name and its own contract
(`initMiloSiteRedesignOverride()`), explicitly wired into da-events' bootstrap rather
than folded into a function whose purpose it doesn't share. It still runs before
Milo's own block loader decorates `section-metadata`/`explore-card` — the live-imported
`bento-stack.js` already tolerates cards not being ready yet (bounded polling for
`.explore-card-content`), but the *section* itself doesn't have `bento`/`stack-mobile`
classes yet at this point either, so the feature module can't rely on a one-shot scan —
it registers a `MutationObserver` to catch the classes whenever `section-metadata`'s
own `init()` actually applies them, later, during Milo's normal block decoration.

### Opting out later

Once Milo ships `handleBentoStack()` and the `.section.bento.stack-mobile` CSS to the
*default* `libs/c2/blocks/section-metadata.css` (not just the `ace1209` MEP-experiment
copy), remove: `event-libs/v1/features/milo-site-redesign-override/bento-stack.css` and
its load call in `index.js`; the `milo-site-redesign-override` folder and the
`initMiloSiteRedesignOverride()` export from event-libs; the one call to it in
`da-events`'s `decorateArea()`; and the `override-milo-ace1209` metadata flag from
opted-in pages. No markup changes are needed — the DOM and classes authors use are
identical whether the override or Milo's native support is doing the work.

### Known risk

`bento-stack.js` is no longer vendored — it's imported live from Milo `main` on every
page load, so it can't drift out of sync, but a future Milo rename/removal of
`libs/features/bento-stack.js` would break this override at runtime (caught by the
existing `try`/`catch` in `handleSection()`, which logs via `window.lana?.log` and lets
the section degrade to its normal static grid) rather than at review time. `bento-stack.css`
is a literal excerpt of a file that's still only shipped behind an MEP experiment on
`main` — the exact source commit SHA is recorded in the PR, so a future re-sync or
removal is traceable.

A handful of narrow-edge-case behaviors in Milo's own `bento-stack.js` (a
`measuring`-guard race that can drop a resize event, a `--gnav-offset` fallback that
can stick to a stale value, a `bento-stack-ready` check/set race, an idle
`ResizeObserver` if a section is detached outside Milo's own `replaceInner()` cycle) are
Milo's to fix upstream now, not something event-libs can patch locally.

## Open questions for alignment

- Is `override-milo-ace1209` the right flag name, or should it be named after the
  feature rather than the Milo experiment ID (e.g. `bento-stack-mobile`)? Now less
  theoretical than when this was first asked — `ace1209` is a real, still-live MEP
  experiment ID on Milo `main`, not just a WIP branch identifier.
- Does da-events want to author "Explore Sessions by Topic" using `section-metadata` +
  `explore-card` directly (bypassing event-libs blocks entirely for this section), or
  should event-libs eventually offer a more opinionated wrapper?
- Who owns watching Milo `main`'s default `libs/c2/blocks/section-metadata.css` for when
  the `ace1209` experiment's bento-stack CSS/hook graduates out of the MEP-gated copy, so
  the remaining override gets removed promptly rather than lingering?
