import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderTrackTags } from '../../../../../event-libs/v1/c2/blocks/event-session-details/track-tags.js';

const attr = (name, inputType, values) => ({ name, inputType, enabled: true, values });

function setAttrs(list) {
  setMetadata('custom-attributes', JSON.stringify(list));
}

describe('Track Tags', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('renders Primary then Additional tracks, stacked in order', () => {
    setAttrs([
      attr('Primary Event Site Track', 'single-select', [{ value: 'keynotes-sneaks', label: 'Keynotes & Sneaks' }]),
      attr('Additional Event Site Tracks', 'multi-select', [
        { value: 'branding', label: 'Branding' },
        { value: 'photography', label: 'Photography' },
      ]),
    ]);
    const el = renderTrackTags();
    const tags = [...el.querySelectorAll('.track-tag')];
    expect(tags).to.have.lengthOf(3);
    expect(tags[0].classList.contains('track-tag--primary')).to.be.true;
    expect(tags.map((t) => t.textContent)).to.deep.equal(['Keynotes & Sneaks', 'Branding', 'Photography']);
    expect(tags[1].classList.contains('track-tag--additional')).to.be.true;
  });

  it('Override replaces Primary (no star when a Primary exists)', () => {
    setAttrs([
      attr('Primary Event Site Track', 'single-select', [{ value: 'keynotes-sneaks', label: 'Keynotes & Sneaks' }]),
      attr('Override Primary Event Site Track', 'text', [{ value: 'Mainstage Broadcast' }]),
    ]);
    const el = renderTrackTags();
    const tags = [...el.querySelectorAll('.track-tag')];
    expect(tags).to.have.lengthOf(1);
    expect(tags[0].classList.contains('track-tag--override')).to.be.true;
    expect(tags[0].querySelector('.track-tag-label').textContent).to.equal('Mainstage Broadcast');
    // has a (generic) icon, but NOT the star since a Primary exists behind it
    expect(tags[0].querySelector('.track-tag-icon')).to.not.be.null;
    expect(el.querySelector('.track-tag-icon--star')).to.be.null;
  });

  it('Override shows a star icon when there is no Primary behind it', () => {
    setAttrs([
      attr('Override Primary Event Site Track', 'text', [{ value: 'Mainstage Broadcast' }]),
      attr('Additional Event Site Tracks', 'multi-select', [{ value: 'branding', label: 'Branding' }]),
    ]);
    const el = renderTrackTags();
    const tags = [...el.querySelectorAll('.track-tag')];
    expect(tags).to.have.lengthOf(2);
    expect(tags[0].classList.contains('track-tag--override')).to.be.true;
    expect(tags[0].querySelector('.track-tag-icon--star')).to.not.be.null;
    expect(tags[1].classList.contains('track-tag--additional')).to.be.true;
  });

  it('renders null when there are no tracks', () => {
    setAttrs([attr('Product', 'multi-select', [{ value: 'photoshop', label: 'Photoshop' }])]);
    expect(renderTrackTags()).to.be.null;
  });
});
