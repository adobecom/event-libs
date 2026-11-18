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
    document.body.innerHTML = '';
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
    const originalViewport = { width: window.innerWidth, height: window.innerHeight };
    const background = () => document.querySelector('.section-background > div');
    const details = () => document.querySelector('.event-session-details');
    const detailColumn = () => document.getElementById('detail-column');

    beforeEach(async () => {
      document.body.innerHTML = `
        <main>
          <div class="section session-video-container">
            <div class="section-background"><div style="background: #eae5df"></div></div>
            <div class="grid-column"><div id="nav-player" class="session-video-player"></div></div>
          </div>
          <div class="section session-video-playlist-container">
            <div class="section-background"><div style="background: #eae5df"></div></div>
            <div id="detail-column" class="grid-column">
              <div class="fragment"><div class="section">
                <div id="body-player" class="session-video-player"></div>
                <div class="event-session-details"></div>
              </div></div>
            </div>
          </div>
        </main>
      `;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/event-libs/v1/c2/blocks/event-session-details/event-session-details.css';
      await new Promise((resolve, reject) => {
        link.onload = resolve;
        link.onerror = () => reject(new Error(`Failed to load ${link.href}`));
        document.head.append(link);
      });
    });

    afterEach(async () => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
      await setViewport(originalViewport);
    });

    ['nav-player', 'body-player'].forEach((id) => {
      it(`matches the card background and squares its top corners on mobile with ${id} loaded`, async () => {
        await setViewport({ width: 767, height: 800 });
        await init(details());
        document.getElementById(id).dataset.embedded = 'true';
        const cardStyle = getComputedStyle(details());
        expect(getComputedStyle(background()).backgroundColor).to.equal(cardStyle.backgroundColor);
        expect(getComputedStyle(detailColumn()).backgroundColor).to.equal(cardStyle.backgroundColor);
        expect(cardStyle.borderTopLeftRadius).to.equal('0px');
        expect(cardStyle.borderTopRightRadius).to.equal('0px');
        expect(cardStyle.borderBottomLeftRadius).to.equal('16px');
        document.querySelectorAll('main > .section > .section-background').forEach((el) => {
          expect(getComputedStyle(el).top).to.equal('0px');
        });
      });
    });

    it('extends an authored card background behind navigation and across the mobile detail column', async () => {
      await setViewport({ width: 375, height: 800 });
      details().append(backgroundRow('#d5e8f7'));
      await init(details());
      const color = 'rgb(213, 232, 247)';
      expect(getComputedStyle(details()).backgroundColor).to.equal(color);
      expect(getComputedStyle(background()).backgroundColor).to.equal(color);
      expect(getComputedStyle(detailColumn()).backgroundColor).to.equal(color);
    });

    [768, 1440].forEach((width) => {
      it(`preserves the existing background and corners at ${width}px`, async () => {
        await setViewport({ width, height: 800 });
        details().append(backgroundRow('#d5e8f7'));
        await init(details());
        document.getElementById('nav-player').dataset.embedded = 'true';
        document.getElementById('body-player').dataset.embedded = 'true';
        expect(getComputedStyle(background()).backgroundColor).to.equal('rgb(234, 229, 223)');
        expect(getComputedStyle(detailColumn()).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
        expect(getComputedStyle(details()).borderTopLeftRadius).to.equal('16px');
        expect(getComputedStyle(details()).borderTopRightRadius).to.equal('16px');
      });
    });

    it('leaves unrelated video pages unchanged on mobile', async () => {
      await setViewport({ width: 375, height: 800 });
      details().remove();
      expect(getComputedStyle(background()).backgroundColor).to.equal('rgb(234, 229, 223)');
      expect(getComputedStyle(detailColumn()).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    });
  });
});
