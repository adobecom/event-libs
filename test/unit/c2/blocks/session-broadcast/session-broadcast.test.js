import { expect } from '@esm-bundle/chai';
import init, { parseBroadcastConfig, observeFillHeight } from '../../../../../event-libs/v1/c2/blocks/session-broadcast/session-broadcast.js';
import { sessionsStatus } from '../../../../../event-libs/v1/utils/session-store.js';

// Each "session ended image ..." row supports a link or an embedded picture; the fixture
// builds a real anchor by default — embedded-picture authoring gets its own test below.
function block(rows) {
  const el = document.createElement('div');
  el.className = 'session-broadcast';
  rows.forEach(([key, value]) => {
    const row = document.createElement('div');
    const k = document.createElement('div');
    k.textContent = key;
    const v = document.createElement('div');
    if (key.toLowerCase().startsWith('session ended image')) {
      const a = document.createElement('a');
      a.href = value;
      a.textContent = 'image';
      v.append(a);
    } else {
      v.textContent = value;
    }
    row.append(k, v);
    el.append(row);
  });
  return el;
}

describe('parseBroadcastConfig', () => {
  it('falls back to defaults when no rows are authored', () => {
    const config = parseBroadcastConfig(block([]));
    expect(config).to.deep.equal({
      alsoLiveTitle: 'Currently Live',
      upcomingTitle: 'Upcoming',
      viewAllDetailsLabel: 'View all details',
      sessionEndedImageUrlMobile: '',
      sessionEndedImageUrlTablet: '',
      sessionEndedImageUrlDesktop: '',
      sessionEndedImageUrlDesktopXl: '',
    });
  });

  it('picks up the title/label rows plus the legacy image row', () => {
    const config = parseBroadcastConfig(block([
      ['Also live title', 'Live Now'],
      ['Upcoming title', 'Coming Up'],
      ['View all details label', 'See more'],
      ['Session ended image', 'https://example.com/ended.png'],
    ]));
    expect(config.alsoLiveTitle).to.equal('Live Now');
    expect(config.upcomingTitle).to.equal('Coming Up');
    expect(config.viewAllDetailsLabel).to.equal('See more');
    expect(config.sessionEndedImageUrlMobile).to.include('ended.png');
    expect(config.sessionEndedImageUrlTablet).to.include('ended.png');
    expect(config.sessionEndedImageUrlDesktop).to.include('ended.png');
    expect(config.sessionEndedImageUrlDesktopXl).to.include('ended.png');
  });

  it('falls back to the default for any row left unauthored, independently of the others', () => {
    const config = parseBroadcastConfig(block([['Also live title', 'Live Now']]));
    expect(config.alsoLiveTitle).to.equal('Live Now');
    expect(config.upcomingTitle).to.equal('Upcoming');
  });

  describe('four breakpoint-specific "session ended image" rows', () => {
    it('reads each of the four rows independently when all are authored', () => {
      const config = parseBroadcastConfig(block([
        ['Session ended image mobile', 'https://example.com/mobile.png'],
        ['Session ended image tablet', 'https://example.com/tablet.png'],
        ['Session ended image desktop', 'https://example.com/desktop.png'],
        ['Session ended image desktop xl', 'https://example.com/desktop-xl.png'],
      ]));
      expect(config.sessionEndedImageUrlMobile).to.equal('https://example.com/mobile.png');
      expect(config.sessionEndedImageUrlTablet).to.equal('https://example.com/tablet.png');
      expect(config.sessionEndedImageUrlDesktop).to.equal('https://example.com/desktop.png');
      expect(config.sessionEndedImageUrlDesktopXl).to.equal('https://example.com/desktop-xl.png');
    });

    it('picks the widest source for desktop/desktop xl and strips its query params; mobile keeps the optimized default', () => {
      const el = document.createElement('div');
      el.innerHTML = `
        <div><div>Session ended image mobile</div>
          <div>
            <picture>
              <source type="image/webp" srcset="./media-a.png?width=2000&format=webply&optimize=medium" media="(min-width: 600px)">
              <source type="image/webp" srcset="./media-a.png?width=750&format=webply&optimize=medium">
              <source type="image/png" srcset="./media-a.png?width=2000&format=png&optimize=medium" media="(min-width: 600px)">
              <img loading="lazy" alt="" src="./media-a.png?width=750&format=png&optimize=medium" width="750" height="1334">
            </picture>
          </div>
        </div>
        <div><div>Session ended image desktop</div>
          <div>
            <picture>
              <source type="image/webp" srcset="./media-b.png?width=2000&format=webply&optimize=medium" media="(min-width: 600px)">
              <source type="image/webp" srcset="./media-b.png?width=750&format=webply&optimize=medium">
              <source type="image/png" srcset="./media-b.png?width=2000&format=png&optimize=medium" media="(min-width: 600px)">
              <img loading="lazy" alt="" src="./media-b.png?width=750&format=png&optimize=medium" width="1440" height="620">
            </picture>
          </div>
        </div>
        <div><div>Session ended image desktop xl</div>
          <div>
            <picture>
              <source type="image/webp" srcset="./media-c.png?width=2000&format=webply&optimize=medium" media="(min-width: 600px)">
              <source type="image/webp" srcset="./media-c.png?width=750&format=webply&optimize=medium">
              <source type="image/png" srcset="./media-c.png?width=2000&format=png&optimize=medium" media="(min-width: 600px)">
              <img loading="lazy" alt="" src="./media-c.png?width=750&format=png&optimize=medium" width="1920" height="666">
            </picture>
          </div>
        </div>`;
      const config = parseBroadcastConfig(el);
      expect(config.sessionEndedImageUrlMobile).to.include('media-a.png').and.to.include('width=750');
      expect(config.sessionEndedImageUrlDesktop).to.match(/\/media-b\.png$/);
      expect(config.sessionEndedImageUrlDesktopXl).to.match(/\/media-c\.png$/);
    });

    it('backfills a missing tier from its nearest authored neighbor', () => {
      // Ties favor the smaller neighbor; desktop xl backfills from desktop only.
      const config = parseBroadcastConfig(block([
        ['Session ended image mobile', 'https://example.com/mobile.png'],
        ['Session ended image desktop', 'https://example.com/desktop.png'],
      ]));
      expect(config.sessionEndedImageUrlMobile).to.equal('https://example.com/mobile.png');
      expect(config.sessionEndedImageUrlTablet).to.equal('https://example.com/mobile.png');
      expect(config.sessionEndedImageUrlDesktop).to.equal('https://example.com/desktop.png');
      expect(config.sessionEndedImageUrlDesktopXl).to.equal('https://example.com/desktop.png');
    });

    it('backfills every tier from a single authored image', () => {
      const config = parseBroadcastConfig(block([
        ['Session ended image desktop', 'https://example.com/desktop.png'],
      ]));
      expect(config.sessionEndedImageUrlMobile).to.equal('https://example.com/desktop.png');
      expect(config.sessionEndedImageUrlTablet).to.equal('https://example.com/desktop.png');
      expect(config.sessionEndedImageUrlDesktop).to.equal('https://example.com/desktop.png');
      expect(config.sessionEndedImageUrlDesktopXl).to.equal('https://example.com/desktop.png');
    });

    it('applies each tier\'s optimization policy to a value borrowed via backfill', () => {
      const el = document.createElement('div');
      el.innerHTML = `
        <div><div>Session ended image mobile</div>
          <div><a href="https://example.com/mobile.png?width=750&format=png&optimize=medium">image</a></div>
        </div>`;
      const config = parseBroadcastConfig(el);
      // Tablet/desktop/desktop-xl all borrow mobile's image, but strip its query params anyway.
      expect(config.sessionEndedImageUrlMobile).to.equal('https://example.com/mobile.png?width=750&format=png&optimize=medium');
      expect(config.sessionEndedImageUrlTablet).to.equal('https://example.com/mobile.png');
      expect(config.sessionEndedImageUrlDesktop).to.equal('https://example.com/mobile.png');
      expect(config.sessionEndedImageUrlDesktopXl).to.equal('https://example.com/mobile.png');
    });

    it('falls back to the legacy single row when none of the four are authored', () => {
      const config = parseBroadcastConfig(block([
        ['Session ended image', 'https://example.com/legacy.png'],
      ]));
      expect(config.sessionEndedImageUrlMobile).to.equal('https://example.com/legacy.png');
      expect(config.sessionEndedImageUrlTablet).to.equal('https://example.com/legacy.png');
      expect(config.sessionEndedImageUrlDesktop).to.equal('https://example.com/legacy.png');
      expect(config.sessionEndedImageUrlDesktopXl).to.equal('https://example.com/legacy.png');
    });

    it('prefers the four new rows over the legacy row when both are authored', () => {
      const config = parseBroadcastConfig(block([
        ['Session ended image', 'https://example.com/legacy.png'],
        ['Session ended image mobile', 'https://example.com/mobile.png'],
      ]));
      expect(config.sessionEndedImageUrlMobile).to.equal('https://example.com/mobile.png');
      // No other new row authored, so the rest backfill from mobile, not from the legacy row.
      expect(config.sessionEndedImageUrlDesktopXl).to.equal('https://example.com/mobile.png');
    });
  });

  it('also accepts "Session ended image" authored as an embedded picture, not just a link', () => {
    const el = block([]);
    const row = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = 'Session ended image';
    const value = document.createElement('div');
    const picture = document.createElement('picture');
    const img = document.createElement('img');
    img.src = 'https://example.com/ended.png';
    picture.append(img);
    value.append(picture);
    row.append(label, value);
    el.append(row);

    expect(parseBroadcastConfig(el).sessionEndedImageUrlMobile).to.equal('https://example.com/ended.png');
  });

  // A DA "linked image" cell can nest a <picture> inside its <a>, so both can exist together.
  describe('legacy "session ended image" row (bigger source from an authored <picture>)', () => {
    function blockWithPicture(sourceWidths) {
      const el = block([['Session ended image', 'https://example.com/ended.png']]);
      const valueEl = el.querySelector('div:last-child div:last-child');
      const picture = document.createElement('picture');
      sourceWidths.forEach((width) => {
        const source = document.createElement('source');
        source.srcset = width
          ? `https://example.com/ended.png?width=${width}&format=webply`
          : 'https://example.com/ended.png?format=webply';
        picture.append(source);
      });
      valueEl.querySelector('a').append(picture); // DA nests the picture inside the link
      return el;
    }

    it('picks a source and strips its optimization query params', () => {
      const config = parseBroadcastConfig(blockWithPicture([750, 2000, 1200]));
      expect(config.sessionEndedImageUrlTablet).to.equal('https://example.com/ended.png');
    });

    it('falls back to the row\'s own URL for tablet+ when no picture was authored at all', () => {
      const config = parseBroadcastConfig(block([['Session ended image', 'https://example.com/ended.png']]));
      expect(config.sessionEndedImageUrlTablet).to.equal('https://example.com/ended.png');
    });

    it('falls back to the row\'s own URL when the picture has no <source> elements (e.g. img-only fallback)', () => {
      const el = block([['Session ended image', 'https://example.com/ended.png']]);
      const valueEl = el.querySelector('div:last-child div:last-child');
      const picture = document.createElement('picture');
      const img = document.createElement('img');
      img.src = 'https://example.com/ended.png';
      picture.append(img);
      valueEl.querySelector('a').append(picture);
      expect(parseBroadcastConfig(el).sessionEndedImageUrlTablet).to.equal('https://example.com/ended.png');
    });

    it('does not crash and picks a source even when none carry a width= value', () => {
      const config = parseBroadcastConfig(blockWithPicture([0, 0]));
      expect(config.sessionEndedImageUrlTablet).to.include('ended.png');
    });

    // Real markup pulled directly from a live DA page (no <a> wraps the picture on this one —
    // unlike the earlier "linked image" assumption, this row is a bare <picture>). Regression
    // test for a report that the small (750) image kept loading everywhere.
    it('picks the largest source from real DA-authored markup (no wrapping <a>)', () => {
      const el = document.createElement('div');
      el.innerHTML = `
        <div><div>Session ended image</div>
          <div>
            <picture>
              <source type="image/webp" srcset="./media.jpg?width=2000&format=webply&optimize=medium" media="(min-width: 600px)">
              <source type="image/webp" srcset="./media.jpg?width=750&format=webply&optimize=medium">
              <source type="image/jpeg" srcset="./media.jpg?width=2000&format=jpg&optimize=medium" media="(min-width: 600px)">
              <img loading="lazy" alt="" src="./media.jpg?width=750&format=jpg&optimize=medium" width="4096" height="2732">
            </picture>
          </div>
        </div>`;
      const config = parseBroadcastConfig(el);
      expect(config.sessionEndedImageUrlMobile).to.include('width=750'); // unchanged: <img> fallback, no <a> in this row
      expect(config.sessionEndedImageUrlTablet).to.match(/\/media\.jpg$/); // widest source, query params stripped
    });

    // Real regression: srcset isn't auto-resolved like a.href/img.src, so DA's relative paths
    // failed safeUrl()'s absolute-URL check silently. Asserts the exact value, not a substring,
    // so an unresolved relative string can't pass again.
    it('resolves a relative srcset path to an absolute URL, then strips its query params', () => {
      const el = document.createElement('div');
      el.innerHTML = `
        <div><div>Session ended image</div>
          <div>
            <picture>
              <source type="image/webp" srcset="./media.jpg?width=2000&format=webply&optimize=medium" media="(min-width: 600px)">
              <img loading="lazy" alt="" src="./media.jpg?width=750&format=jpg&optimize=medium">
            </picture>
          </div>
        </div>`;
      const config = parseBroadcastConfig(el);
      const resolved = new URL('./media.jpg?width=2000&format=webply&optimize=medium', document.baseURI);
      resolved.search = '';
      expect(config.sessionEndedImageUrlTablet).to.equal(resolved.href);
      expect(config.sessionEndedImageUrlTablet).to.match(/^https?:\/\//);
    });
  });
});

describe('session-broadcast init()', () => {
  beforeEach(() => {
    sessionsStatus.value = 'idle';
  });

  it('marks the block element and replaces authored config rows with the rendered app', async () => {
    const el = block([['Also live title', 'Currently Live']]);
    await init(el);
    expect(el.classList.contains('session-broadcast')).to.be.true;
    expect(el.innerHTML).to.include('sb-app');
    expect(el.innerHTML).to.not.include('Also live title');
  });
});

// --sb-fill-height (read by .sb-app's min-height in session-broadcast.css) keeps a short state
// (e.g. Ended with no Also Live/Upcoming sessions) reaching exactly the footer's top edge,
// instead of leaving a gap of the page's default background under it — see session-broadcast.js.
describe('observeFillHeight', () => {
  let footer;
  let originalInnerHeight;

  beforeEach(() => {
    footer = document.createElement('footer');
    document.body.append(footer);
    originalInnerHeight = window.innerHeight;
  });

  afterEach(() => {
    footer.remove();
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
  });

  function stubEl(top) {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ top });
    return el;
  }

  function stubViewport({ innerHeight, footerHeight }) {
    Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
    Object.defineProperty(footer, 'offsetHeight', { value: footerHeight, configurable: true });
  }

  it('fills exactly the gap between the block and the footer', () => {
    const el = stubEl(100);
    stubViewport({ innerHeight: 900, footerHeight: 200 });
    observeFillHeight(el);
    expect(el.style.getPropertyValue('--sb-fill-height')).to.equal('600px');
  });

  it('floors at 0 when the block and footer already exceed the viewport', () => {
    const el = stubEl(700);
    stubViewport({ innerHeight: 900, footerHeight: 300 });
    observeFillHeight(el);
    expect(el.style.getPropertyValue('--sb-fill-height')).to.equal('0px');
  });

  it('treats a missing footer as zero height instead of throwing', () => {
    footer.remove();
    const el = stubEl(100);
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    expect(() => observeFillHeight(el)).to.not.throw();
    expect(el.style.getPropertyValue('--sb-fill-height')).to.equal('800px');
  });

  it('recomputes on window resize', () => {
    const el = stubEl(0);
    stubViewport({ innerHeight: 900, footerHeight: 100 });
    observeFillHeight(el);
    expect(el.style.getPropertyValue('--sb-fill-height')).to.equal('800px');

    Object.defineProperty(window, 'innerHeight', { value: 1200, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(el.style.getPropertyValue('--sb-fill-height')).to.equal('1100px');
  });

  // The footer mounts empty and hydrates asynchronously (see the comment on observeFillHeight),
  // which is why a ResizeObserver watches it instead of computing once. Stubs the constructor
  // to invoke its callback synchronously and deterministically, rather than waiting on a real
  // layout change and an unpredictable number of animation frames.
  it('recomputes when the footer resizes after mounting empty', () => {
    const el = stubEl(0);
    stubViewport({ innerHeight: 900, footerHeight: 0 });

    let observedCallback;
    let observedTarget;
    const OriginalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(callback) { observedCallback = callback; }

      observe(target) { observedTarget = target; }
    };

    try {
      observeFillHeight(el);
      expect(observedTarget).to.equal(footer);
      expect(el.style.getPropertyValue('--sb-fill-height')).to.equal('900px');

      Object.defineProperty(footer, 'offsetHeight', { value: 150, configurable: true });
      observedCallback();

      expect(el.style.getPropertyValue('--sb-fill-height')).to.equal('750px');
    } finally {
      window.ResizeObserver = OriginalResizeObserver;
    }
  });
});
