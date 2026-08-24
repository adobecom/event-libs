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
    track: 'Photography',
    additionalTracks: [],
    trackOverride: '',
    technicalLevel: 'General',
    contentCategory: ['How To'],
    audience: ['Designers'],
    industry: [],
    aiFocus: [],
    closedCaptions: '',
    legalCopy: '',
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

  describe('captions and legal copy', () => {
    it('omits both rows when the fields are empty', () => {
      const out = render();
      expect(out).to.not.include('sg-detail__captions');
      expect(out).to.not.include('sg-detail__legal');
    });

    it('renders the captions sentence verbatim when authored', () => {
      const out = render({ closedCaptions: 'Closed captions available in English and German' });
      expect(out).to.include('sg-detail__captions');
      expect(out).to.include('Closed captions available in English and German');
    });

    it('renders the IPOD/GDPR notice when authored', () => {
      const out = render({ legalCopy: 'Recording notice.' });
      expect(out).to.include('sg-detail__legal');
      expect(out).to.include('Recording notice.');
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

  describe('session resources', () => {
    const resources = [
      { title: 'Sample PSD', url: 'https://example.com/a.psd' },
      { title: 'Presentation', url: 'https://example.com/b.pdf', action: 'Open' },
      { title: 'Extra', url: 'https://example.com/c.pdf' },
    ];

    it('collapses past two and honours a per-resource action label', () => {
      const out = render({ resources });
      expect(out).to.include('Sample PSD');
      expect(out).to.include('Open');
      expect(out).to.not.include('Extra');
      expect(out).to.include('aria-controls="sg-detail-resources"');
    });

    it('defaults the action label to Download', () => {
      const out = render({ resources: [resources[0]] });
      expect(out).to.include('Download');
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
