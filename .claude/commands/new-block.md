Scaffold a complete new event-libs block named "$ARGUMENTS". Do all four steps without asking for confirmation.

## Step 1 — Block implementation

Create `event-libs/v1/blocks/$ARGUMENTS/$ARGUMENTS.js` with this template (fill in real logic if a description was provided alongside the name; otherwise use the stub):

```javascript
import { createTag, getEventConfig, LIBS } from '../../utils/utils.js';

export default async function init(el) {
  const eventConfig = getEventConfig();
  const miloLibs = eventConfig?.miloConfig?.miloLibs ?? LIBS;
  const { decorateButtons } = await import(`${miloLibs}/utils/decorate.js`);

  decorateButtons(el);

  // TODO: implement $ARGUMENTS block
}
```

Rules:
- Use `createTag()` not `document.createElement`
- Dynamic Milo imports must use the `miloLibs` variable, never a hardcoded URL
- Log errors with `window.lana?.log()`, never `console.error`
- `async/await` only — no `.then()` chains
- All imports need `.js` extensions

## Step 2 — Register in libs.js

Add `'$ARGUMENTS'` to the `EVENT_BLOCKS` array in `event-libs/v1/libs.js`. Keep the array in its current order and add the new entry at the end.

## Step 3 — Test file

Create `test/unit/blocks/$ARGUMENTS/$ARGUMENTS.test.js`:

```javascript
import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/blocks/$ARGUMENTS/$ARGUMENTS.js';

const body = await readFile({ path: './mocks/default.html' });

describe('$ARGUMENTS block', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = body;
  });

  it('initialises without throwing', async () => {
    const el = document.querySelector('.$ARGUMENTS');
    await init(el);
    expect(el).to.exist;
  });
});
```

## Step 4 — Mock fixture

Create `test/unit/blocks/$ARGUMENTS/mocks/default.html` with a minimal realistic fixture:

```html
<div class="$ARGUMENTS">
  <div>
    <div>
      <p>Sample content for $ARGUMENTS block</p>
    </div>
  </div>
</div>
```

## After all four steps

Run `npx wtr "test/unit/blocks/$ARGUMENTS/$ARGUMENTS.test.js" --node-resolve --port=2000` and report the result. If the test fails, fix the issue before stopping.
