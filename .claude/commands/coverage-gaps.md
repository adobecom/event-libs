Find test coverage gaps in the event-libs codebase.

## Step 1 — Inventory

List every block in `event-libs/v1/blocks/` and every utility in `event-libs/v1/utils/`. Then list every test file under `test/unit/`.

## Step 2 — Cross-reference

For each source file, check whether a corresponding test file exists:
- Block `event-libs/v1/blocks/<name>/<name>.js` → `test/unit/blocks/<name>/<name>.test.js`
- Utility `event-libs/v1/utils/<name>.js` → `test/unit/scripts/<name>.test.js`

## Step 3 — Depth check

For files that *do* have tests, skim the test file and the source file to assess coverage quality:
- Are the main exported functions tested?
- Are error/edge cases covered (empty input, missing DOM elements, failed fetch)?
- Does `beforeEach` reset both `document.body.innerHTML` and `document.head.innerHTML`?

## Report format

```
MISSING TESTS
  - event-libs/v1/blocks/foo/foo.js   (no test file)
  - event-libs/v1/utils/bar.js        (no test file)

SHALLOW TESTS
  - bento-cards: happy path only, no test for reversed layout or carousel trigger
  - ...

WELL COVERED
  - ...
```

Finish by recommending which gap to close first and why (prioritise blocks with complex DOM manipulation or BlockMediator interactions).
