import { expect } from '@esm-bundle/chai';

describe('Session detail title wrapping', () => {
  let frame;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    frame = document.createElement('iframe');
    frame.style.border = '0';
    frame.style.height = '900px';
  });

  afterEach(() => {
    frame.remove();
  });

  async function loadFrame(width) {
    frame.style.width = `${width}px`;
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
      frame.src = '/test/unit/c2/blocks/sessions-guide/mocks/detail-title-layout.html';
      document.body.append(frame);
    });
    expect(frame.contentWindow.innerWidth).to.equal(width);
    return frame.contentDocument;
  }

  function lineWidths(title) {
    const range = title.ownerDocument.createRange();
    range.selectNodeContents(title);
    return [...range.getClientRects()].map((rect) => rect.width);
  }

  [375, 767, 768, 1024, 1279, 1280, 1440, 1572, 1920].forEach((width) => {
    it(`balances the full title without overflow at ${width}px`, async () => {
      const doc = await loadFrame(width);
      const title = doc.querySelector('.sg-detail__title');
      const style = frame.contentWindow.getComputedStyle(title);
      const titleBounds = title.getBoundingClientRect();
      const summaryBounds = title.closest('.sg-detail__group').getBoundingClientRect();

      expect(style.textWrap).to.equal('balance');
      expect(style.fontSize).to.equal(width >= 1280 ? '36px' : (width >= 768 ? '24px' : '20px'));
      expect(title.textContent).to.equal('In-House to Studio: Timeless Brands in the AI Era');
      expect(title.scrollWidth).to.be.at.most(title.clientWidth);
      expect(titleBounds.left).to.be.at.least(summaryBounds.left);
      expect(titleBounds.right).to.be.at.most(summaryBounds.right);
      expect(doc.documentElement.scrollWidth).to.equal(width);
      if (width >= 1280) expect(lineWidths(title).length).to.be.greaterThan(1);
    });
  });

  it('wraps sooner and evens out the lines at the reported 1572px breakpoint', async () => {
    const doc = await loadFrame(1572);
    const title = doc.querySelector('.sg-detail__title');
    const balanced = lineWidths(title);
    title.style.textWrap = 'wrap';
    const unbalanced = lineWidths(title);

    expect(balanced.length).to.equal(unbalanced.length);
    expect(balanced[0]).to.be.lessThan(unbalanced[0]);
    expect(Math.min(...balanced) / Math.max(...balanced))
      .to.be.greaterThan(Math.min(...unbalanced) / Math.max(...unbalanced));
  });
});
