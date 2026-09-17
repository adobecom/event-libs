import { expect } from '@esm-bundle/chai';
import { categoryIdForSlug, categorySlugForId } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/FullPageShell.js';

const FILTER_CATEGORIES = [
  { id: 'attr-track', label: 'Track', slug: 'track' },
  { id: 'attr-region', label: 'Region', slug: 'region' },
];

describe('FullPageShell/categoryIdForSlug', () => {
  it('resolves a known slug to its attributeId', () => {
    expect(categoryIdForSlug(FILTER_CATEGORIES, 'track')).to.equal('attr-track');
  });

  it('returns null for an unrecognized slug (stale or renamed category)', () => {
    expect(categoryIdForSlug(FILTER_CATEGORIES, 'nope')).to.equal(null);
  });

  it('returns null when filterCategories is undefined', () => {
    expect(categoryIdForSlug(undefined, 'track')).to.equal(null);
  });
});

describe('FullPageShell/categorySlugForId', () => {
  it('resolves a known attributeId to its slug', () => {
    expect(categorySlugForId(FILTER_CATEGORIES, 'attr-region')).to.equal('region');
  });

  it('returns null for an attributeId no longer in the config', () => {
    expect(categorySlugForId(FILTER_CATEGORIES, 'attr-gone')).to.equal(null);
  });

  it('returns null when filterCategories is undefined', () => {
    expect(categorySlugForId(undefined, 'attr-track')).to.equal(null);
  });
});
