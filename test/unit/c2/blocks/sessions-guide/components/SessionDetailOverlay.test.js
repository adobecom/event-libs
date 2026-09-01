import { expect } from '@esm-bundle/chai';
import { SessionDetailOverlay } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/SessionDetailOverlay.js';
import { SessionGuideContext } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import {
  sessions, scheduled, favorited, pendingActions, liveStreamActiveIds,
} from '../../../../../../event-libs/v1/utils/session-store.js';
import { initTierOneEventConfig } from '../../../../../../event-libs/v1/utils/tier-1-event-config.js';

// Photoshop is the only product with an authored icon/pageUrl, so the unmapped-product
// fallback is exercised by every other product name below.
const TIER_ONE_CONFIG = {
  products: {
    Photoshop: { icon: 'photoshop-64', pageUrl: 'https://www.adobe.com/products/photoshop' },
  },
  trackIcons: { Photography: { icon: 'camera-64', color: '#ff0000' } },
};

const HOUR = 3600e3;

function makeSession(overrides = {}) {
  return {
    id: 's-1',
    rfCode: 'RF1',
    title: 'Day One Keynote',
    description: 'A session about everything.',
    // Upcoming by default, so the schedule CTA is the one on screen.
    startTimeUtc: new Date(Date.now() + 2 * HOUR).toISOString(),
    endTimeUtc: new Date(Date.now() + 3 * HOUR).toISOString(),
    primaryTrack: 'Photography',
    tracks: ['Business'],
    additionalTracks: [],
    trackOverride: '',
    technicalLevel: 'General',
    contentCategory: ['How To'],
    audience: ['Designers'],
    industry: [],
    aiFocus: [],
    closedCaptions: '',
    ipodOrGdprCopy: '',
    speakers: [],
    products: [],
    resources: [],
    mrStreamId: null,
    inPerson: false,
    isLivestreamed: false,
    isOnline: false,
    sessionPageUrl: '',
    isKeynote: false,
    customAttributeValues: {},
    ...overrides,
  };
}

function setState(session) {
  sessions.value = [session];
  SessionGuideContext._current = {
    state: {
      activeSessionId: session.id,
      guideConfig: { userTz: 'America/Los_Angeles', surface: 'widget' },
    },
    dispatch: () => {},
  };
}

function render(overrides = {}) {
  const session = makeSession(overrides);
  setState(session);
  return SessionDetailOverlay({ onBack: () => {} });
}

describe('SessionDetailOverlay', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify(TIER_ONE_CONFIG);
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  beforeEach(() => {
    scheduled.value = new Set();
    favorited.value = new Set();
    pendingActions.value = new Set();
    liveStreamActiveIds.value = new Set();
  });

  it('returns null when the active session is not in the catalog', () => {
    sessions.value = [];
    SessionGuideContext._current = {
      state: { activeSessionId: 'nope', guideConfig: {} },
      dispatch: () => {},
    };
    expect(SessionDetailOverlay({ onBack: () => {} })).to.equal(null);
  });

  it('renders the title, the track badge and the meta divider between badge and time', () => {
    const out = render();
    expect(out).to.include('Day One Keynote');
    expect(out).to.include('sg-detail__channel-name');
    expect(out).to.include('sg-detail__meta-divider');
  });

  // Authored HTML like the disclaimer below -- the catalog sends
  // `<p><strong>Bold test. Favorite this session…</strong></p>` -- so the same htm-stub caveat
  // applies: only the wrapper is assertable here, the markup itself in utils/rich-text.test.js.
  describe('IPOD/GDPR copy', () => {
    it('omits the wrapper when the field is empty', () => {
      expect(render()).to.not.include('sg-detail__legal"');
    });

    it('renders the wrapper when authored', () => {
      const out = render({ ipodOrGdprCopy: '<p><strong>Recording notice.</strong></p>' });
      expect(out).to.match(/<div[^>]*class="sg-detail__legal"/);
    });
  });

  // The captions row was removed from this view. closedCaptions is still carried on the
  // session, so assert the value cannot leak back into the markup on its own.
  describe('closed captions (removed from this view)', () => {
    it('renders nothing for closedCaptions, authored or not', () => {
      expect(render()).to.not.include('sg-detail__captions');
      const out = render({ closedCaptions: 'Closed captions available in English and German' });
      expect(out).to.not.include('sg-detail__captions');
      expect(out).to.not.include('Closed captions available in English and German');
    });
  });

  // The disclaimer is sourced from the public sessions catalog, which is reachable before an
  // event goes live. It never renders in the guide's overlay, authored or not -- the
  // individual session page hydrates it directly on page creation instead.
  describe('legal disclaimer', () => {
    it('never renders, even when the field is authored', () => {
      expect(render()).to.not.include('sg-detail__legal-disclaimer');
      const out = render({ legalDisclaimer: '<p><b>Copyrighted by Adobe Inc.</b></p>' });
      expect(out).to.not.include('sg-detail__legal-disclaimer');
    });
  });

  describe('attribute list', () => {
    // Fixed order per design: Technical level, Track, AI focus, Audience, Category.
    it('renders the five attributes in the designed order', () => {
      const out = render({ aiFocus: ['Generative AI'] });
      const order = ['Technical level', 'Track', 'AI focus', 'Audience', 'Category']
        .map((label) => out.indexOf(label));
      expect(order.every((i) => i > -1), `missing a label: ${order}`).to.be.true;
      expect(order).to.deep.equal([...order].sort((a, b) => a - b));
    });

    it('labels the content category "Category", not "Content category"', () => {
      const out = render();
      expect(out).to.include('Category');
      expect(out).to.not.include('Content category');
      expect(out).to.include('How To');
    });

    // The attribute does not exist in the catalog yet, so the row must stay away rather than
    // render an empty one -- and appear on its own once authoring starts.
    it('omits the AI focus row until the attribute is authored', () => {
      expect(render()).to.not.include('AI focus');
    });

    it('renders AI focus, joined, once it is authored', () => {
      const out = render({ aiFocus: ['Generative AI', 'Agentic'] });
      expect(out).to.include('AI focus');
      expect(out).to.include('Generative AI, Agentic');
    });

    // Dropped from the list: not in the design, and absent from the real catalog.
    it('never renders an Industry row, even when the field carries values', () => {
      expect(render({ industry: ['Retail', 'Media'] })).to.not.include('Industry');
    });

    it('drops any row whose value is empty', () => {
      const out = render({ technicalLevel: '', audience: [], contentCategory: [] });
      expect(out).to.not.include('Technical level');
      expect(out).to.not.include('Audience');
      expect(out).to.include('Track');
    });

    // The "Track" row is the separate "Track" topic-tag customAttribute, not the primary
    // Event Site Track (`session.primaryTrack`, rendered separately as the channel badge)
    // or `additionalTracks` — see sessions-api.js.
    it('renders the Track row from tracks, not additionalTracks', () => {
      const out = render({ tracks: ['Business', 'Creativity'], additionalTracks: ['Storytelling'] });
      expect(out).to.include('Business, Creativity');
      expect(out).to.not.include('Storytelling');
    });

    it('omits the Track row when tracks has no values', () => {
      const out = render({ tracks: [] });
      expect(out).to.not.include('Track');
    });
  });

  // Session resources are sourced from the public sessions catalog, which is reachable before
  // an event goes live. The pod never renders in the guide's overlay -- the individual session
  // page hydrates it directly on page creation instead.
  describe('session resources', () => {
    it('never renders the pod, with or without resources', () => {
      expect(render({ resources: [] })).to.not.include('sg-detail__group--resources');
      const out = render({ resources: [{ title: 'Sample PSD', url: 'https://example.com/a.psd' }] });
      expect(out).to.not.include('sg-detail__group--resources');
      expect(out).to.not.include('Sample PSD');
    });
  });

  // The count is only meaningful when the list is truncated, so it appears under exactly the
  // condition that grows the Show more toggle -- over 6 products, over 5 speakers.
  describe('pod heading counts', () => {
    const products = (n) => Array.from({ length: n }, (_, i) => `Product ${i}`);
    const speakers = (n) => Array.from({ length: n }, (_, i) => ({ name: `Speaker ${i}`, title: '' }));

    // The description carries its own Show more, so the toggle has to be looked for inside
    // the pod rather than anywhere in the markup.
    const pod = (out, name) => {
      const start = out.indexOf(`sg-detail__group--${name}`);
      if (start === -1) return '';
      const next = out.indexOf('sg-detail__group--', start + 1);
      return out.slice(start, next === -1 ? undefined : next);
    };

    it('hides the products count at exactly the collapsed length', () => {
      const out = render({ products: products(6) });
      expect(out).to.include('Featured products');
      expect(out).to.not.include('sg-detail__count');
      expect(pod(out, 'products')).to.not.include('sg-detail__more');
    });

    it('shows the products count once the list is truncated', () => {
      const out = render({ products: products(7) });
      expect(out).to.include('<span class="sg-detail__count">(7)</span>');
      expect(pod(out, 'products')).to.include('sg-detail__more');
    });

    it('hides the speakers count at exactly the collapsed length', () => {
      const out = render({ speakers: speakers(5) });
      expect(out).to.include('Speakers');
      expect(out).to.not.include('sg-detail__count');
    });

    it('shows the speakers count once the list is truncated', () => {
      const out = render({ speakers: speakers(6) });
      expect(out).to.include('<span class="sg-detail__count">(6)</span>');
    });

    it('hides it for a single-item list too', () => {
      expect(render({ products: products(1), speakers: speakers(1) }))
        .to.not.include('sg-detail__count');
    });
  });

  describe('featured products', () => {
    it('links a product that has an authored pageUrl, and marks it as leaving the guide', () => {
      const out = render({ products: ['Photoshop'] });
      // The test stub renders interpolated attribute values unquoted.
      expect(out).to.include('href="https://www.adobe.com/products/photoshop"');
      expect(out).to.include('sg-detail__product-linkout');
      expect(out).to.include('daa-ll="Featured-Product"');
    });

    it('renders an unmapped product as a non-link tile with the placeholder icon', () => {
      const out = render({ products: ['Some Unmapped Product'] });
      expect(out).to.include('Some Unmapped Product');
      expect(out).to.include('sg-detail__product-icon--placeholder');
      expect(out).to.not.include('sg-detail__product-linkout');
    });

    it('shows the full count in the heading and collapses past six', () => {
      const products = Array.from({ length: 10 }, (_, i) => `Product ${i + 1}`);
      const out = render({ products });
      expect(out).to.include('(10)');
      expect(out).to.include('Product 6');
      expect(out).to.not.include('Product 7');
      expect(out).to.include('aria-controls="sg-detail-products"');
    });

    it('offers no toggle when the list fits the collapsed length', () => {
      const out = render({ products: ['Photoshop', 'Illustrator'] });
      expect(out).to.not.include('aria-controls="sg-detail-products"');
    });
  });

  describe('speakers', () => {
    const speakers = Array.from({ length: 7 }, (_, i) => ({
      name: `Speaker ${i + 1}`, title: 'Adobe', photo: null,
    }));

    it('collapses past five and reports the true total', () => {
      const out = render({ speakers });
      expect(out).to.include('(7)');
      expect(out).to.include('Speaker 5');
      expect(out).to.not.include('Speaker 6');
      expect(out).to.include('aria-controls="sg-detail-speakers"');
    });

    it('falls back to a placeholder when a speaker has no photo', () => {
      const out = render({ speakers: [speakers[0]] });
      expect(out).to.include('sg-detail__speaker-photo--placeholder');
    });
  });

  describe('primary CTA', () => {
    it('offers Add to schedule for an upcoming session', () => {
      const out = render();
      expect(out).to.include('Add to schedule');
      expect(out).to.not.include('Watch now');
    });

    it('offers Watch now once the session is on demand', () => {
      const out = render({
        startTimeUtc: new Date(Date.now() - 3 * HOUR).toISOString(),
        endTimeUtc: new Date(Date.now() - 2 * HOUR).toISOString(),
      });
      expect(out).to.include('Watch now');
      expect(out).to.not.include('Add to schedule');
    });
  });
});
