import { expect } from '@esm-bundle/chai';
import { setEventConfig } from '../../../../event-libs/v1/utils/utils.js';
import { setFederalRootOverride } from '../../../../event-libs/v1/features/icons/federal-icons.js';
import { resolveIcon } from '../../../../event-libs/v1/features/icons/icon-resolver.js';

describe('icon-resolver', () => {
  before(() => {
    setEventConfig({}, { miloLibs: '/test/unit/features/icons/mocks/libs' });
    setFederalRootOverride('/test/unit/features/icons/mocks/federal');
  });

  it('resolves an icon from federal first, even when Milo also has it', async () => {
    const svg = await resolveIcon('chevron-right');
    expect(svg).to.not.equal(null);
    expect(svg.classList.contains('icon-federal-chevron-right')).to.equal(true);
  });

  it('resolves an icon from Milo when federal does not have it', async () => {
    const svg = await resolveIcon('search');
    expect(svg).to.not.equal(null);
    expect(svg.classList.contains('icon-milo-search')).to.equal(true);
  });

  it('returns null for a track icon not in federal or Milo — no sprite fallback', async () => {
    const svg = await resolveIcon('mainstage');
    expect(svg).to.equal(null);
  });

  it('returns null when no source has the icon', async () => {
    const svg = await resolveIcon('does-not-exist-anywhere');
    expect(svg).to.equal(null);
  });

  it('returns null for an empty icon name', async () => {
    expect(await resolveIcon('')).to.equal(null);
  });

  it('returns a fresh clone on every call, not the same node instance', async () => {
    const first = await resolveIcon('chevron-right');
    const second = await resolveIcon('chevron-right');
    expect(first).to.not.equal(second);
    expect(first.isEqualNode(second)).to.equal(true);
  });
});
