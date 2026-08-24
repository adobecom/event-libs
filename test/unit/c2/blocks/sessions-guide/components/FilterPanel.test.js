import { expect } from '@esm-bundle/chai';
import { FilterPanel } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/FilterPanel.js';
import { SessionGuideContext } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { sessions } from '../../../../../../event-libs/v1/utils/session-store.js';
import { initTierOneEventConfig } from '../../../../../../event-libs/v1/utils/tier-1-event-config.js';

// Only authored products get an icon; every other value falls through to text-only.
const TIER_ONE_CONFIG = {
  products: {
    Photoshop: { icon: 'photoshop-64', pageUrl: '/photoshop' },
    Illustrator: { icon: 'illustrator-64', pageUrl: '/illustrator' },
  },
};

const FILTER_CATEGORIES = [
  { id: 'Product', label: 'Product' },
  { id: 'Type', label: 'Session Type' },
  { id: 'Audience', label: 'Audience' },
];

// Flat fields (getFilterValue falls back to them) are enough to exercise option derivation.
// productAttributeId marks 'Product' as the product category; 'Illustrator' is deliberately
// also an Audience value, as it is in the real catalog.
const SESSIONS = [
  {
    id: 's1', productAttributeId: 'Product', Product: 'Photoshop', Type: 'Lab', Audience: 'Illustrator',
  },
  {
    id: 's2', productAttributeId: 'Product', Product: 'Not product specific', Type: 'Session', Audience: 'Marketer',
  },
];

function setState({ filterCategories = FILTER_CATEGORIES, activeFilters = {} } = {}) {
  SessionGuideContext._current = {
    state: { activeFilters, guideConfig: { filterCategories } },
    dispatch: () => {},
  };
}

function render(props = {}) {
  return FilterPanel({ onClose: () => {}, ...props });
}

describe('FilterPanel', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify(TIER_ONE_CONFIG);
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  beforeEach(() => {
    sessions.value = SESSIONS;
    setState();
  });

  it('returns null when no filter categories are configured', () => {
    setState({ filterCategories: [] });
    expect(render()).to.equal(null);
  });

  it('renders the panel shell with the "Filters" title', () => {
    const out = render();
    expect(out).to.include('sg-filter-panel');
    expect(out).to.include('Filters');
  });

  it('renders a category button per configured category, first one active', () => {
    const out = render();
    expect(out).to.include('Session Type');
    // Active category is opacity/bold-driven via the --active modifier.
    expect(out).to.include('sg-filter-panel__cat--active');
  });

  it('renders a pill per derived option of the active category', () => {
    const out = render();
    expect(out).to.include('sg-filter-pill');
    expect(out).to.include('Photoshop');
    expect(out).to.include('Not product specific');
  });

  it('renders a product icon only for options that map to an authored product', () => {
    const out = render();
    // The Icon component always emits an `sg-icon` span; a text-only pill never does.
    // "Photoshop" is authored, "Not product specific" is not — exactly one icon.
    const iconCount = out.split('sg-icon').length - 1;
    expect(iconCount).to.equal(1);
  });

  // 'Illustrator' is also a real Audience option (the job role) — text-only there.
  it('never renders a product icon in a non-product category', () => {
    setState({ filterCategories: [{ id: 'Audience', label: 'Audience' }] });
    const out = render();
    expect(out).to.include('Illustrator');
    expect(out).to.not.include('sg-icon');
  });

  it('marks a pill selected (border + checkmark) when its value is in activeFilters', () => {
    setState({ activeFilters: { Product: new Set(['Photoshop']) } });
    const out = render();
    expect(out).to.include('sg-filter-pill--selected');
  });

  it('shows the active-count badge reflecting the number of selected filters', () => {
    setState({ activeFilters: { Product: new Set(['Photoshop']) } });
    const out = render();
    expect(out).to.include('sg-filter-panel__active-count');
  });

  it('renders Apply and Reset all actions', () => {
    const out = render();
    expect(out).to.include('Filter-Apply');
    expect(out).to.include('Apply');
    expect(out).to.include('Filter-Reset-All');
    expect(out).to.include('Reset all');
  });

  // Without this, Milo's Lenis smooth-scroll (loaded by parallax/rich-content sections)
  // preventDefault()s every wheel and touchmove, and the option list can't be scrolled.
  it('opts the panel out of Lenis scroll hijacking', () => {
    expect(render()).to.include('data-lenis-prevent');
  });

  it('shows an empty state when the active category has no options', () => {
    // No session carries a "Region" value, so its option list is empty.
    setState({ filterCategories: [{ id: 'Region', label: 'Region' }] });
    const out = render();
    expect(out).to.include('sg-filter-panel__empty');
  });
  // Mobile is a two-screen drill-down (Figma 11519-32674/32675): the categories are screen
  // one and a category's options are screen two, so they are never rendered together. The
  // wider layouts show both columns at once.
  describe('responsive layout', () => {
    let originalMatchMedia;

    beforeEach(() => { originalMatchMedia = window.matchMedia; });
    afterEach(() => { window.matchMedia = originalMatchMedia; });

    const forceMobile = (mobile) => {
      window.matchMedia = (q) => ({
        matches: q.includes('max-width: 767px') ? mobile : !mobile,
        addEventListener: () => {},
        removeEventListener: () => {},
      });
    };

    it('renders only the category list on mobile, with drill-in chevrons', () => {
      forceMobile(true);
      const out = render();
      expect(out).to.include('sg-filter-panel__cat-chevron');
      expect(out).to.not.include('sg-filter-panel__options');
      expect(out).to.not.include('sg-filter-pill');
    });

    it('renders categories and their options together above mobile', () => {
      forceMobile(false);
      const out = render();
      expect(out).to.include('sg-filter-panel__options');
      expect(out).to.include('sg-filter-pill');
    });
  });
});
