import { expect } from '@esm-bundle/chai';
import { setEventConfig } from '../../../../event-libs/v1/utils/utils.js';
import { resolveIcon } from '../../../../event-libs/v1/features/icons/icon-resolver.js';

describe('icon-resolver', () => {
  before(() => {
    setEventConfig({}, { miloLibs: '/test/unit/features/icons/mocks/libs' });
  });

  it('resolves an icon from Milo first when Milo has it', async () => {
    const svg = await resolveIcon('chevron-right');
    expect(svg).to.not.equal(null);
    expect(svg.classList.contains('icon-milo-chevron-right')).to.equal(true);
  });

  it('falls back to the event-libs track-icons.svg sprite when Milo does not have it', async () => {
    const svg = await resolveIcon('mainstage');
    expect(svg).to.not.equal(null);
    expect(svg.classList.contains('icon-track-mainstage')).to.equal(true);
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
