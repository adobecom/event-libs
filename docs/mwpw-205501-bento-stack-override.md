# Proposal: borrowing Milo's WIP "bento stack" mobile effect via a flagged override

**Status:** proposal, for team alignment before merging. A working implementation
already exists on branch `mwpw-205501-bento-stack-override` so the approach can be
reviewed against real code, not just described.

## Background

[MWPW-205501](https://jira.corp.adobe.com/browse/MWPW-205501) asks for the "Explore
Sessions by Topic" bento-grid section on the Post-Event Homepage to use an elastic,
stacking/overlay scroll effect on mobile instead of a standard grid. The ticket points
at Milo's `site-redesign-foundation` branch as the reference implementation.

Two things in the ticket needed correcting before any implementation could start:

1. **The named target block doesn't exist in event-libs.** The ticket calls it a "C2
   explore-card/bento-layout" block. No block by that name exists here — the only
   bento-grid-of-cards component is `bento-cards` (`event-libs/v1/blocks/bento-cards/`),
   and it's a non-C2 block with its own DOM shape, its own tokens, and its own existing
   mobile behavior (a `milo-carousel`-based swap below 900px).
2. **The reference path looked dead, then turned out not to be.** An initial pass
   searched Milo's `libs/mep/ace1209` for a standalone `elastic-carousel` block by name,
   found nothing, and concluded the path was stale scaffolding. That was a wrong search
   term, not a dead end — re-verification (prompted by a reviewer noticing recent
   activity) confirmed `libs/mep/ace1209/section-metadata/` had commits as recent as the
   day before this investigation, and the real mechanism lives there under a different
   name than assumed (see below).

## What's actually on `site-redesign-foundation`

The mobile stacking effect is implemented in Milo's `section-metadata` block, not a
standalone carousel block:

- `.section.bento.stack-mobile` — a class combination on a Milo Section, applied by
  `section-metadata.js`'s already-generic, keyword-driven class-adding logic (it accepts
  whatever an author types into the `style`/`layout` metadata row — no allow-list).
- `explore-card` — the block used for each card inside that section.
- `libs/features/bento-stack.js` — a small, dependency-free feature module that measures
  each card's natural height via `ResizeObserver`, sets `--card-idx` (per card) and
  `--slides` (per section) as CSS custom properties, and adds a `.bento-stack-ready`
  class to unlock the stacking CSS. If it fails to load, the section just renders as a
  normal static grid — no broken state.
- The stacking itself is pure CSS: `position: sticky` + CSS Scroll-Driven Animations
  (`animation-timeline: view()`, `animation-range`), with per-card offsets computed
  generically from `--card-idx`/`--slides` (works for any card count, unlike a
  superficially similar but unrelated `elastic-carousel` C2 block that hardcodes exactly
  5 slides via `nth-child`). Two fallbacks already exist in the CSS: `@supports not
  (animation-timeline: view())` and `prefers-reduced-motion`, both degrading to a plain
  static stacked column.
- Dark mode needs no separate work — the token system and `.dark`/`.light` convention
  already ship on Milo `main`, and the only SRF-specific dark-mode nuance is a few
  `.dark`-aware rules already inside the stacking CSS block itself.

Merged PR history on `site-redesign-foundation` (#5913 "Bento layout foundation", #6322
"Mobile bento support", #6515 "Align side-by-side to Bento") shows this has been
iterated on since May 2026 — it's a real, maturing feature of an in-progress
site-wide redesign, not a throwaway experiment.

## Why this isn't a simple "just build it in event-libs" problem

da-events loads **both** Milo and event-libs — they aren't mutually exclusive. Diffing
Milo's `main` against the `site-redesign-foundation` copies narrows the true gap to
something much smaller than "the whole feature is missing":

| Already on Milo `main` | Only on `site-redesign-foundation` |
|---|---|
| `libs/c2/blocks/explore-card/` | `libs/features/bento-stack.js` (new file) |
| `libs/c2/blocks/section-metadata/` (incl. some `.bento` desktop grid styling) | The `.section.bento.stack-mobile` CSS block in `section-metadata.css` (keyframes, custom properties, both fallbacks) |
| C2 `--s2a-*` design tokens, `--parallax-easing` | A 6-line hook in `section-metadata.js` (`handleBentoStack()` + one call site) |

Because `section-metadata.js` on `main` already applies whatever classes an author
supplies, a da-events page can **already** author a `section-metadata` + `explore-card`
section with `bento, stack-mobile` styles today, using stock Milo. Nothing about the
authoring experience needs to wait.

The two missing pieces, though, are genuinely not in `main` yet, and the team doesn't
want to either (a) wait an unknown amount of time for them to graduate off a WIP branch,
or (b) write a parallel, from-scratch implementation in event-libs while Milo's own
version keeps evolving underneath it.

## Proposed approach: `milo-site-redesign-override`

Vendor **only** the two confirmed-missing pieces into event-libs, gated by a metadata
flag, as a page-level feature — not a block, since `explore-card`/`section-metadata`
are Milo's own blocks and already render correctly on `main` with zero changes. No
Milo block is forked or shadowed.

- `event-libs/v1/features/milo-site-redesign-override/bento-stack.js` — verbatim copy
  of Milo's `libs/features/bento-stack.js`. Zero dependencies, so this is a pure,
  low-risk drop-in.
- `event-libs/v1/features/milo-site-redesign-override/bento-stack.css` — just the
  `.section.bento.stack-mobile` block extracted from Milo's `section-metadata.css`
  (keyframes, custom properties, both fallbacks). Every token it references
  (`--s2a-*`, `--parallax-easing`) already ships on Milo `main`, so nothing else needs
  vendoring alongside it.
- `event-libs/v1/features/milo-site-redesign-override/index.js` — event-libs' own
  substitute for Milo's not-yet-shipped `handleBentoStack()` hook: finds
  `.section.bento.stack-mobile` sections, loads the CSS, and calls `initBentoStack()`
  per section.
- A single gate in `event-libs/scripts/scripts.js`, after Milo's own block loading
  completes: if the page has `override-milo-ace1209` metadata set, dynamically import
  and run the override. Zero cost for every page that doesn't opt in.

### Opting out later

Once Milo ships `handleBentoStack()` and the CSS to `main`, remove the
`milo-site-redesign-override` folder, its one hook in `scripts.js`, and the
`override-milo-ace1209` metadata flag from opted-in pages. No markup changes are
needed — the DOM and classes authors use are identical whether the override or Milo's
native support is doing the work.

### Known risk

`bento-stack.js` is effectively zero-risk (no imports, verbatim). `bento-stack.css` is
a literal excerpt of a file that's still actively changing upstream — the exact source
commit SHA should be recorded in the PR that introduces this, so a future re-sync or
removal is traceable.

## Open questions for alignment

- Is `override-milo-ace1209` the right flag name, or should it be named after the
  feature rather than the Milo experiment ID (e.g. `bento-stack-mobile`), given the
  experiment ID is an implementation detail that may not mean anything once this is
  standard?
- Does da-events want to author "Explore Sessions by Topic" using `section-metadata` +
  `explore-card` directly (bypassing event-libs blocks entirely for this section), or
  should event-libs eventually offer a more opinionated wrapper?
- Who owns watching `site-redesign-foundation` for when this graduates to `main`, so the
  override gets removed promptly rather than lingering?
