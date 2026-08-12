import { expect } from '@esm-bundle/chai';
import {
  setFederalRootOverride,
  fetchFederalIcon,
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
});
