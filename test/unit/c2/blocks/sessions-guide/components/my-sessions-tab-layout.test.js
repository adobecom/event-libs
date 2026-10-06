import { expect } from '@esm-bundle/chai';

// MWPW-210088: on the full page, the My Sessions / My Favorites tabs must share the header's gutter.
describe('Full-page My Sessions / My Favorites tab alignment', () => {
  let frame;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    frame = document.createElement('iframe');
    frame.style.border = '0';
    frame.style.height = '600px';
  });

  afterEach(() => {
    frame.remove();
  });

  async function loadFrame(width) {
    frame.style.width = `${width}px`;
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
      frame.src = '/test/unit/c2/blocks/sessions-guide/mocks/my-sessions-tab-layout.html';
      document.body.append(frame);
    });
    expect(frame.contentWindow.innerWidth).to.equal(width);
    return frame.contentDocument;
  }

  // Full-page gutter per tier: 24px below 1280, 156px from 1280, 160px from 1920.
  const gutterFor = (width) => {
    if (width >= 1920) return 160;
    if (width >= 1280) return 156;
    return 24;
  };

  [375, 767, 768, 1024, 1279, 1280, 1440, 1919, 1920, 2200].forEach((width) => {
    it(`lines the first tab up with the header title at ${width}px`, async () => {
      const doc = await loadFrame(width);
      const title = doc.querySelector('.sg-full-page .sg-header-title').getBoundingClientRect();
      const tabBar = doc.querySelector('.sg-full-page .sg-my-sessions-tab-bar');
      const firstTab = tabBar.querySelector('.sg-my-sessions-tab').getBoundingClientRect();
      const style = frame.contentWindow.getComputedStyle(tabBar);

      expect(firstTab.left).to.be.closeTo(title.left, 0.5);
      expect(style.paddingLeft).to.equal(`${gutterFor(width)}px`);
      expect(style.paddingRight).to.equal(`${gutterFor(width)}px`);
    });
  });

  it('leaves the widget (non-full-page) tab bar gutter unchanged on desktop', async () => {
    const doc = await loadFrame(1440);
    const tabBar = doc.querySelector('.sg-widget-context .sg-my-sessions-tab-bar');
    expect(frame.contentWindow.getComputedStyle(tabBar).paddingLeft).to.equal('24px');
  });
});
