import { expect } from '@esm-bundle/chai';
import { FilterPanel } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/FilterPanel.js';
import { SessionGuideContext } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { sessions } from '../../../../../../event-libs/v1/utils/session-store.js';
import { initTierOneEventConfig } from '../../../../../../event-libs/v1/utils/tier-1-event-config.js';

// One product ('Photoshop') is authored, so only its pill gets an icon; every other
// option value (incl. "Not product specific") falls through to text-only.
const TIER_ONE_CONFIG = {
  products: {
    Photoshop: { icon: 'photoshop-64', pageUrl: '/photoshop' },
  },
};

const FILTER_CATEGORIES = [
  { id: 'Product', label: 'Product' },
  { id: 'Type', label: 'Session Type' },
];

// getFilterValue reads customAttributeValues[id] first, then the flat field — these use
// the flat field, which is enough to exercise option derivation.
const SESSIONS = [
  { id: 's1', Product: 'Photoshop', Type: 'Lab' },
  { id: 's2', Product: 'Not product specific', Type: 'Session' },
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

  it('shows an empty state when the active category has no options', () => {
    // No session carries a "Region" value, so its option list is empty.
    setState({ filterCategories: [{ id: 'Region', label: 'Region' }] });
    const out = render();
    expect(out).to.include('sg-filter-panel__empty');
  });
});
