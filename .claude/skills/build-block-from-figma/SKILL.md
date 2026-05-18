---
name: build-block-from-figma
description: >
  Builds a new event-libs block from Figma designs using the Figma MCP,
  validates visually with Playwright MCP, then runs accessibility and
  performance audits.  Provide a preview URL (localhost or DA published)
  and one or more Figma frame URLs for different device sizes.  For DA
  published pages (.aem.live), code is pushed to a feature branch and
  tested via ?eventlibs=.
---

# Build Block Skill — event-libs

You are building a new block component for the **event-libs** library
(`adobecom/event-libs`), which is an extension of the `adobecom/milo` C2
design system.  Event-libs blocks live at `event-libs/v1/blocks/` and are
registered in `EVENT_BLOCKS` — analogous to how milo C2 blocks live at
`libs/c2/blocks/` and are registered in `C2_BLOCKS` in `libs/utils/utils.js`.

> **Critical path rules**
>
> - Study block code patterns from **both** `libs/c2/blocks/` (milo) and
>   `event-libs/v1/blocks/` before writing any code.  Milo C2 blocks are
>   the upstream reference; event-libs blocks follow the same conventions
>   and extend them.
> - New blocks are created at `event-libs/v1/blocks/<name>/` and registered
>   in `EVENT_BLOCKS` in `event-libs/v1/libs.js`.  They are **not** added to
>   milo's `C2_BLOCKS` or placed under `libs/c2/blocks/`.
> - Shared utilities live in `event-libs/v1/utils/utils.js` (`createTag`,
>   `getEventConfig`, `LIBS`, etc.).  Milo utilities (`decorateButtons`,
>   `createOptimizedPicture`, etc.) are imported dynamically via the `LIBS`
>   constant — never hardcode Milo URLs.
> - Design tokens come from the page's inherited Milo/EDS stylesheet.
>   **Load `references/design-tokens.md`** for the full token list.
> - Use the **Fluffyjaws MCP** to look up any EDS conventions you are unsure
>   about (requires Adobe VPN).
> - Error logging uses `window.lana?.log()` — never `console.error` in
>   production code.
> - Cross-block state uses `BlockMediator` from
>   `event-libs/v1/deps/block-mediator.min.js`.

## Bundled resources

Do **not** load these upfront.  Each phase below tells you which file to
read at the point it becomes relevant.

### references/
| File | Purpose |
|------|---------|
| `design-tokens.md` | Token names, colour/spacing/type scale used across event-libs blocks. |
| `eds-patterns.md` | EDS block anatomy, shared utilities, BlockMediator, CTA patterns, Fluffyjaws MCP usage. |
| `acceptance-criteria.md` | JS/CSS rules, quality checklists, media-query syntax, token usage. |
| `remote-branch-workflow.md` | `.aem.page` publishing, branch creation, push procedure, CDN refresh, iteration batching. |

### agents/
| File | Purpose |
|------|---------|
| `visual-comparison.md` | Playwright screenshot loop — layout, spacing, colour, media fidelity checks. |
| `accessibility-check.md` | axe-core WCAG 2.2 AA audit scoped to the block. |
| `performance-check.md` | Lighthouse CLI audit — LCP, CLS, INP, TBT, overall score. |

---

## Inputs

Ask the user to provide the following before proceeding:

| Input | Required | Example |
|---|---|---|
| **Preview URL** | Yes | `http://localhost:3868/...`, `https://main--repo--org.aem.page/path`, or `https://main--repo--org.aem.live/path` |
| **Figma URL — Mobile** (≤ 767 px) | At least one Figma URL | frame link |
| **Figma URL — Tablet** (768–1279 px) | | frame link |
| **Figma URL — Desktop** (≥ 1280 px) | | frame link |
| **Base branch** | No (default: `main`) | `feature/my-branch` |

Do not proceed until you have the preview URL and at least one Figma URL.

---

## Phase 0 — Preview URL resolution

After collecting the preview URL, determine its type and resolve it to a
usable URL before proceeding.

### Localhost (`http://localhost:...`)

No special handling.  Proceed directly to Phase 1.

### DA preview (`.aem.page`)

A `.aem.page` URL is only a preview and will not work with `?eventlibs=`.
Inform the user that a published (`.aem.live`) URL is required.  Offer
two options:
- Provide a published URL themselves.
- Let Claude publish the page via the EDS admin API.

If the user wants Claude to publish, **load
`references/remote-branch-workflow.md` section 1 now** and follow the
publishing procedure (path safety check, API calls).

After obtaining the `.aem.live` URL (whether user-provided or just
published), **fall through to the DA published section below** to parse
it and set `remote-branch-mode`.

### DA published (`.aem.live`)

Parse the URL to extract org, repo, and page path:
```
https://main--<repo>--<org>.aem.live/<path>
```

Store these values — they are needed in Phase 1 for branch creation and in
Phase 5 for Playwright URL construction.

Set an internal flag: **`remote-branch-mode = true`**.

> **STOP**: Do NOT proceed to Phase 1 until you have either a localhost URL
> or a resolved `.aem.live` URL.  From this point forward, the resolved URL
> is referred to as the **page URL**.

---

## Phase 1 — Validate environment & infer component name

Use Playwright MCP to navigate to the page URL.

### Infer component name

Inspect the DOM inside `<main>` only — ignore header, footer, and nav.
Look for the block identifier (a distinctive class name, e.g.
`class="bento-cards"`).  Derive the component name in **kebab-case**.
Confirm the inferred name with the user before continuing.

> If the block container is not visible or the page is empty, ask the user
> to confirm the AEM dev server is running (`npm run event-libs`) and the
> preview URL is correct.

### Create feature branch (remote-branch-mode only)

Skip this section if `remote-branch-mode` is `false` (localhost).

**Load `references/remote-branch-workflow.md` section 2 now** and follow
the branch creation procedure.  Do NOT proceed to Phase 2 until the user
confirms the branch.

---

## Phase 2 — Read existing patterns

Before writing any code:

1. **List both block directories**:
   - `libs/c2/blocks/` — milo C2 blocks (the upstream pattern reference)
   - `event-libs/v1/blocks/` — existing event-libs blocks
   Read **2–3 blocks from each**, studying:
   - How `export default async function init(el)` is structured
   - How `createTag` is used for DOM creation
   - How Milo utilities are imported dynamically via `LIBS`
   - How BlockMediator is used for state (in event-libs blocks that read
     event data)
   - CSS class namespacing conventions (always scoped under `.block-name`)
   - Mobile-first CSS breakpoints

   > **Note**: New blocks are always created under `event-libs/v1/blocks/`
   > and registered in `EVENT_BLOCKS` — never under `libs/c2/blocks/` or
   > `C2_BLOCKS`.  The milo blocks are read for pattern reference only.

2. **Load `references/eds-patterns.md` now** — it covers EDS block anatomy,
   shared utilities, BlockMediator, and CTA patterns for event-libs.

3. Read `event-libs/v1/utils/utils.js` to understand `createTag`,
   `getEventConfig`, `LIBS`, `getMetadata`, and other helpers.
   **Load `references/design-tokens.md` now** for the full token reference.

4. **Load `references/acceptance-criteria.md` now** and keep it open — you
   will need it throughout Phase 4.

---

## Phase 3 — Read Figma designs

Use the **Figma MCP** to retrieve each provided frame URL.
For each frame, extract:

- Layout structure (flex / grid, direction, gaps, padding, margins)
- Typography (font family, size, weight, line height, letter spacing)
- Colours — match against the token list from `references/design-tokens.md`.
  Always prefer a matching token over a hardcoded value.
- Spacing — match against `--spacing-*` tokens.
- Imagery, iconography, and decorative elements
- Stacking and element ordering — pay close attention to whether elements
  are **stacked vertically** or placed **side-by-side**.  Figma layers from
  top to bottom often mean vertical stacking, not horizontal.  When in
  doubt, check the Figma auto-layout direction.

If multiple frames are provided, explicitly note layout differences between
breakpoints — these drive your CSS overrides.

### Cache Figma frames to disk

After retrieving each frame, **save the Figma frame image** to a local
cache directory so it remains available during Phase 5:

```
/tmp/build-block-figma/
  mobile.png
  tablet.png
  desktop.png
```

### Build a per-breakpoint element inventory

After reading all Figma frames, compile a **comparison table** listing
every visible element at each breakpoint.  Example format:

```
Element         | Mobile | Tablet | Desktop
────────────────────────────────────────────
Heading         | ✓      | ✓      | ✓
Body text       | ✓      | ✓      | ✓
CTA button      | ✓      | ✓      | ✓
Hero image      | ✓      | ✓      | ✓
```

If an element appears in **any** Figma frame, explicitly flag which
breakpoints include it and which do not.  Carry this inventory forward into
Phase 4 as a checklist.

---

## Phase 4 — Build the component

### Check out the working branch (remote-branch-mode only)

Skip this section if `remote-branch-mode` is `false` (localhost).

**Load `references/remote-branch-workflow.md` section 3 now** and follow
steps 1–2 only (fetch and check out the temporary local branch from the
upstream feature branch).  Do **not** commit or push yet.  All file
creation and editing below happens on this temporary branch.

### Create block files

Create files at:
- `event-libs/v1/blocks/<name>/<name>.js`
- `event-libs/v1/blocks/<name>/<name>.css`

### JS structure

The JS file must follow this pattern (matching the event-libs `init`
convention, which mirrors milo C2 blocks):

```javascript
import { createTag, getEventConfig, LIBS } from '../../utils/utils.js';

export default async function init(el) {
  // Optionally import Milo utilities dynamically:
  // const eventConfig = getEventConfig();
  // const miloLibs = eventConfig?.miloConfig?.miloLibs ?? LIBS;
  // const { decorateButtons } = await import(`${miloLibs}/utils/decorate.js`);

  // Modify el in place
}
```

Only import from `../../utils/utils.js` or `../../deps/` for synchronous
imports.  All Milo utility imports must be dynamic via `LIBS`.

### Register the block in EVENT_BLOCKS

Open `event-libs/v1/libs.js` and add the new block's kebab-case name to
the `EVENT_BLOCKS` array.  **This step is mandatory** — without it, the
Milo block loader will not auto-load the block.

> `EVENT_BLOCKS` is the event-libs equivalent of milo's `C2_BLOCKS` in
> `libs/utils/utils.js`.  The two registries are independent — do not add
> event-libs blocks to `C2_BLOCKS`.

### Scaffold a WTR test

Create a minimal test scaffold:
- `test/unit/blocks/<name>/<name>.test.js`
- `test/unit/blocks/<name>/mocks/default.html`

Test file template:

```javascript
import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/blocks/<name>/<name>.js';

describe('<name> block', () => {
  beforeEach(async () => {
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
    document.head.innerHTML = '';
  });

  it('initialises without errors', async () => {
    const block = document.querySelector('.<name>');
    await init(block);
    expect(block).to.exist;
  });
});
```

`mocks/default.html` should contain the minimal authored HTML the block
expects (one `<div class="<name>">` with representative content rows).

### Lint and fix

Run the linter on the newly created files before proceeding:

```bash
npm run lint:fix
npm run lint
```

Fix all remaining lint errors.  Do not move to Phase 5 until both JS and
CSS pass with zero errors.

### Commit and push (remote-branch-mode only)

Skip this section if `remote-branch-mode` is `false` (localhost).

Complete the remaining steps from `remote-branch-workflow.md` section 3
(steps 3–4): commit the block's JS, CSS, and `event-libs/v1/libs.js`,
push to the feature branch, then clean up the temporary local branch.

---

## Phase 5 — Visual comparison loop

### 5a. Pre-flight check

Before taking any screenshots, navigate to the preview URL (constructed
in 5b) and verify the block loaded:

1. Check that `document.querySelector('.<block-name>')` exists.
2. Check `data-block-status` equals `"loaded"`.
3. Check the browser console for block-loading errors (404 on JS or CSS).

**Common failures and fixes:**
- **Block JS 404** — the `EVENT_BLOCKS` entry in `event-libs/v1/libs.js`
  may not be present, or the CDN hasn't indexed the new file yet.  Trigger
  per-file code preview as described in
  `references/remote-branch-workflow.md` section 4a, wait 10–15 seconds,
  then reload.
- **Block not found on localhost** — restart `npm run event-libs` and
  reload the page.
- **`data-block-status` is null** — the block JS was never fetched.  Check
  the network/console for the root cause before proceeding.

Do **not** proceed to screenshots until the pre-flight check passes.

### 5b. Construct the Playwright URL

**Localhost mode:** use the page URL as-is.

**Remote-branch-mode:** append `?eventlibs=<branch-name>` to the page URL:

```
<page-url>?eventlibs=<branch-name>
```

Example:
```
https://main--<repo>--<org>.aem.live/drafts/<your-ldap>/test-page?eventlibs=my-block-autogenerated
```

This URL is referred to as the **Playwright URL** in all subsequent steps
and agents.

### 5c. Force-refresh after code push (remote-branch-mode only)

Skip this section if `remote-branch-mode` is `false`.

Follow the CDN force-refresh procedure in
`references/remote-branch-workflow.md` section 4.

### 5d. Visual comparison

**Load `agents/visual-comparison.md` now** — it defines what to assess
(layout, spacing, colour, media) and how to identify fixes.

For each provided breakpoint, screenshot the component and compare against
the cached Figma frame.  Maximum **5 passes** total across all breakpoints.
Stop early if fidelity is high.

**What counts as one pass:**

- **Localhost mode**: identify issues → fix locally → reload →
  re-screenshot.
- **Remote-branch-mode**: identify issues → fix locally → batch with other
  fixes → push (section 3) → force-refresh (section 4) → re-screenshot.
  A single pass may contain multiple fixes but counts as one pass toward
  the limit.  See `references/remote-branch-workflow.md` section 5 for the
  batching criteria.

**Important**: only after the visual loop is complete, proceed to Phase 6
and Phase 7.  Do not run accessibility or performance checks during visual
iteration.

---

## Phase 6 — Accessibility audit

**Load `agents/accessibility-check.md` now** and follow its procedure.

Run axe-core against the block's container element.  Fix any WCAG 2.2 AA
violations found.  If fixes require code changes **and
`remote-branch-mode` is `true`**, push via
`references/remote-branch-workflow.md` section 3, then force-refresh per
section 4.
Report the subagent's **Obstacles Encountered** section in the final
summary.

---

## Phase 7 — Performance audit

**Load `agents/performance-check.md` now** and follow its procedure.

Run a Lighthouse audit against the Playwright URL.  Assess LCP impact and
flag any regressions.  If fixes require code changes **and
`remote-branch-mode` is `true`**, push via
`references/remote-branch-workflow.md` section 3, then force-refresh per
section 4.
Report the subagent's **Obstacles Encountered** section in the final
summary.

---

## Phase 8 — Summary

Output:

1. **Component name** and file paths created.
2. **Feature branch** (remote-branch-mode only) — branch name, repo
   (`adobecom/event-libs`), and number of commits pushed.
3. **Breakpoints implemented** and which Figma frames they correspond to.
4. **CSS tokens used** — list every `--color-*`, `--spacing-*`, and
   `--type-*` token referenced.
5. **Hardcoded values** — any Figma values with no matching token, with an
   explanatory comment in the CSS.
6. **Acceptance criteria checklist** — confirm each criterion from Phase 4
   passes (or note exceptions with reasoning).
7. **Test scaffold** — confirm the WTR test file exists and passes:
   ```bash
   npx wtr test/unit/blocks/<name>/<name>.test.js --node-resolve --port=2000
   ```
8. **Accessibility results** — axe-core summary + any remaining issues.
9. **Performance results** — Lighthouse score, LCP, CLS, INP, TBT.
10. **Obstacles Encountered** — aggregated from all subagents, including
    visual discrepancies the user should review manually.

### Next steps (remote-branch-mode only)

After presenting the summary, suggest the user's likely next actions:
- **Open a PR** from `<branch-name>` into `main` for code review.
- **Test in context** at `<page-url>?eventlibs=<branch-name>`.
- **Delete the feature branch** if the code was exploratory.

### Cleanup

After presenting the summary, ask the user whether to remove the
`/tmp/build-block-figma/` cache.  If the user confirms, delete it:

```bash
rm -rf /tmp/build-block-figma
```
