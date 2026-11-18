# C2 Summit Experience Implementation Plan

Status: Proposed. This document does not implement the loader, registry, or blocks.

## Objective

Reuse existing event-libs C2 blocks for Summit and add new C2 blocks where needed,
without modifying existing MAX block implementations or introducing a
`c2/summit/` hierarchy.

Separate the component foundation from experience composition:

- **C2** owns component implementations.
- **Summit** selects components and adds explicitly scoped presentation or setup.
- **da-events** selects and registers the experience before Milo loads the page.

## Constraints

- Do not edit existing C2 MAX block JavaScript or CSS for Summit requirements.
- Do not change the existing `EVENT_BLOCKS_C2` registry for this implementation.
- Keep new C2 components under `event-libs/v1/c2/blocks/`.
- Name new components by capability, not brand, unless genuinely Summit-specific.
- Do not copy the existing C2 component catalog.
- Do not routinely mirror C2 blocks under the Summit experience directory.
- Do not introduce Summit branches throughout shared components.
- Preserve existing C1 and non-Summit C2 loading behavior.
- Do not hard-code vertical page spacing; retain author-controlled spacing.

This design requires a small change to the shared da-events bootstrap. It avoids
changes to existing MAX blocks, not all shared infrastructure.

## Current Integration

Evidence was inspected through a read-only, UNINDEXED fallback because Scout was
not available. da-events references below describe its `stage` branch at planning
time, not a verified production deployment.

- `event-libs/v1/libs.js` exports `EVENT_BLOCKS_C2`.
- [da-events scripts.js:100](https://github.com/adobecom/da-events/blob/stage/events/scripts/scripts.js#L100)
  identifies C2 through `foundation: c2`.
- [da-events scripts.js:318-330](https://github.com/adobecom/da-events/blob/stage/events/scripts/scripts.js#L318-L330)
  registers `${EVENT_LIBS}/c2` and `EVENT_BLOCKS_C2` with Milo before setting event
  configuration.
- [da-events scripts.js:354-364](https://github.com/adobecom/da-events/blob/stage/events/scripts/scripts.js#L354-L364)
  loads Milo foundation styles and event-libs C2 global styles.
- [da-events utils.js:10-28](https://github.com/adobecom/da-events/blob/stage/events/scripts/utils.js#L10-L28)
  resolves the event-libs base. Preview/local hosts support `?eventlibs=<branch>`;
  production hosts use `/event-libs/v1`.
- `event-libs/v1/c2/blocks/event-card/event-card.js` resolves its own stylesheet
  relative to the module. Its CSS includes component-local custom properties and
  hardcoded presentation values.

Therefore, adding an experience directory alone will not make Summit load.
da-events must explicitly select its registry and load its optional assets.

## Proposed Structure

All additions below are proposed. Example block names are illustrative, not
committed Summit requirements.

```text
event-libs/v1/
  c2/
    blocks/
      event-card/                  # Existing; unchanged
      event-carousel/              # Existing; unchanged
      networking-agenda/           # Example new C2 capability
    utils/                         # Shared C2 helpers
  experiences/
    summit/
      registry.js                  # Explicit block-name allowlist
      summit.css                   # Only if visual customization is needed
      summit.js                    # Only if experience setup is needed
```

`experiences/` is a sibling of `c2/`, not a directory inside it. The Summit
directory owns experience composition: which components are selected, which
scoped presentation applies, and what optional page-level setup is required.
It is not a second component library.

Do not create empty setup modules, utility directories, or adapter directories
in anticipation of future requirements.

### Utility Ownership

Place helpers according to responsibility, not merely because they are functions:

- Shared C2 functionality belongs in `c2/utils/<capability>.js`. New reusable
  functionality may use a separate file without modifying existing MAX helpers.
- A small Summit-only helper stays alongside its consuming experience module.
- Substantial Summit-only functionality stays within the Summit experience
  boundary. Extract a dedicated module only when a concrete requirement warrants
  it; no `experiences/summit/utils/` directory is required by default.

A separate Summit-specific file in `c2/utils/` is technically possible, but is
not the default: that location should communicate shared C2 responsibility.
Do not accumulate event-specific helpers or brand branches in shared utilities.

### Block Extensions Are Exceptional

Do not establish `experiences/summit/blocks/<block>/` as the routine customization
pattern. A sparse mirror can be discoverable, but systematic overrides become a
parallel implementation hierarchy with coupling to the original blocks.

Use the following order when evaluating a Summit requirement:

1. Reuse an existing block's authored variants and supported configuration.
2. Apply scoped Summit CSS for presentation-only differences.
3. Add a capability-named C2 component for genuinely different functionality.
4. Use a thin experience adapter only when the preceding options cannot safely
   satisfy the requirement and a stable extension boundary exists.

Any exceptional adapter needs a documented reason, supported integration point,
initialization owner, and focused regression tests. This plan does not introduce
a second block base, automatic path fallback, or a generic override framework.
An exception requiring loader changes must specify those changes separately.

## Authoring Contract

Summit pages opt in using metadata:

```text
foundation: c2
event-experience: summit
```

`event-experience` is a new application contract, not an existing automatic
Milo feature.

- C2 plus `summit` selects the Summit registry.
- Absent experience metadata preserves the current registration.
- Non-C2 pages retain their existing foundation and block registration.
- Unsupported nonempty experience values or Summit on a non-C2 page must be
  reported through the repository-standard error reporting mechanism. Preserve
  the existing foundation path rather than silently treating a typo as Summit.

Authors continue using normal block names. A Summit page can author an existing
`event-card` and a new capability block without a Summit prefix.

## Implementation

### 1. Add the Summit Registry in event-libs

Create `event-libs/v1/experiences/summit/registry.js` with a named
`SUMMIT_BLOCKS` export containing an explicit list of approved block names.

```javascript
export const SUMMIT_BLOCKS = [
  'event-card',
  'event-carousel',
  // Add real new capability names when their implementations are available.
];
```

Do not spread `EVENT_BLOCKS_C2` into this list: new MAX registrations should not
automatically expand the Summit catalog. Do not list placeholders that lack an
implementation.

Import this registry directly from da-events only on Summit pages. No change to
the current event-libs barrel or MAX registry is required.

### 2. Add New Capability Blocks as Needed

For each approved Summit requirement that cannot use an existing block:

1. Add its implementation under `event-libs/v1/c2/blocks/<capability>/`.
2. Follow the established async block initializer, shared utility, accessibility,
   error reporting, and block-scoped CSS conventions.
3. Add focused unit tests and authored fixtures.
4. Register the name only in `SUMMIT_BLOCKS` initially.

A C2 block's location does not require adding it to the existing MAX registry.
Existing shared blocks remain eligible for direct reuse without modification.

### 3. Wire Experience Selection in da-events

Modify `events/scripts/scripts.js` in the separate `adobecom/da-events` repository.

After metadata helpers are available, but before constructing `CONFIG`:

1. Read `foundation` and the proposed `event-experience` metadata.
2. For an explicitly opted-in C2 Summit page, dynamically import
   `${EVENT_LIBS}/experiences/summit/registry.js`.
3. Validate that the selected registry exports the expected block-name list.
4. Use that list in the existing C2 `externalLibs` descriptor, retaining the base
   `${EVENT_LIBS}/c2`.
5. Otherwise retain the existing C2 or C1 registration exactly.

Keep the current ordering of other external libraries. Do not register a second
competing descriptor for the same C2 blocks.

A requested Summit registry that fails to load must produce an explicit error
and fail the selected experience initialization; do not disguise the failure by
substituting the MAX registry.

The loading sequence becomes:

```text
DA page metadata
  -> da-events bootstrap selects experience
  -> Summit registry imported only when selected
  -> Milo configuration registers /c2 with selected block names
  -> foundation styles and optional Summit assets prepared
  -> existing decoration and loadArea flow
  -> authored blocks resolve under /c2/blocks/<name>/<name>.js
```

Do not manually initialize blocks that Milo already owns.

### 4. Isolate Summit Presentation and Setup

Only if Summit requires customization:

- Set `data-event-experience="summit"` on the document root before decoration.
- Load Summit assets only on opted-in pages.
- Scope every Summit CSS override under that root attribute.
- Keep base C2 styles, tokens, and existing block CSS unchanged.
- Prefer existing semantic custom properties where they support the requirement.
- Where local block variables or hardcoded rules prevent inheritance, use
  narrowly targeted scoped rules, not global token mutations or broad selectors.

Integrate stylesheet ordering with the existing da-events style phase. Account
for block styles that are inserted later: link insertion order alone is not a
reliable override strategy. Use deliberate scoped specificity and test computed
styles after block initialization, including late-loaded blocks.

Start with `summit.css`. If it grows substantially, split presentation into
block-specific stylesheets within the experience and load them explicitly.
Splitting CSS does not require corresponding JavaScript wrappers, a mirrored
block implementation directory, or a second block registry base. A CSS-only
change must continue to reuse the original block initializer directly.

Load any required experience setup before the work it affects. Make setup
idempotent for DA preview redecoration, without duplicate subscriptions or
listeners. Add a cleanup strategy if adapters have a lifecycle.

### 5. Bound Adapter Responsibilities

Use adapters only for public, stable extension points or surrounding composition.
They must not rebuild another block's internal DOM, invoke its initializer twice,
or race its asynchronous state updates.

Do not create one adapter per reused block or require JavaScript wrappers to load
CSS extensions. Keep adapters exceptional under the decision order above.

If Summit needs different internal behavior with no supported extension point,
the existing block cannot be reused unchanged for that requirement. Implement
the distinct capability separately rather than hiding a fork in DOM patches.

## Verification

Use the native test conventions in each repository. The following cases are
required; exact test filenames depend on the implementation.

| Case | Expected result |
| --- | --- |
| Existing C2 MAX page, no experience metadata | Original registry and styling; no Summit asset requests |
| Existing C1 page | Original C1 registration and behavior |
| C2 Summit page with reused block | Original block module resolves from `/c2/blocks/` |
| C2 Summit page with new block | New module loads from the same C2 base |
| Unsupported or incompatible metadata | Explicit diagnostic; existing foundation path preserved |
| Summit registry unavailable or malformed | Explicit failure; no MAX-registry substitution |
| Summit style customization | Scoped computed styles remain correct after block CSS loads |
| DA preview redecoration | No duplicate initialization, listeners, or subscriptions |

Add focused registry-selection tests in da-events and behavior tests for each new
event-libs block. Test that the non-Summit path makes no Summit registry import.
Avoid tests that merely repeat constant lists.

For a new event-libs block, use the repository's targeted WTR command:

```bash
npx wtr test/unit/c2/blocks/<capability>/<capability>.test.js --node-resolve --port=2000
```

Run JavaScript lint and lint each new C2 stylesheet explicitly:

```bash
npm run lint:js
npx stylelint event-libs/v1/c2/blocks/<capability>/<capability>.css
```

Confirm script availability against package.json when implementing. The standard
CSS lint glob does not cover C2 blocks; lint any added Summit stylesheet directly
as well. Use da-events' own documented commands for its loader changes.

Perform browser checks on representative Summit and MAX fixtures at supported
viewport sizes. Cover signed-in/out and session-state transitions where reused
components depend on them, plus keyboard behavior for new interactive blocks.

No commands above have been run as part of this documentation-only task.

## Rollout and Rollback

1. Implement and preview the event-libs registry and any new capability blocks.
2. Implement the opt-in da-events loader change on a separate feature branch.
3. Test the da-events preview with `?eventlibs=<event-libs-feature-branch>`.
   That parameter selects the library source, not the Summit experience.
4. Deploy the event-libs assets before publishing pages that opt in. Deploy the
   compatible da-events loader before enabling Summit metadata.
5. Validate deployed asset availability, then enable metadata on a pilot Summit
   page and run the Summit/MAX regression matrix.
6. Publish remaining Summit content after pilot acceptance.

If Summit rollout fails, revert the opt-in content change and restore a verified
pre-Summit page version. Removing metadata alone is not sufficient for pages
containing Summit-only block names that the MAX registry does not register.

On production, `eventlibs` does not switch the library source. Coordinate normal
asset deployment and cache invalidation across both repositories.

## Isolation Boundary

This plan prevents Summit-only code and styles from being selected on MAX pages.
It does not freeze shared dependencies or guarantee independent release behavior.

Both experiences still consume existing C2 modules, utilities, services, and Milo.
An explicit Summit registry controls component selection, not dependency versions.
If independent release stability becomes a requirement, design a supported
immutable release mechanism covering the dependency graph as a separate task;
the current production `/event-libs/v1` resolution does not provide that pin.

## Acceptance Criteria

- Existing MAX C2 block implementations and registry are unchanged.
- New Summit-required blocks reside in the normal C2 block catalog.
- No Summit directory is introduced beneath `c2/`.
- The Summit directory owns composition, not a mirrored component catalog.
- Shared C2 helpers and Summit-only helpers follow the documented ownership rules.
- CSS-only extensions do not introduce block initializer wrappers.
- Any exceptional adapter documents its integration boundary and regression tests.
- da-events selects Summit only through the documented opt-in metadata.
- Reused and new blocks load through the existing C2 base and Milo loader.
- Non-Summit pages do not load Summit-only assets or setup.
- Scoped styles survive asynchronous block loading without changing MAX.
- Selection tests, new-block tests, lint, and the browser regression matrix pass.
- Both repositories and the DA content rollout have a documented release order.
