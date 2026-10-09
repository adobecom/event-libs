import { expect } from '@esm-bundle/chai';
import { SessionInfoPanel } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/SessionInfoPanel.js';
import { favorited, pendingActions } from '../../../../../../event-libs/v1/utils/session-store.js';

const SESSION = {
  id: 's-1',
  title: 'Pixel & Product',
  description: 'A session about everything.',
  primaryTrack: 'Design, Imaging & Illustration',
  startTimeUtc: '2026-11-10T18:00:00Z',
  endTimeUtc: '2026-11-10T18:15:00Z',
};

describe('SessionInfoPanel', () => {
  beforeEach(() => {
    favorited.value = new Set();
    pendingActions.value = new Set();
  });

  it('renders nothing when there is no active session', () => {
    expect(SessionInfoPanel({ session: null })).to.equal(null);
  });

  it('renders the session title and description', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('Pixel & Product');
    expect(out).to.include('A session about everything.');
  });

  it('renders a plain-text description as text, without the rich-text modifier', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.match(/<div[^>]*class="sb-info__desc"/);
    expect(out).to.not.include('is-rich-text');
  });

  // The htm stub doesn't serialize dangerouslySetInnerHTML; the markup is covered by rich-text tests.
  it('renders an HTML description through the rich-text wrapper, never as escaped text', () => {
    const out = SessionInfoPanel({ session: { ...SESSION, description: '<p>Intro</p><ul><li>One</li></ul>' } });
    expect(out).to.match(/<div[^>]*class="sb-info__desc is-rich-text"/);
    expect(out).to.not.include('&lt;p&gt;');
  });

  it('shows Add-to-Favorites when not favorited', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('daa-ll="Add-to-Favorites"');
  });

  it('shows Remove-from-Favorites once favorited', () => {
    favorited.value = new Set(['s-1']);
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('daa-ll="Remove-from-Favorites"');
  });

  // Collapsed has two Figma variants of its own (node 9935:12816 not-favorited vs 4975:45446
  // favorited) — mobile hides the description entirely while collapsed+favorited; tablet
  // always shows it (per follow-up request). The description now always renders in the DOM;
  // session-broadcast.css's `.is-favorited` rules do the actual hiding on mobile only, keyed
  // off this `is-favorited` class — untestable here (CSS, not JS), verified in a real browser.
  it('shows the description when collapsed and not favorited', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__desc-wrap');
    expect(out).to.include('A session about everything.');
    expect(out).to.not.include('is-favorited');
  });

  it('still renders the description when collapsed and favorited — marks is-favorited for CSS', () => {
    favorited.value = new Set(['s-1']);
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__desc-wrap');
    expect(out).to.include('A session about everything.');
    expect(out).to.include('is-favorited');
  });

  it('shows the badge row wrapper when collapsed and not favorited', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__meta');
  });

  it('omits the session duration without removing the badge row', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__meta');
    expect(out).to.not.include('sb-info__time');
    expect(out).to.not.include('15m');
  });

  it('still renders the badge row wrapper when collapsed and favorited — marks is-favorited for CSS', () => {
    favorited.value = new Set(['s-1']);
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__meta');
    expect(out).to.include('is-favorited');
  });

  it('shows a Share action alongside Favorite', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('daa-ll="Share"');
  });

  // The caret/expand toggle uses local component state, which the mocked htm-preact's
  // useState setter no-ops (see test/unit/mocks/deps/htm-preact.js) — the expanded branch
  // (track badge, untruncated description, "view all details" CTA) can't be reached
  // through this string-render harness. Collapsed is the only state testable here;
  // expand/collapse itself is verified via a preview harness in a real browser instead.
  it('starts collapsed — no "view all details" CTA until expanded', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.not.include('sb-info__view-all');
  });

  it('never shows an Add-to-Schedule CTA — the active session is always already live', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.not.include('Add-to-Schedule');
  });
});

describe('SessionInfoPanel/description layout', () => {
  let frame;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    favorited.value = new Set();
    pendingActions.value = new Set();
    frame = document.createElement('iframe');
    frame.style.border = '0';
    frame.style.height = '1200px';
  });

  afterEach(() => {
    frame.remove();
    favorited.value = new Set();
  });

  async function loadFrame(width) {
    frame.style.width = `${width}px`;
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
      frame.src = '/test/unit/c2/blocks/session-broadcast/mocks/session-info-layout.html';
      document.body.appendChild(frame);
    });
    expect(frame.contentWindow.innerWidth).to.equal(width);
    return frame.contentDocument.querySelector('.session-broadcast');
  }

  function renderPanel(block, { expanded = false, isFavorited = false } = {}) {
    favorited.value = new Set(isFavorited ? [SESSION.id] : []);
    block.innerHTML = SessionInfoPanel({
      session: {
        ...SESSION,
        description: `${SESSION.description} `.repeat(20),
      },
    });
    const panel = block.querySelector('.sb-info');
    const description = panel.querySelector('.sb-info__desc-wrap');
    // The string-render mock cannot toggle useState; exercise both CSS states directly.
    panel.classList.toggle('is-expanded', expanded);
    description.classList.toggle('is-expanded', expanded);
    return { panel, description };
  }

  [375, 767, 768, 1024, 1279, 1280, 1440, 1441, 1920].forEach((width) => {
    it(`preserves description sizing and visibility in all panel states at ${width}px`, async () => {
      const block = await loadFrame(width);

      [false, true].forEach((isFavorited) => {
        [false, true].forEach((expanded) => {
          const { panel, description } = renderPanel(block, { expanded, isFavorited });
          const style = frame.contentWindow.getComputedStyle(description);

          if (width < 768 && isFavorited && !expanded) {
            expect(style.display).to.equal('none');
            return;
          }

          const panelStyle = frame.contentWindow.getComputedStyle(panel);
          const panelRect = panel.getBoundingClientRect();
          const contentWidth = panelRect.width
            - parseFloat(panelStyle.paddingLeft) - parseFloat(panelStyle.paddingRight);
          const expectedWidth = width >= 768 ? 700 : contentWidth;
          const descriptionRect = description.getBoundingClientRect();
          const text = description.querySelector('.sb-info__desc');
          const lineHeight = parseFloat(frame.contentWindow.getComputedStyle(text).lineHeight);

          expect(style.display).to.not.equal('none');
          expect(descriptionRect.width).to.equal(expectedWidth);
          expect(text.getBoundingClientRect().width).to.equal(expectedWidth);
          expect(descriptionRect.left).to.equal(
            panelRect.left + parseFloat(panelStyle.paddingLeft),
          );
          expect(descriptionRect.right).to.be.at.most(panelRect.right);
          expect(panelRect.width).to.be.greaterThan(expectedWidth);
          expect(frame.contentDocument.documentElement.scrollWidth).to.equal(width);

          if (expanded) {
            expect(descriptionRect.height).to.be.greaterThan(lineHeight * 2);
          } else {
            expect(descriptionRect.height).to.be.closeTo(lineHeight * 2, 1);
          }
        });
      });
    });
  });

  it('fits a narrower host without overflowing at a tablet viewport', async () => {
    const block = await loadFrame(1024);
    block.style.width = '650px';
    const { panel, description } = renderPanel(block, { expanded: true });
    const style = frame.contentWindow.getComputedStyle(panel);
    const contentWidth = panel.getBoundingClientRect().width
      - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);

    expect(description.getBoundingClientRect().width).to.equal(contentWidth);
    expect(description.getBoundingClientRect().right)
      .to.be.at.most(panel.getBoundingClientRect().right);
  });
});
