import { expect } from '@esm-bundle/chai';
import {
  setFederalRootOverride,
  fetchFederalIcon,
  fetchFederalIconList,
  fetchFederalProductIcon,
} from '../../../../event-libs/v1/features/icons/federal-icons.js';

describe('federal-icons', () => {
  before(() => {
    setFederalRootOverride('/test/unit/features/icons/mocks/federal');
  });

  it('resolves an icon federal has', async () => {
    const svg = await fetchFederalIcon('thumbs-up');
    expect(svg).to.not.equal(null);
    expect(svg.classList.contains('icon-federal-thumbs-up')).to.equal(true);
  });

  it('returns null when federal does not have the icon', async () => {
    const svg = await fetchFederalIcon('does-not-exist-anywhere');
    expect(svg).to.equal(null);
  });

  it('returns null for an empty icon name', async () => {
    expect(await fetchFederalIcon('')).to.equal(null);
  });

  it('returns a fresh clone on every call, not the same node instance', async () => {
    const first = await fetchFederalIcon('thumbs-up');
    const second = await fetchFederalIcon('thumbs-up');
    expect(first).to.not.equal(second);
    expect(first.isEqualNode(second)).to.equal(true);
  });

  it('caches a miss too — repeat calls for a missing icon both stay null', async () => {
    const first = await fetchFederalIcon('another-missing-icon');
    const second = await fetchFederalIcon('another-missing-icon');
    expect(first).to.equal(null);
    expect(second).to.equal(null);
  });

  it('lists the icon names federal has available, for icon pickers', async () => {
    const names = await fetchFederalIconList();
    expect(names).to.include('checkmark');
    expect(names).to.include('chevron-right');
  });

  it('falls back to the product-logo namespace when the generic one misses', async () => {
    const svg = await fetchFederalIcon('photoshop-64');
    expect(svg).to.not.equal(null);
    expect(svg.classList.contains('icon-federal-photoshop-64')).to.equal(true);
  });
});

describe('federal-icons — fetchFederalProductIcon (product-logo namespace only)', () => {
  before(() => {
    setFederalRootOverride('/test/unit/features/icons/mocks/federal');
  });

  it('resolves a product logo federal has', async () => {
    const svg = await fetchFederalProductIcon('photoshop-64');
    expect(svg).to.not.equal(null);
    expect(svg.classList.contains('icon-federal-photoshop-64')).to.equal(true);
  });

  it('does not fall back to the generic icon namespace', async () => {
    // 'thumbs-up' exists under the generic /assets/icons/svgs/ path (see above), not
    // under /assets/svgs/ — fetchFederalProductIcon must not find it there.
    const svg = await fetchFederalProductIcon('thumbs-up');
    expect(svg).to.equal(null);
  });

  it('returns null for an empty icon name', async () => {
    expect(await fetchFederalProductIcon('')).to.equal(null);
  });
});
