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

  ['sessions-guide', 'sessions-guide-full-page'].forEach((blockClass) => {
    it(`disables only mobile/tablet full-page card blur while resizing ${blockClass}`, async () => {
      await new Promise((resolve, reject) => {
        frame.onload = resolve;
        frame.onerror = reject;
        frame.src = '/test/unit/c2/blocks/sessions-guide/mocks/full-page-spacing.html';
        document.body.appendChild(frame);
      });

      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      doc.querySelector('.sessions-guide-full-page').className = blockClass;
      const buttons = `
        <button class="sg-icon-btn sg-icon-btn--outlined sg-icon-btn--on-light" type="button">Play</button>
        <button class="sg-icon-btn sg-icon-btn--solid sg-icon-btn--on-light" type="button">Favorite</button>`;
      doc.querySelector('.sg-full-page__body').insertAdjacentHTML('beforeend', `
        <div class="sg-card"><div class="sg-card__actions">${buttons}</div></div>
        <div class="sg-live-card">${buttons}</div>
        ${buttons}`);
      doc.querySelector('.sg-portal').insertAdjacentHTML('beforeend', `<div class="sg-card">${buttons}</div>`);

      for (const width of [375, 767, 768, 1024, 1279, 1280, 1440, 1920, 1024]) {
        frame.style.width = `${width}px`;
        expect(frame.clientWidth).to.equal(width);
        expect(win.innerWidth).to.equal(width);
        doc.querySelectorAll('.sg-icon-btn').forEach((button) => {
          const pageCard = button.closest('.sg-full-page .sg-card');
          const defaultBlur = button.classList.contains('sg-icon-btn--solid')
            ? 'blur(4.6875px)' : 'blur(16px)';
          const expected = pageCard && width < 1280 ? 'none' : defaultBlur;
          expect(win.getComputedStyle(button).backdropFilter, `${button.className} at ${width}px`)
            .to.equal(expected);
        });
      }
    });
  });

  ['sessions-guide-full-page', 'sg-portal'].forEach((surface) => {
    it(`keeps scheduled on-demand row interactions consistent in ${surface}`, async () => {
      frame.style.width = '1440px';
      await new Promise((resolve, reject) => {
        frame.onload = resolve;
        frame.onerror = reject;
        frame.src = '/test/unit/c2/blocks/sessions-guide/mocks/full-page-spacing.html';
        document.body.appendChild(frame);
      });
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      doc.body.innerHTML = `<div class="${surface}">
        <div class="sg-time-row" style="display:block">
          <button id="row-focus" type="button">Row action</button>
          <div style="display:grid;grid-template-columns:repeat(2,450px);gap:8px">
            ${['', 'is-scheduled', 'is-favorited', 'is-scheduled is-favorited'].map((state) => `
              <article class="sg-card sg-card--on-demand ${state}" style="transition:none">
                <button type="button">Card action</button>
              </article>`).join('')}
          </div>
        </div>
      </div>`;
      const cards = [...doc.querySelectorAll('.sg-card')];
      const rowFocus = doc.getElementById('row-focus');
      const color = (card) => win.getComputedStyle(card).backgroundColor;
      const restingWidths = cards.map((card) => win.getComputedStyle(card).width);
      const restingColor = color(cards[0]);
      cards.forEach((card) => expect(color(card)).to.equal(restingColor));
      frame.focus();
      const focusedColors = cards.map((card) => {
        card.querySelector('button').focus();
        return color(card);
      });
      expect(focusedColors[1]).to.not.equal('rgb(255, 255, 255)');
      expect(focusedColors[1]).to.not.equal(restingColor);
      for (const width of [375, 768, 1100, 1279, 1280, 1440, 1920, 1100, 1440]) {
        frame.style.width = `${width}px`;
        rowFocus.focus();
        cards.forEach((card, index) => {
          expect(color(card), `${card.className} at ${width}px`)
            .to.equal(width >= 1280 ? 'rgb(255, 255, 255)' : restingColor);
          if (width >= 1280) {
            expect(win.getComputedStyle(card).width).to.equal(restingWidths[index]);
          }
        });
        for (const [index, card] of cards.entries()) {
          const cardAction = card.querySelector('button');
          cardAction.focus();
          expect(doc.activeElement).to.equal(cardAction);
          expect(card.matches(':focus-within')).to.equal(true);
          expect(color(card), `${card.className} at ${width}px`)
            .to.equal(width >= 1280 ? focusedColors[index] : restingColor);
        }
      }
    });
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
