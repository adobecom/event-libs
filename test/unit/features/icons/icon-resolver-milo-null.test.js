import { expect } from '@esm-bundle/chai';
import { setEventConfig } from '../../../../event-libs/v1/utils/utils.js';
import { setFederalRootOverride } from '../../../../event-libs/v1/features/icons/federal-icons.js';
import { resolveIcon } from '../../../../event-libs/v1/features/icons/icon-resolver.js';

// Regression test for MWPW-200314 item 11: Milo's real fetchIcons() resolves to `null`
// (not a thrown error) on a failed/404 sprite fetch. Without normalizing that to {},
// resolveIcon()'s `miloIcons[iconName]` lookup would throw — and since loadMiloIcons()
// memoizes the promise forever, every icon lookup for the rest of the page's lifetime
// would throw too, not just this one call. Needs its own file/module instance, since
// icon-resolver.js's miloIconsPromise memoization is per-module, not per-test.
describe('icon-resolver — Milo fetchIcons() resolving to null', () => {
  before(() => {
    // No fixture for either name here, so federal genuinely misses and falls through.
    setFederalRootOverride('/test/unit/features/icons/mocks/federal');
    setEventConfig({}, { miloLibs: '/test/unit/features/icons/mocks/libs-milo-null' });
  });

  it('does not throw, and returns null (no third tier to fall back to)', async () => {
    const svg = await resolveIcon('mainstage');
    expect(svg).to.equal(null);
  });

  it('returns null, not a throw, for a name in no tier at all', async () => {
    let threw = false;
    let result;
    try {
      result = await resolveIcon('does-not-exist-anywhere');
    } catch {
      threw = true;
    }
    expect(threw).to.equal(false);
    expect(result).to.equal(null);
  });
});
