import { expect } from '@esm-bundle/chai';

describe('Broadcast desktop player background layout', () => {
  let frame;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    frame = document.createElement('iframe');
    frame.style.border = '0';
    frame.style.height = '1400px';
  });

  afterEach(() => {
    frame.remove();
  });

  async function loadFrame(width) {
    frame.style.width = `${width}px`;
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
      frame.src = '/test/unit/c2/blocks/session-broadcast/mocks/player-background-layout.html';
      document.body.append(frame);
    });
    expect(frame.contentWindow.innerWidth).to.equal(width);
    return frame.contentDocument;
  }

  [375, 767, 768, 1024, 1279, 1280, 1440, 1441, 1920].forEach((width) => {
    it(`keeps the image desktop-only and behind player/info at ${width}px`, async () => {
      const doc = await loadFrame(width);
      const live = doc.querySelector('.sb-live');
      const player = doc.querySelector('.youtube-video-container');
      const mount = doc.querySelector('.sb-player__mount');
      const info = doc.querySelector('.sb-info');
      const alsoLive = doc.querySelector('.sb-carousel-section--also-live');
      const view = frame.contentWindow;
      const background = view.getComputedStyle(live, '::before');

      expect(background.content).to.equal(width >= 1280 ? '""' : 'none');
      if (width >= 1280) {
        expect(background.backgroundImage).to.include('/assets/player-background.png');
        expect(background.opacity).to.equal('0.6');
        expect(background.pointerEvents).to.equal('none');
        expect(background.zIndex).to.equal('-1');
        expect(background.backgroundSize).to.equal('cover');
        expect(view.getComputedStyle(live).isolation).to.equal('isolate');
        expect(view.getComputedStyle(mount).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
        expect(view.getComputedStyle(info).backgroundColor).to.equal('rgba(0, 0, 0, 0.64)');
      } else {
        expect(background.backgroundImage).to.equal('none');
        expect(view.getComputedStyle(mount).backgroundColor).to.equal('rgb(0, 0, 0)');
      }

      const playerRect = player.getBoundingClientRect();
      const infoRect = info.getBoundingClientRect();
      const liveRect = live.getBoundingClientRect();
      expect(playerRect.width / playerRect.height).to.be.closeTo(16 / 9, 0.01);
      expect(infoRect.top).to.be.closeTo(playerRect.bottom, 1);
      expect(liveRect.bottom).to.be.closeTo(infoRect.bottom, 1);
      expect(doc.documentElement.scrollWidth).to.equal(width);
      expect(alsoLive.getBoundingClientRect().top).to.be.closeTo(
        liveRect.bottom - (width < 768 ? 16 : 0), 1,
      );

      const iframeRect = doc.querySelector('.sb-player__mount iframe').getBoundingClientRect();
      expect(doc.elementFromPoint(iframeRect.left + 20, iframeRect.bottom - 20).tagName)
        .to.equal('IFRAME');
      const button = info.querySelector('button');
      const buttonRect = button.getBoundingClientRect();
      expect(doc.elementFromPoint(buttonRect.left + 16, buttonRect.top + 16)).to.equal(button);
      button.focus();
      expect(doc.activeElement).to.equal(button);
    });
  });

  it('uses an authored image and keeps its custom property scoped to the live wrapper', async () => {
    const doc = await loadFrame(1440);
    const live = doc.querySelector('.sb-live');
    live.style.setProperty('--sb-player-bg', 'url("/event-libs/v1/c2/blocks/session-broadcast/assets/player-background.png?authored")');
    expect(frame.contentWindow.getComputedStyle(live, '::before').backgroundImage)
      .to.include('player-background.png?authored');
    expect(frame.contentWindow.getComputedStyle(doc.querySelector('.sb-carousel-section'), '::before').backgroundImage)
      .to.equal('none');
  });

  it('keeps secondary text above 4.5:1 even for a white authored background', async () => {
    const doc = await loadFrame(1440);
    const view = frame.contentWindow;
    const imageOpacity = Number(view.getComputedStyle(doc.querySelector('.sb-live'), '::before').opacity);
    const backing = view.getComputedStyle(doc.querySelector('.sb-info')).backgroundColor;
    const text = view.getComputedStyle(doc.querySelector('.sb-info__desc-wrap')).color;
    const backingAlpha = Number(backing.match(/[\d.]+/g)[3]);
    const textAlpha = Number(text.match(/[\d.]+/g)[3]);
    // White artwork is the worst case: it is dimmed over black, then behind the info backing.
    const bg = 255 * imageOpacity * (1 - backingAlpha);
    const fg = 255 * textAlpha + bg * (1 - textAlpha);
    const luminance = (channel) => {
      const srgb = channel / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    };
    expect((luminance(fg) + 0.05) / (luminance(bg) + 0.05)).to.be.at.least(4.5);
  });
});
