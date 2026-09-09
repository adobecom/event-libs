import { expect } from '@esm-bundle/chai';
import { AlsoLiveCarousel } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/AlsoLiveCarousel.js';

const SESSION = { id: 's-1', title: 'Other Live Session' };

describe('AlsoLiveCarousel', () => {
  it('renders nothing for an empty list (ticket: hidden when only one session is live)', () => {
    expect(AlsoLiveCarousel({ sessions: [] })).to.equal(null);
  });

  it('renders nothing for an undefined list', () => {
    expect(AlsoLiveCarousel({ sessions: undefined })).to.equal(null);
  });

  it('renders the section wrapper when there are other live sessions', () => {
    const out = AlsoLiveCarousel({ sessions: [SESSION] });
    expect(out).to.include('sb-carousel-section--also-live');
  });
});
