import { expect } from '@esm-bundle/chai';
import { CategoryBadge } from '../../../../../event-libs/v1/blocks/sessions-guide/components/CategoryBadge.js';
import { initTrackIconConfig } from '../../../../../event-libs/v1/utils/track-icon-config.js';

describe('CategoryBadge', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'track-icon-config';
    meta.content = JSON.stringify({
      'Social Media': { icon: 'social-media', color: '#FF6B35' },
    });
    document.head.appendChild(meta);
    initTrackIconConfig();
  });

  it('renders without throwing', () => {
    expect(() => CategoryBadge({ category: 'Social Media' })).to.not.throw();
  });

  it('applies the color from an exact-key config match', () => {
    const html = CategoryBadge({ category: 'Social Media' });
    expect(html).to.include('color:#FF6B35');
  });

  it('shows the raw category string as the label', () => {
    const html = CategoryBadge({ category: 'Social Media' });
    expect(html).to.include('Social Media');
  });

  it('falls back to the default mainstage icon/color when the category has no config entry', () => {
    const html = CategoryBadge({ category: 'Unmapped Track' });
    expect(html).to.include('Unmapped Track');
    // #E91E63 is the built-in default mainstage color (see track-icon-config.js).
    expect(html).to.include('color:#E91E63');
  });

  it('falls back to "General" as the label when there is no category at all', () => {
    const html = CategoryBadge({ category: undefined });
    expect(html).to.include('General');
  });

  it('applies the --sm modifier class when size is "sm"', () => {
    const html = CategoryBadge({ category: 'Social Media', size: 'sm' });
    expect(html).to.include('sg-category-badge--sm');
  });
});
