import { expect } from '@esm-bundle/chai';

// Homepage livestream `.container`: 8.333% gutter, 1920px max content.
const gutterFor = (width) => Math.max(width * 0.08333, (width - 1920) / 2);

describe('Broadcast container layout', () => {
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
      frame.src = '/test/unit/c2/blocks/session-broadcast/mocks/container-layout.html';
      document.body.append(frame);
    });
    expect(frame.contentWindow.innerWidth).to.equal(width);
    return frame.contentDocument;
  }

  const rect = (doc, selector) => doc.querySelector(selector).getBoundingClientRect();

  [1280, 1440, 1441, 1600, 1920, 2200, 2304, 2560].forEach((width) => {
    it(`insets the player and info to the shared gutter at ${width}px`, async () => {
      const doc = await loadFrame(width);
      const gutter = gutterFor(width);
      ['.youtube-video-container', '.sb-info'].forEach((selector) => {
        const box = rect(doc, selector);
        expect(box.left, selector).to.be.closeTo(gutter, 1);
        expect(box.right, selector).to.be.closeTo(width - gutter, 1);
      });
      expect(rect(doc, '.youtube-video-container').width).to.be.at.most(1920);
      expect(doc.documentElement.scrollWidth).to.equal(width);
    });

    it(`aligns carousels left with the player and bleeds tracks right at ${width}px`, async () => {
      const doc = await loadFrame(width);
      const gutter = gutterFor(width);
      ['also-live', 'up-next'].forEach((key) => {
        const section = `.sb-carousel-section--${key}`;
        const track = rect(doc, `${section} .sg-carousel__track`);
        const firstCard = rect(doc, `${section} .sg-carousel__card-wrap`);
        const nav = rect(doc, `${section} .sg-carousel__nav`);
        expect(track.left, key).to.be.closeTo(gutter, 1);
        expect(track.right, key).to.be.closeTo(width, 1);
        expect(firstCard.left, key).to.be.closeTo(gutter, 1);
        expect(nav.right, key).to.be.closeTo(width - gutter, 1);
      });
    });

    it(`keeps the Also Live card at Figma's 1156px, within the player column, at ${width}px`, async () => {
      const doc = await loadFrame(width);
      const player = rect(doc, '.youtube-video-container');
      const card = rect(doc, '.sb-carousel-section--also-live .sg-live-card');
      expect(card.left).to.be.closeTo(player.left, 1);
      expect(card.width).to.be.closeTo(Math.min(player.width, 1156), 1);
    });

    it(`insets the ended state to the shared gutter at ${width}px`, async () => {
      const doc = await loadFrame(width);
      const ended = doc.createElement('div');
      ended.className = 'sb-ended';
      ended.innerHTML = '<p class="sb-ended__eyebrow">Session complete.</p>';
      doc.querySelector('.sb-live').replaceWith(ended);
      const eyebrow = rect(doc, '.sb-ended__eyebrow');
      expect(eyebrow.left).to.be.closeTo(gutterFor(width), 1);
      expect(eyebrow.right).to.be.closeTo(width - gutterFor(width), 1);
    });
  });

  [375, 768, 1024, 1279].forEach((width) => {
    it(`keeps the full-bleed player and 24px-left carousels below desktop at ${width}px`, async () => {
      const doc = await loadFrame(width);
      const player = rect(doc, '.youtube-video-container');
      expect(player.left).to.equal(0);
      expect(player.width).to.equal(width);
      ['also-live', 'up-next'].forEach((key) => {
        const track = rect(doc, `.sb-carousel-section--${key} .sg-carousel__track`);
        expect(track.left, key).to.be.closeTo(24, 1);
        expect(track.right, key).to.be.closeTo(width, 1);
      });
      expect(doc.documentElement.scrollWidth).to.equal(width);
    });
  });
});
