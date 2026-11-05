import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import init from '../../../../../event-libs/v1/c2/blocks/event-session-details/event-session-details.js';

function block() {
  const el = document.createElement('div');
  el.className = 'session-details';
  return el;
}

function backgroundRow(value) {
  const row = document.createElement('div');
  const key = document.createElement('div');
  key.textContent = 'Background';
  const val = document.createElement('div');
  val.textContent = value;
  row.append(key, val);
  return row;
}

describe('Session Details', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('renders the session title from metadata', async () => {
    setMetadata('title', 'My Session');
    const el = block();
    await init(el);
    expect(el.querySelector('.session-title').textContent).to.equal('My Session');
  });

  it('renders no track tags in the eyebrow even when the session carries Track attributes', async () => {
    setMetadata('custom-attributes', JSON.stringify([
      {
        name: 'Primary Event Site Track',
        inputType: 'single-select',
        enabled: true,
        values: [{ value: 'design', label: 'Design' }],
      },
    ]));
    const el = block();
    await init(el);
    const eyebrow = el.querySelector('.session-eyebrow');
    expect(eyebrow.querySelector('.track-tags')).to.be.null;
    expect(eyebrow.firstElementChild.classList.contains('session-status-slot')).to.be.true;
  });

  it('hides Share on a pure IPOD session whose recording is not available yet', async () => {
    setMetadata('session-times', '[]');
    setMetadata('custom-attributes', JSON.stringify([{
      name: 'Format', values: [{ value: 'in-person' }, { value: 'on-demand-post-event' }],
    }]));
    const el = block();
    document.body.append(el);
    await init(el);
    expect(el.querySelector('.session-share').hidden).to.be.true;
    el.remove();
  });

  it('shows Share on a non-IPOD session', async () => {
    setMetadata('custom-attributes', JSON.stringify([{
      name: 'Format', values: [{ value: 'online' }],
    }]));
    const el = block();
    await init(el);
    expect(el.querySelector('.session-share').hidden).to.be.false;
  });

  it('applies an authored Background row as the block background and removes the row', async () => {
    setMetadata('title', 'My Session');
    const el = block();
    el.append(backgroundRow('#ff0000'));
    await init(el);
    expect(el.style.background).to.equal('rgb(255, 0, 0)');
    expect(el.querySelector('.session-title')).to.not.be.null;
  });

  it('leaves the background unset when no Background row is authored', async () => {
    setMetadata('title', 'My Session');
    const el = block();
    await init(el);
    expect(el.style.background).to.equal('');
  });

  describe('mobile navigation background (MWPW-212527)', () => {
    beforeEach(async () => {
      document.body.innerHTML = `
        <header class="global-navigation"></header>
        <main>
          <div class="section nav-offset session-video-container">
            <div class="section-background"><div style="background: #eae5df"></div></div>
            <div class="grid-column">
              <div class="fragment"><div class="section">
                <div id="nav-player" class="session-video-player spacing-3xs-static-top">
                  <div><div></div></div>
                </div>
              </div></div>
            </div>
          </div>
          <div class="section session-video-playlist-container">
            <div class="section-background"><div style="background: #eae5df"></div></div>
            <div id="detail-column" class="grid-column">
              <div class="fragment"><div class="section">
                <div id="body-player" class="session-video-player"></div>
                <div class="event-session-details"><h1 class="session-title">Session title</h1></div>
              </div></div>
            </div>
            <div class="grid-column grid-col-2"><div id="secondary-content"></div></div>
          </div>
        </main>
      `;
      document.head.innerHTML = `
        <style>
          body { margin: 0; }
          header { position: sticky; top: 0; height: 80px; z-index: 10; }
          main { margin-top: -80px; }
          .section { position: relative; }
          .nav-offset { padding-top: 80px; }
          .spacing-3xs-static-top { padding-top: 16px; }
          .section-background { position: absolute; inset: -1px 0; z-index: 0; }
          .section-background > div { position: absolute; inset: 0; }
          #secondary-content { height: 40px; }
          .milo-video { position: relative; height: 0; padding-bottom: 56.25%; }
          .milo-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
        </style>
      `;
      await Promise.all(['event-session-details', 'session-video-player'].map((name) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `/event-libs/v1/c2/blocks/${name}/${name}.css`;
        return new Promise((resolve, reject) => {
          link.onload = resolve;
          link.onerror = () => reject(new Error(`Failed to load ${link.href}`));
          document.head.append(link);
        });
      }));
    });

    afterEach(async () => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
      await setViewport({ width: 800, height: 600 });
    });

    const background = () => document.querySelector('.section-background > div');
    const details = () => document.querySelector('.event-session-details');
    const detailColumn = () => document.getElementById('detail-column');
    const nextBackground = () => document.querySelector('.session-video-playlist-container > .section-background');

    const paintedBackgroundAt = (x, y) => document.elementsFromPoint(x, y)
      .map((el) => getComputedStyle(el).backgroundColor)
      .find((color) => color !== 'rgba(0, 0, 0, 0)');

    const expectUnchangedGeometry = () => {
      const link = document.querySelector('link[href$="/event-session-details.css"]');
      const rule = [...link.sheet.cssRules].find((r) => r.conditionText === '(max-width: 767px)');
      const measure = () => [
        ...document.querySelectorAll('header, main > .section, .session-video-player, iframe, .session-title'),
        details(),
      ].map((el) => {
        const rect = el.getBoundingClientRect();
        return [rect.top, rect.left, rect.width, rect.height];
      });
      rule.media.mediaText = 'not all';
      const original = measure();
      rule.media.mediaText = '(max-width: 767px)';
      expect(measure()).to.deep.equal(original);
    };

    const mountPlayer = (id) => {
      const player = document.getElementById(id);
      player.dataset.embedded = 'true';
      player.innerHTML = '<div class="milo-video"><iframe title="Session video" srcdoc=""></iframe></div>';
      return player;
    };

    [320, 375, 430, 767].forEach((width) => {
      it(`keeps the no-player mobile panel continuous and square above GNAV at ${width}px`, async () => {
        await setViewport({ width, height: 800 });
        const header = document.querySelector('header');
        expectUnchangedGeometry();
        expect(getComputedStyle(background()).backgroundColor)
          .to.equal(getComputedStyle(details()).backgroundColor);
        expect(background().getBoundingClientRect().top).to.equal(0);
        expect(getComputedStyle(background()).borderTopLeftRadius).to.equal('0px');
        expect(getComputedStyle(background()).borderTopRightRadius).to.equal('0px');
        expect(nextBackground().getBoundingClientRect().top).to.equal(detailColumn().getBoundingClientRect().top);
        expect(paintedBackgroundAt(20, detailColumn().getBoundingClientRect().top - 0.5))
          .to.equal(getComputedStyle(details()).backgroundColor);
        expect(details().getBoundingClientRect().top).to.equal(96);
        expect(document.querySelector('.session-title').getBoundingClientRect().top).to.equal(120);
        const secondary = document.getElementById('secondary-content');
        expect(paintedBackgroundAt(20, secondary.getBoundingClientRect().top + 10))
          .to.equal('rgb(234, 229, 223)');
        expect(getComputedStyle(header).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
        expect(document.elementFromPoint(10, 40)).to.equal(header);
      });
    });

    [768, 1024, 1440].forEach((width) => {
      it(`preserves the existing background and corners at ${width}px`, async () => {
        await setViewport({ width, height: 800 });
        expectUnchangedGeometry();
        expect(getComputedStyle(background()).backgroundColor).to.equal('rgb(234, 229, 223)');
        expect(getComputedStyle(detailColumn()).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
        expect(nextBackground().getBoundingClientRect().top)
          .to.equal(detailColumn().getBoundingClientRect().top - 1);
        expect(getComputedStyle(details()).borderTopLeftRadius).to.equal('16px');
        expect(details().getBoundingClientRect().top).to.equal(96);
      });
    });

    ['nav-player', 'body-player'].forEach((id) => {
      [375, 768, 1440].forEach((width) => {
        it(`preserves ${id} geometry and removes only mobile beige gaps/corners at ${width}px`, async () => {
          await setViewport({ width, height: 1000 });
          const player = mountPlayer(id);
          expectUnchangedGeometry();
          const mobile = width < 768;
          expect(getComputedStyle(details()).borderTopLeftRadius).to.equal(mobile ? '0px' : '16px');
          expect(getComputedStyle(details()).borderTopRightRadius).to.equal(mobile ? '0px' : '16px');
          expect(getComputedStyle(details()).borderBottomLeftRadius).to.equal('16px');
          expect(getComputedStyle(player).paddingBottom).to.equal('8px');
          expect(details().getBoundingClientRect().top).to.equal(player.getBoundingClientRect().bottom);
          const videoBottom = player.querySelector('iframe').getBoundingClientRect().bottom;
          expect(paintedBackgroundAt(20, videoBottom + 4))
            .to.equal(mobile ? getComputedStyle(details()).backgroundColor : 'rgb(234, 229, 223)');
          expect(document.elementFromPoint(10, 40)).to.equal(document.querySelector('header'));
        });
      });

      it(`keeps the mobile ${id} loading placeholder sized and the background continuous`, async () => {
        await setViewport({ width: 375, height: 1000 });
        const player = document.getElementById(id);
        player.classList.add('session-video-loading');
        expectUnchangedGeometry();
        expect(player.getBoundingClientRect().height).to.be.greaterThan(200);
        expect(getComputedStyle(background()).backgroundColor)
          .to.equal(getComputedStyle(details()).backgroundColor);
        expect(getComputedStyle(detailColumn()).backgroundColor)
          .to.equal(getComputedStyle(details()).backgroundColor);
        expect(getComputedStyle(details()).borderTopLeftRadius).to.equal('16px');
      });
    });

    it('leaves unrelated video pages unchanged on mobile', async () => {
      await setViewport({ width: 375, height: 800 });
      details().remove();
      expect(getComputedStyle(background()).backgroundColor).to.equal('rgb(234, 229, 223)');
      expect(getComputedStyle(detailColumn()).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
      expect(nextBackground().getBoundingClientRect().top).to.equal(detailColumn().getBoundingClientRect().top - 1);
    });

    it('does not repaint video sections below other content', async () => {
      await setViewport({ width: 375, height: 800 });
      const section = document.createElement('div');
      document.querySelector('main').prepend(section);
      expect(getComputedStyle(background()).backgroundColor).to.equal('rgb(234, 229, 223)');
      expect(getComputedStyle(detailColumn()).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
      expect(getComputedStyle(details()).borderTopLeftRadius).to.equal('16px');
    });
  });
});
