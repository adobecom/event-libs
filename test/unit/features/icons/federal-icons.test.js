import { expect } from '@esm-bundle/chai';
import {
  setFederalRootOverride,
  fetchFederalIcon,
  fetchFederalIconList,
  fetchFederalProductIcon,
  fetchFederalTrackIcon,
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

  it('does not fall back to the product-logo namespace', async () => {
    // 'photoshop-64' exists under /assets/svgs/ (see fetchFederalProductIcon below), not
    // under the generic /assets/icons/svgs/ path — fetchFederalIcon must not find it there.
    const svg = await fetchFederalIcon('photoshop-64');
    expect(svg).to.equal(null);
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

describe('federal-icons — fetchFederalTrackIcon (track-icon namespace only)', () => {
  before(() => {
    setFederalRootOverride('/test/unit/features/icons/mocks/federal');
  });

  it('resolves a track icon federal has', async () => {
    const svg = await fetchFederalTrackIcon('branding');
    expect(svg).to.not.equal(null);
    expect(svg.classList.contains('icon-federal-branding')).to.equal(true);
  });

  it('does not fall back to the generic icon namespace', async () => {
    // 'thumbs-up' exists under the generic /assets/icons/svgs/ path (see above), not
    // under /assets/icons/track-icons/ — fetchFederalTrackIcon must not find it there.
    const svg = await fetchFederalTrackIcon('thumbs-up');
    expect(svg).to.equal(null);
  });

  it('does not fall back to the product-logo namespace either', async () => {
    // 'photoshop-64' exists under /assets/svgs/ (see fetchFederalProductIcon above),
    // not under /assets/icons/track-icons/.
    const svg = await fetchFederalTrackIcon('photoshop-64');
    expect(svg).to.equal(null);
  });

  it('returns null for an empty icon name', async () => {
    expect(await fetchFederalTrackIcon('')).to.equal(null);
  });

  it('rewrites a black fill/stroke set directly on the root <svg>, not just descendants', async () => {
    const svg = await fetchFederalTrackIcon('root-black-fill');
    expect(svg.getAttribute('fill')).to.equal('currentColor');
  });

  // Real track-icon artwork ships literal fill="black"/stroke="black" (Illustrator export),
  // not fill="currentcolor" like the generic /assets/icons/svgs/ namespace — so neither an
  // author's chosen track color nor a card's hover-to-white state had anything to actually
  // recolor. two-tone.svg reproduces that shape: a black fill, a stroke, a white cutout,
  // and the root's own fill="none".
  it('rewrites literal black fill/stroke to currentColor, so track color and hover-to-white keep working', async () => {
    const svg = await fetchFederalTrackIcon('two-tone');
    const [path, , strokedPath] = svg.querySelectorAll('*');
    expect(path.getAttribute('fill')).to.equal('currentColor');
    expect(strokedPath.getAttribute('stroke')).to.equal('currentColor');
  });

  it('leaves an intentional white cutout and the root\'s fill="none" untouched', async () => {
    const svg = await fetchFederalTrackIcon('two-tone');
    const circle = svg.querySelector('circle');
    expect(circle.getAttribute('fill')).to.equal('white');
    expect(svg.getAttribute('fill')).to.equal('none');
  });
});

// MWPW: creative-cloud-64/frame-io-64 rendered as a flat, mostly-monochrome smudge
// instead of their real multi-color art. Root cause: federal's SVGs are Illustrator
// exports that reuse generic ids (clip-path, linear-gradient, ...) across unrelated
// icons — cloneNode(true) preserves those ids verbatim, so a page rendering more than
// one such icon (or the same icon twice) gets url(#clip-path)/url(#linear-gradient)
// references that resolve to whichever element with that id comes first in the DOM,
// not necessarily the icon's own — silently breaking the clip/gradient with nothing to
// throw. Both fixtures below deliberately share the same generic ids, mirroring the
// real creative-cloud-64/frame-io-64 collision.
describe('federal-icons — id collisions across inlined SVGs', () => {
  before(() => {
    setFederalRootOverride('/test/unit/features/icons/mocks/federal');
  });

  it('gives every returned instance its own unique ids, not the ids as-authored', async () => {
    const svg = await fetchFederalProductIcon('frame-io-64');
    const clipPath = svg.querySelector('clipPath');
    expect(clipPath.id).to.not.equal('clip-path');
    expect(clipPath.id).to.match(/^clip-path-fedicon\d+$/);
  });

  it('rewrites every url(#id) reference within the tree to the new id', async () => {
    const svg = await fetchFederalProductIcon('frame-io-64');
    const clipPath = svg.querySelector('clipPath');
    const gradient = svg.querySelector('linearGradient');
    const group = svg.querySelector('g');
    const rect = svg.querySelector('rect[fill]');
    expect(group.getAttribute('clip-path')).to.equal(`url(#${clipPath.id})`);
    expect(rect.getAttribute('fill')).to.equal(`url(#${gradient.id})`);
  });

  it('rewrites bare #id references (xlink:href) too', async () => {
    const svg = await fetchFederalProductIcon('frame-io-64');
    const clipPath = svg.querySelector('clipPath');
    const use = svg.querySelector('use');
    expect(use.getAttribute('xlink:href')).to.equal(`#${clipPath.id}`);
  });

  it('gives two different icons that happen to share generic ids independent ids', async () => {
    const frameIo = await fetchFederalProductIcon('frame-io-64');
    const creativeCloud = await fetchFederalProductIcon('creative-cloud-64');
    const frameIoClipId = frameIo.querySelector('clipPath').id;
    const ccClipId = creativeCloud.querySelector('clipPath').id;
    expect(frameIoClipId).to.not.equal(ccClipId);
    // And each one's own reference still points at its own (rewritten) id, not the other's.
    expect(frameIo.querySelector('g').getAttribute('clip-path')).to.equal(`url(#${frameIoClipId})`);
    expect(creativeCloud.querySelector('g').getAttribute('clip-path')).to.equal(`url(#${ccClipId})`);
  });

  it('gives two clones of the same icon independent ids too, not just different icons', async () => {
    const first = await fetchFederalProductIcon('frame-io-64');
    const second = await fetchFederalProductIcon('frame-io-64');
    expect(first.querySelector('clipPath').id).to.not.equal(second.querySelector('clipPath').id);
  });

  it('leaves an id-free icon untouched', async () => {
    const svg = await fetchFederalProductIcon('photoshop-64');
    expect(svg.querySelectorAll('[id]')).to.have.lengthOf(0);
  });
});
