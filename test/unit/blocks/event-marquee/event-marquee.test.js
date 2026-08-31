import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { setEventConfig } from '../../../../event-libs/v1/utils/utils.js';
import { sessions, favorited } from '../../../../event-libs/v1/utils/session-store.js';
import init from '../../../../event-libs/v1/c2/blocks/event-marquee/event-marquee.js';

const body = await readFile({ path: './mocks/default.html' });

const localMiloLibs = 'http://localhost:2000/test/unit/blocks/event-marquee/mocks/libs';
setEventConfig({}, { miloLibs: localMiloLibs });

// Metadata lives in a sibling Section Metadata block, same convention as Milo's own
// C2 Router Marquee (`starting-marquee`) — never as rows inside the marquee itself.
function sectionMetadataHtml(rows = {}) {
  const entries = Object.entries(rows);
  if (!entries.length) return '';
  return `
    <div class="section-metadata">
      ${entries.map(([key, val]) => `<div><div>${key}</div><div>${val}</div></div>`).join('')}
    </div>
  `;
}

// Same row shape as Milo's classic marquee.js: an optional first row is the
// full-bleed background; the last row is the foreground (text + optional asset).
function videoVariantHtml({
  sessionId = 's-100', favoriteEnabled, shareEnabled, videoTitle, withBackground = true,
} = {}) {
  const metaRows = {};
  if (sessionId) metaRows['session-id'] = sessionId;
  if (favoriteEnabled !== undefined) metaRows['favorite-enabled'] = favoriteEnabled;
  if (shareEnabled !== undefined) metaRows['share-enabled'] = shareEnabled;
  if (videoTitle !== undefined) metaRows['video-title'] = videoTitle;

  const backgroundRow = withBackground
    ? '<div><div><picture><img src="./bg.jpg" alt=""></picture></div></div>'
    : '';

  return `
    <div class="section">
      <div class="event-marquee">
        ${backgroundRow}
        <div>
          <div>
            <h2>Live now</h2>
            <p>Join the mainstage keynote.</p>
          </div>
          <div>
            <div class="milo-video"><iframe title="video"></iframe></div>
          </div>
        </div>
      </div>
      ${sectionMetadataHtml(metaRows)}
    </div>
  `;
}

function countdownVariantHtml({ countdownEndTimeMillis, countdownLabel } = {}) {
  const metaRows = {};
  if (countdownEndTimeMillis !== undefined) metaRows['countdown-end-time-millis'] = countdownEndTimeMillis;
  if (countdownLabel !== undefined) metaRows['countdown-label'] = countdownLabel;

  return `
    <div class="section">
      <div class="event-marquee">
        <div>
          <div>
            <h2>Featured content headline</h2>
            <p>Body copy.</p>
          </div>
        </div>
      </div>
      ${sectionMetadataHtml(metaRows)}
    </div>
  `;
}

describe('event-marquee', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    sessions.value = [];
    favorited.value = new Set();
  });

  describe('Text/CTA variant', () => {
    beforeEach(() => {
      document.body.innerHTML = body;
    });

    it('renders the text-cta variant when no player is present', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-text-cta')).to.be.true;
      expect(el.classList.contains('event-marquee-video')).to.be.false;
    });

    it('decorates CTAs via decorateButtons', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      const primary = el.querySelector('em > strong > a');
      const secondary = el.querySelector('em > a');
      expect(primary.classList.contains('con-button')).to.be.true;
      expect(secondary.classList.contains('con-button')).to.be.true;
    });

    it('renders no Favorite/share actions bar', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-actions')).to.not.exist;
    });

    it('decorates the background row via Milo\'s decorateBlockBg', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      const background = el.querySelector('.event-marquee-background');
      expect(background).to.exist;
      expect(background.querySelector('picture')).to.exist;
    });

    it('tags the foreground row and text column, with no asset', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-foreground')).to.exist;
      expect(el.querySelector('.event-marquee-text')).to.exist;
      expect(el.querySelector('.event-marquee-media')).to.not.exist;
    });

    it('does not require a sibling Section Metadata block', async () => {
      const el = document.querySelector('.event-marquee');
      expect(el.parentElement.querySelector('.section-metadata')).to.not.exist;
      await init(el);
      expect(el.querySelector('.event-marquee-actions')).to.not.exist;
    });

    it('works with no background row at all (foreground-only marquee)', async () => {
      document.body.innerHTML = `
        <div class="event-marquee">
          <div>
            <div><h2>Just text</h2></div>
          </div>
        </div>
      `;
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-text-cta')).to.be.true;
      expect(el.querySelector('.event-marquee-background')).to.not.exist;
    });
  });

  describe('Video variant', () => {
    it('renders the video variant when a decorated player is present', async () => {
      document.body.innerHTML = videoVariantHtml();
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-video')).to.be.true;
      expect(el.classList.contains('event-marquee-text-cta')).to.be.false;
    });

    it('renders the video variant for an already-processed .mobile-rider div (the consuming site\'s own decorateArea() runs processAutoBlockLinks globally before this block\'s init())', async () => {
      document.body.innerHTML = `
        <div class="event-marquee">
          <div>
            <div><h2>Live now</h2></div>
            <div><div class="mobile-rider" data-extracted-video-id="abc123"></div></div>
          </div>
        </div>
      `;
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-video')).to.be.true;
    });

    it('renders the split layout for an ambient/decorative video asset, without Favorite/share (no player, no session)', async () => {
      document.body.innerHTML = `
        <div class="event-marquee">
          <div>
            <div><h2>Behind the scenes</h2></div>
            <div>
              <div class="video-container video-holder">
                <video playsinline muted loop data-video-source="./loop.mp4"><source src="./loop.mp4" type="video/mp4"></video>
                <button class="play-pause-button">Pause</button>
              </div>
            </div>
          </div>
        </div>
      `;
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-video')).to.be.true;
      expect(el.querySelector('.event-marquee-media').classList.contains('event-marquee-bleed')).to.be.true;
      expect(el.querySelector('.event-marquee-favorite')).to.not.exist;
      expect(el.querySelector('.event-marquee-share')).to.not.exist;
    });

    it('renders the video variant for a raw, unprocessed mobilerider.com link', async () => {
      document.body.innerHTML = `
        <div class="event-marquee">
          <div>
            <div><h2>Live now</h2></div>
            <div><a href="https://www.mobilerider.com/embed?videoId=abc123">Watch</a></div>
          </div>
        </div>
      `;
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-video')).to.be.true;
    });

    it('decorates both the background row and the foreground asset', async () => {
      document.body.innerHTML = videoVariantHtml();
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-background')).to.exist;
      expect(el.querySelector('.event-marquee-media .milo-video')).to.exist;
    });

    it('renders a Favorite button when the authored session-id matches a known session', async () => {
      sessions.value = [{ id: 's-100', rfCode: 'rf-100' }];
      document.body.innerHTML = videoVariantHtml({ sessionId: 's-100' });
      const el = document.querySelector('.event-marquee');
      await init(el);

      const favoriteBtn = el.querySelector('.event-marquee-favorite');
      expect(favoriteBtn).to.exist;
      expect(favoriteBtn.getAttribute('aria-label')).to.equal('Add to favorites');
      expect(favoriteBtn.getAttribute('daa-ll')).to.equal('Add-to-Favorites');
      expect(favoriteBtn.classList.contains('is-favorited')).to.be.false;
    });

    it('reflects the favorited signal reactively', async () => {
      sessions.value = [{ id: 's-100', rfCode: 'rf-100' }];
      document.body.innerHTML = videoVariantHtml({ sessionId: 's-100' });
      const el = document.querySelector('.event-marquee');
      await init(el);

      favorited.value = new Set(['s-100']);
      const favoriteBtn = el.querySelector('.event-marquee-favorite');
      expect(favoriteBtn.classList.contains('is-favorited')).to.be.true;
      expect(favoriteBtn.getAttribute('aria-label')).to.equal('Remove from favorites');
      expect(favoriteBtn.getAttribute('daa-ll')).to.equal('Remove-from-Favorites');
    });

    it('does not render a Favorite button when no session-id is authored', async () => {
      document.body.innerHTML = videoVariantHtml({ sessionId: '' });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-favorite')).to.not.exist;
    });

    it('does not render a Favorite button when favorite-enabled is explicitly false', async () => {
      sessions.value = [{ id: 's-100', rfCode: 'rf-100' }];
      document.body.innerHTML = videoVariantHtml({ sessionId: 's-100', favoriteEnabled: false });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-favorite')).to.not.exist;
    });

    it('renders a share button by default', async () => {
      document.body.innerHTML = videoVariantHtml({ sessionId: '' });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-share')).to.exist;
    });

    it('omits the share button when share-enabled is explicitly false', async () => {
      document.body.innerHTML = videoVariantHtml({ sessionId: '', shareEnabled: false });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-share')).to.not.exist;
    });

    it('works with no background row (video variant with an asset only)', async () => {
      document.body.innerHTML = videoVariantHtml({ sessionId: '', withBackground: false });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-video')).to.be.true;
      expect(el.querySelector('.event-marquee-background')).to.not.exist;
    });

    it('renders a video title under the player when video-title is authored', async () => {
      document.body.innerHTML = videoVariantHtml({ sessionId: '', videoTitle: 'Keynote replay title' });
      const el = document.querySelector('.event-marquee');
      await init(el);
      const title = el.querySelector('.event-marquee-media .event-marquee-video-title');
      expect(title).to.exist;
      expect(title.textContent).to.equal('Keynote replay title');
    });

    it('does not render a video title when video-title is not authored', async () => {
      document.body.innerHTML = videoVariantHtml({ sessionId: '' });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-video-title')).to.not.exist;
    });

    it('does not render a video title for an ambient/decorative video asset (no player)', async () => {
      document.body.innerHTML = `
        <div class="event-marquee">
          <div>
            <div><h2>Behind the scenes</h2></div>
            <div>
              <div class="video-container video-holder">
                <video playsinline muted loop data-video-source="./loop.mp4"><source src="./loop.mp4" type="video/mp4"></video>
              </div>
            </div>
          </div>
        </div>
      `;
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-video-title')).to.not.exist;
    });

    it('preserves the original casing of session-id and event-title from Section Metadata', async () => {
      document.body.innerHTML = `
        <div class="section">
          <div class="event-marquee">
            <div>
              <div><h2>Live now</h2></div>
              <div><div class="milo-video"><iframe title="video"></iframe></div></div>
            </div>
          </div>
          <div class="section-metadata">
            <div><div>event-title</div><div>MAX2026</div></div>
            <div><div>session-id</div><div>S-AbC123</div></div>
          </div>
        </div>
      `;
      sessions.value = [{ id: 'S-AbC123', rfCode: 'rf-1' }];
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-favorite')).to.exist;
    });
  });

  describe('Upcoming Sessions wrapper', () => {
    it('wraps itself and a following .upcoming-sessions block when attach-upcoming is authored', async () => {
      document.body.innerHTML = `
        <div class="section">
          <div class="event-marquee attach-upcoming">
            <div>
              <div><h2>Live now</h2></div>
            </div>
          </div>
          <div class="upcoming-sessions"></div>
        </div>
      `;
      const section = document.querySelector('.section');
      const upcoming = document.querySelector('.upcoming-sessions');
      const el = document.querySelector('.event-marquee');
      await init(el);

      const wrapper = el.parentElement;
      expect(wrapper.classList.contains('event-marquee-upcoming-wrapper')).to.be.true;
      expect(wrapper.parentElement).to.equal(section);
      expect([...wrapper.children]).to.deep.equal([el, upcoming]);
    });

    it('does nothing when attach-upcoming is not authored', async () => {
      document.body.innerHTML = `
        <div class="section">
          <div class="event-marquee">
            <div>
              <div><h2>Live now</h2></div>
            </div>
          </div>
          <div class="upcoming-sessions"></div>
        </div>
      `;
      const section = document.querySelector('.section');
      const el = document.querySelector('.event-marquee');
      await init(el);

      expect(el.parentElement).to.equal(section);
      expect(el.parentElement.classList.contains('event-marquee-upcoming-wrapper')).to.be.false;
    });

    it('does nothing when attach-upcoming is authored but no upcoming-sessions sibling follows', async () => {
      document.body.innerHTML = `
        <div class="section">
          <div class="event-marquee attach-upcoming">
            <div>
              <div><h2>Live now</h2></div>
            </div>
          </div>
        </div>
      `;
      const section = document.querySelector('.section');
      const el = document.querySelector('.event-marquee');
      await init(el);

      expect(el.parentElement).to.equal(section);
    });

    it('is idempotent across re-decoration — does not nest a second wrapper', async () => {
      document.body.innerHTML = `
        <div class="section">
          <div class="event-marquee attach-upcoming">
            <div>
              <div><h2>Live now</h2></div>
            </div>
          </div>
          <div class="upcoming-sessions"></div>
        </div>
      `;
      const section = document.querySelector('.section');
      const upcoming = document.querySelector('.upcoming-sessions');
      const el = document.querySelector('.event-marquee');
      await init(el);
      const wrapper = el.parentElement;

      await init(el);

      expect(el.parentElement).to.equal(wrapper);
      expect(wrapper.parentElement).to.equal(section);
      expect([...wrapper.children]).to.deep.equal([el, upcoming]);
      expect(section.querySelectorAll('.event-marquee-upcoming-wrapper').length).to.equal(1);
    });
  });

  describe('Countdown', () => {
    let el;
    let fakeClock;

    afterEach(() => {
      el?._eventMarqueeCountdownStop?.();
      fakeClock?.restore();
      sinon.restore();
    });

    it('renders a label and clock when countdown-end-time-millis is valid', async () => {
      const target = Date.now() + 60_000;
      document.body.innerHTML = countdownVariantHtml({ countdownEndTimeMillis: target });
      el = document.querySelector('.event-marquee');
      await init(el);

      const countdown = el.querySelector('.event-marquee-countdown');
      expect(countdown).to.exist;
      expect(countdown.querySelector('.event-marquee-countdown-label').textContent).to.equal('Session starts in:');
      expect(countdown.querySelector('.event-marquee-countdown-clock').textContent).to.match(/^\d{2,}:\d{2}:\d{2}$/);
    });

    it('uses an authored countdown-label instead of the default', async () => {
      const target = Date.now() + 60_000;
      document.body.innerHTML = countdownVariantHtml({ countdownEndTimeMillis: target, countdownLabel: 'Doors open in:' });
      el = document.querySelector('.event-marquee');
      await init(el);

      expect(el.querySelector('.event-marquee-countdown-label').textContent).to.equal('Doors open in:');
    });

    it('ticks the clock down over time', async () => {
      fakeClock = sinon.useFakeTimers({
        now: Date.now(), shouldAdvanceTime: false, shouldClearNativeTimers: true,
      });
      const target = fakeClock.now + 5000;
      document.body.innerHTML = countdownVariantHtml({ countdownEndTimeMillis: target });
      el = document.querySelector('.event-marquee');
      await init(el);

      const clockEl = el.querySelector('.event-marquee-countdown-clock');
      const initial = clockEl.textContent;
      fakeClock.tick(1000);
      expect(clockEl.textContent).to.not.equal(initial);
    });

    it('stops ticking once the countdown reaches zero', async () => {
      fakeClock = sinon.useFakeTimers({
        now: Date.now(), shouldAdvanceTime: false, shouldClearNativeTimers: true,
      });
      const target = fakeClock.now + 2000;
      document.body.innerHTML = countdownVariantHtml({ countdownEndTimeMillis: target });
      el = document.querySelector('.event-marquee');
      await init(el);

      const clockEl = el.querySelector('.event-marquee-countdown-clock');
      const clearIntervalSpy = sinon.spy(window, 'clearInterval');
      fakeClock.tick(2000);
      expect(clockEl.textContent).to.equal('00:00:00');
      expect(clearIntervalSpy.calledOnce).to.be.true;

      clearIntervalSpy.resetHistory();
      fakeClock.tick(1000);
      expect(clockEl.textContent).to.equal('00:00:00');
      expect(clearIntervalSpy.called).to.be.false;
    });

    it('freezes at 00:00:00 and never starts an interval when the target has already passed', async () => {
      const target = Date.now() - 5000;
      document.body.innerHTML = countdownVariantHtml({ countdownEndTimeMillis: target });
      el = document.querySelector('.event-marquee');
      const setIntervalSpy = sinon.spy(window, 'setInterval');
      await init(el);

      expect(el.querySelector('.event-marquee-countdown-clock').textContent).to.equal('00:00:00');
      expect(setIntervalSpy.called).to.be.false;
    });

    it('does not render when countdown-end-time-millis is not authored', async () => {
      document.body.innerHTML = countdownVariantHtml();
      el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-countdown')).to.not.exist;
    });

    it('does not render when countdown-end-time-millis is unparseable', async () => {
      document.body.innerHTML = countdownVariantHtml({ countdownEndTimeMillis: 'not-a-number' });
      el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-countdown')).to.not.exist;
    });

    it('does not render when countdown-end-time-millis has trailing garbage after the number', async () => {
      document.body.innerHTML = countdownVariantHtml({ countdownEndTimeMillis: `${Date.now() + 60_000}ms` });
      el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-countdown')).to.not.exist;
    });

    it('rebuilds with a new target and resumes ticking when re-decoration changes the countdown value', async () => {
      const pastTarget = Date.now() - 5000;
      document.body.innerHTML = countdownVariantHtml({ countdownEndTimeMillis: pastTarget });
      el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-countdown-clock').textContent).to.equal('00:00:00');

      const futureTarget = Date.now() + 60_000;
      el.parentElement.querySelector('.section-metadata div div').nextElementSibling.textContent = String(futureTarget);
      const setIntervalSpy = sinon.spy(window, 'setInterval');
      await init(el);

      expect(el.querySelector('.event-marquee-countdown-clock').textContent).to.not.equal('00:00:00');
      expect(setIntervalSpy.calledOnce).to.be.true;
    });

    it('is idempotent across re-decoration with the same countdown — clears the prior interval, no duplicate nodes', async () => {
      const target = Date.now() + 60_000;
      document.body.innerHTML = countdownVariantHtml({ countdownEndTimeMillis: target });
      el = document.querySelector('.event-marquee');
      await init(el);

      const clearIntervalSpy = sinon.spy(window, 'clearInterval');
      await init(el);

      expect(clearIntervalSpy.calledOnce).to.be.true;
      expect(el.querySelectorAll('.event-marquee-countdown').length).to.equal(1);
    });

    it('tears down the countdown when re-decoration removes the countdown-end-time-millis metadata', async () => {
      const target = Date.now() + 60_000;
      document.body.innerHTML = countdownVariantHtml({ countdownEndTimeMillis: target });
      el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-countdown')).to.exist;

      const clearIntervalSpy = sinon.spy(window, 'clearInterval');
      el.parentElement.querySelector('.section-metadata').remove();
      await init(el);

      expect(clearIntervalSpy.calledOnce).to.be.true;
      expect(el.querySelector('.event-marquee-countdown')).to.not.exist;
    });
  });
});
