import { expect } from '@esm-bundle/chai';
import { UpNextCarousel } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/UpNextCarousel.js';

const SESSION = { id: 's-1', title: 'Upcoming Session' };

describe('UpNextCarousel', () => {
  it('renders nothing for an empty list', () => {
    expect(UpNextCarousel({ sessions: [] })).to.equal(null);
  });

  it('renders nothing for an undefined list', () => {
    expect(UpNextCarousel({ sessions: undefined })).to.equal(null);
  });

  it('renders the section wrapper when there are upcoming sessions', () => {
    const out = UpNextCarousel({ sessions: [SESSION] });
    expect(out).to.include('sb-carousel-section--up-next');
  });
});
