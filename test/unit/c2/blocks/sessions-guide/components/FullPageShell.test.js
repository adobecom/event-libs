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

describe('FullPageShell/layout', () => {
  let frame;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    frame = document.createElement('iframe');
    frame.style.border = '0';
    frame.style.height = '1200px';
  });

  afterEach(() => {
    frame.remove();
  });

  [375, 767, 768, 1024, 1279, 1280, 1440, 1920].forEach((width) => {
    ['sessions-guide', 'sessions-guide-full-page'].forEach((blockClass) => {
      it(`joins the header and Recommended section for ${blockClass} at ${width}px`, async () => {
        frame.style.width = `${width}px`;
        await new Promise((resolve, reject) => {
          frame.onload = resolve;
          frame.onerror = reject;
          frame.src = '/test/unit/c2/blocks/sessions-guide/mocks/full-page-spacing.html';
          document.body.appendChild(frame);
        });

        const doc = frame.contentDocument;
        doc.querySelector('.sessions-guide-full-page').className = blockClass;
        const header = doc.querySelector('.sg-full-page__header-wrap');
        const body = doc.querySelector('.sg-full-page__body');
        const section = body.querySelector('.sg-carousel-section--recommended');
        const widget = doc.querySelector('.sg-portal');
        const widgetHeader = widget.querySelector('.sg-header');
        const widgetSection = widget.querySelector('.sg-carousel-section--recommended');
        const gap = section.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
        const widgetGap = widgetSection.getBoundingClientRect().top
          - widgetHeader.getBoundingClientRect().bottom;
        const style = frame.contentWindow.getComputedStyle(body);

        expect(frame.contentWindow.innerWidth).to.equal(width);
        expect(gap).to.equal(0);
        expect(gap).to.equal(widgetGap);
        expect(style.paddingTop).to.equal('0px');
        expect(style.paddingBottom).to.equal(style.getPropertyValue('--s2a-spacing-lg').trim());
        expect(section.getBoundingClientRect().height).to.be.greaterThan(0);
      });
    });
  });
});
