import { expect } from '@esm-bundle/chai';
import { CategoryBadge } from '../../../../../event-libs/v1/blocks/sessions-guide/components/CategoryBadge.js';
import { initTierOneEventConfig } from '../../../../../event-libs/v1/utils/tier-1-event-config.js';

function session(overrides = {}) {
  return { id: 's-1', track: '', trackOverride: '', additionalTracks: [], ...overrides };
}

describe('CategoryBadge', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify({
      trackIcons: { 'Social Media': { icon: 'social-media', color: '#FF6B35' } },
    });
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  it('renders without throwing', () => {
    expect(() => CategoryBadge({ session: session({ track: 'Social Media' }) })).to.not.throw();
  });

  it('applies the color from an exact-key config match', () => {
    const html = CategoryBadge({ session: session({ track: 'Social Media' }) });
    expect(html).to.include('color:#FF6B35');
  });

  it('shows the primary track as the label', () => {
    const html = CategoryBadge({ session: session({ track: 'Social Media' }) });
    expect(html).to.include('Social Media');
  });

  it('falls back to the built-in default icon/color when the track has no authored config entry', () => {
    const html = CategoryBadge({ session: session({ track: 'Mainstage' }) });
    expect(html).to.include('Mainstage');
    // #E91E63 is the built-in default mainstage color (see tier-1-event-config.js).
    expect(html).to.include('color:#E91E63');
  });

  it('renders nothing when there is no primary track and no override (no "Other" badge)', () => {
    expect(CategoryBadge({ session: session() })).to.be.null;
  });

  it('applies the --sm modifier class when size is "sm"', () => {
    const html = CategoryBadge({ session: session({ track: 'Social Media' }), size: 'sm' });
    expect(html).to.include('sg-category-badge--sm');
  });

  it('shows a +N count when the session has additional tracks', () => {
    const html = CategoryBadge({ session: session({ track: 'Social Media', additionalTracks: ['Video'] }) });
    expect(html).to.include('+1');
  });

  it('shows the override text and generic icon when a trackOverride is set', () => {
    const html = CategoryBadge({ session: session({ trackOverride: 'custom label', additionalTracks: ['Video'] }) });
    expect(html).to.include('custom label');
    expect(html).to.include('color:#6E6E6E');
  });
});
