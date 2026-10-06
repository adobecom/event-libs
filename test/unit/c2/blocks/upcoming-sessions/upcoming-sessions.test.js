import { expect } from '@esm-bundle/chai';
import { readFile, setViewport, executeServerCommand } from '@web/test-runner-commands';
import sinon from 'sinon';
import init, { resolveClickAction, buildCard } from '../../../../../event-libs/v1/c2/blocks/upcoming-sessions/upcoming-sessions.js';
import {
  scheduled, favorited, pendingActions, liveStreamActiveIds, sessionGuideRequest,
} from '../../../../../event-libs/v1/utils/session-store.js';
import { setEventConfig } from '../../../../../event-libs/v1/utils/utils.js';
import { initTierOneEventConfig } from '../../../../../event-libs/v1/utils/tier-1-event-config.js';
import { setFederalRootOverride } from '../../../../../event-libs/v1/features/icons/federal-icons.js';

// Mirrors the real auto-built shape: decorate.js's tec-homepage auto-block builder
// replaces the authored link with a bare div carrying the decoded { heading, entries }
// config as a data-upcoming-sessions-config attribute — no authored rows, no sibling
// section-metadata block.
function buildBlock(sessions, heading = 'Upcoming', { dark = false } = {}) {
  const section = document.createElement('div');
  section.className = dark ? 'section dark' : 'section';

  const el = document.createElement('div');
  el.className = 'upcoming-sessions carousel clip-end';
  el.dataset.upcomingSessionsConfig = JSON.stringify({ heading, entries: sessions });

  section.append(el);
  document.body.append(section);
  return el;
}

function session(overrides = {}) {
  const now = Date.now();
  return {
    sessionId: 'session-1',
    sessionCode: 'S-001',
    sessionType: 'Session',
    published: true,
    enTitle: 'Intro to Adobe Express',
    status: 'active',
    sessionLengthInMinutes: 60,
    url: 'https://example.com/sessions/s-001',
    tags: 'Design,Illustration',
    track: 'Video',
    sessionTime: {
      startTimeMillis: now + 60_000,
      endTimeMillis: now + 3_660_000,
      timezone: 'America/Los_Angeles',
    },
    ...overrides,
  };
}

describe('upcoming-sessions', () => {
  before(() => {
    setEventConfig({}, { miloLibs: '/test/unit/features/icons/mocks/libs' });
    // The track icon authored below now resolves against federal's dedicated
    // track-icon namespace, not the generic/Milo cascade — see fetchFederalTrackIcon()
    // in federal-icons.js.
    setFederalRootOverride('/test/unit/features/icons/mocks/federal');
    // No built-in track defaults (see tier-1-event-config.js) — author the one track
    // these tests actually need a badge for.
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify({ trackIcons: { Video: { icon: 'video', color: '#F44336' } } });
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    scheduled.value = new Set();
    favorited.value = new Set();
    pendingActions.value = new Set();
    liveStreamActiveIds.value = new Set();
    sessionGuideRequest.value = null;
  });

  afterEach(() => {
    document.querySelectorAll('.upcoming-sessions').forEach((el) => {
      el._upcomingSessionsCleanup?.();
    });
  });

  it('removes only right padding from the upcoming-sessions container section', async () => {
    const css = await readFile({
      path: '../../../../../event-libs/v1/c2/blocks/upcoming-sessions/upcoming-sessions.css',
    });
    const style = document.createElement('style');
    style.textContent = `.container { padding: 24px 72px 40px; } ${css}`;
    document.head.append(style);

    try {
      const block = buildBlock([]);
      const section = block.parentElement;
      section.classList.add('container');
      const unrelatedSection = document.createElement('div');
      unrelatedSection.className = 'section container';
      document.body.append(unrelatedSection);

      const computed = getComputedStyle(section);
      expect(computed.paddingRight).to.equal('0px');
      expect(computed.paddingLeft).to.equal('72px');
      expect(computed.paddingTop).to.equal('24px');
      expect(computed.paddingBottom).to.equal('40px');
      expect(getComputedStyle(unrelatedSection).paddingRight).to.equal('72px');
    } finally {
      style.remove();
    }
  });

  describe('carousel layout', () => {
    let styles;
    let originalViewport;

    before(async () => {
      originalViewport = { width: window.innerWidth, height: window.innerHeight };
      styles = await Promise.all(['event-marquee', 'upcoming-sessions'].map(async (name) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `/event-libs/v1/c2/blocks/${name}/${name}.css`;
        await new Promise((resolve, reject) => {
          link.onload = resolve;
          link.onerror = () => reject(new Error(`Failed to load ${link.href}`));
          document.head.append(link);
        });
        return link;
      }));
    });

    after(() => {
      styles.forEach((link) => link.remove());
    });

    beforeEach(async () => {
      await executeServerCommand('focus-test-page');
    });

    afterEach(async () => {
      await setViewport(originalViewport);
    });

    [375, 768, 1024, 1439, 1440, 1441, 1920, 2300, 2560, 3200].forEach((width) => {
      it(`aligns standalone controls with the player container gutter at ${width}px`, async () => {
        await setViewport({ width, height: 900 });
        const block = buildBlock([1, 2, 3, 4].map((id) => session({ sessionId: `layout-${id}` })));
        block.parentElement.classList.add('container');
        const playerSection = document.createElement('div');
        playerSection.className = 'section livestream-layout container';
        playerSection.innerHTML = '<div class="reference-player">Player</div>';
        document.body.insertBefore(playerSection, block.parentElement);
        const style = document.createElement('style');
        style.textContent = `
          html, body { margin: 0; padding: 0; }
          .container {
            --grid-padding: max(24px, calc((100% - 1920px) / 2));
            padding: 24px var(--grid-padding) 40px;
          }
          .livestream-layout { padding-inline: max(8.333%, calc(50% - 960px)); }`;
        document.head.prepend(style);

        try {
          const leftPadding = getComputedStyle(block.parentElement).paddingLeft;
          await init(block);
          const controls = block.querySelector('.upcoming-sessions-controls');
          const player = playerSection.querySelector('.reference-player');
          const sectionStyle = getComputedStyle(block.parentElement);
          const playerStyle = getComputedStyle(playerSection);
          expect(sectionStyle.paddingRight).to.equal('0px');
          expect(sectionStyle.paddingLeft).to.equal(leftPadding);
          expect(sectionStyle.paddingTop).to.equal('24px');
          expect(sectionStyle.paddingBottom).to.equal('40px');
          expect(getComputedStyle(controls).marginRight).to.equal(playerStyle.paddingRight);
          expect(controls.getBoundingClientRect().right).to.be.closeTo(player.getBoundingClientRect().right, 1);
          expect(block.querySelector('.upcoming-sessions-track').getBoundingClientRect().right)
            .to.be.closeTo(document.documentElement.clientWidth, 1);

          if (width === 2560) {
            await setViewport({ width: 3200, height: 900 });
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            expect(getComputedStyle(controls).marginRight).to.equal('640px');
            expect(controls.getBoundingClientRect().right).to.be.closeTo(player.getBoundingClientRect().right, 1);
          }

          block.parentElement.style.setProperty('--grid-padding', '48px');
          playerSection.style.paddingRight = '48px';
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          expect(getComputedStyle(controls).marginRight).to.equal('48px');
          expect(controls.getBoundingClientRect().right).to.be.closeTo(player.getBoundingClientRect().right, 1);
        } finally {
          style.remove();
        }
      });
    });

    it('resolves percentage container gutters without a preceding livestream section', async () => {
      await setViewport({ width: 2560, height: 900 });
      const block = buildBlock([1, 2, 3, 4].map((id) => session({ sessionId: `fallback-${id}` })));
      block.parentElement.classList.add('container');
      block.parentElement.style.paddingLeft = '12.5%';
      await init(block);

      expect(getComputedStyle(block.querySelector('.upcoming-sessions-controls')).marginRight)
        .to.equal(getComputedStyle(block.parentElement).paddingLeft);
    });

    it('disconnects controls observers on re-decoration and cleanup', async () => {
      const block = buildBlock([1, 2, 3, 4].map((id) => session({ sessionId: `cleanup-${id}` })));
      block.parentElement.classList.add('container');
      const playerSection = document.createElement('div');
      playerSection.className = 'section livestream-layout container';
      document.body.insertBefore(playerSection, block.parentElement);
      const observeSpy = sinon.spy(ResizeObserver.prototype, 'observe');
      const disconnectSpy = sinon.spy(ResizeObserver.prototype, 'disconnect');

      try {
        await init(block);
        expect(observeSpy.calledWith(block.parentElement)).to.equal(true);
        expect(observeSpy.calledWith(playerSection)).to.equal(true);
        await init(block);
        expect(disconnectSpy.calledOnce).to.equal(true);
        block._upcomingSessionsCleanup();
        expect(disconnectSpy.calledTwice).to.equal(true);
        expect(block.style.getPropertyValue('--upcoming-sessions-controls-inset')).to.equal('');
      } finally {
        observeSpy.restore();
        disconnectSpy.restore();
      }
    });

    [[375, 24], [1440, 128], [1441, 240], [3200, 240]].forEach(([width, margin]) => {
      ['non-container', 'attached'].forEach((layout) => {
        it(`uses the expected controls margin for ${layout} layouts at ${width}px`, async () => {
          await setViewport({ width, height: 900 });
          const fixture = document.createElement('div');
          fixture.className = layout === 'attached' ? 'section container' : 'section';
          fixture.style.setProperty('--grid-padding', '120px');
          fixture.style.setProperty('--s2a-spacing-lg', '24px');
          fixture.innerHTML = `
            <div class="upcoming-sessions${layout === 'attached' ? ' upcoming-sessions--attached' : ''}">
              <div class="upcoming-sessions-controls"></div>
            </div>`;
          document.body.append(fixture);

          expect(getComputedStyle(fixture.querySelector('.upcoming-sessions-controls')).marginRight)
            .to.equal(`${layout === 'attached' ? margin : 24}px`);
        });
      });
    });

    [
      [375, 24], [768, 24], [1024, 24], [1439, 24], [1440, 128],
      [1441, 240], [1920, 240], [2300, 240], [2560, 240], [3200, 240],
    ].forEach(([width, margin]) => {
      it(`insets attached controls by ${margin}px while cards bleed right at ${width}px`, async () => {
        await setViewport({ width, height: 900 });
        const wrapper = document.createElement('div');
        wrapper.className = 'event-marquee-upcoming-wrapper';
        wrapper.style.width = '100%';
        wrapper.innerHTML = `
          <div class="event-marquee attach-upcoming attach-upcoming--has-overlay">
            <div class="event-marquee-foreground"><div class="event-marquee-text">Heading</div></div>
          </div>
          <div class="upcoming-sessions upcoming-sessions--attached">
            <div class="upcoming-sessions-header">
              <div class="upcoming-sessions-heading">Upcoming</div>
              <div class="upcoming-sessions-controls">
                <button class="upcoming-sessions-arrow">Previous</button>
                <button class="upcoming-sessions-arrow">Next</button>
              </div>
            </div>
            <div class="upcoming-sessions-track">
              ${'<div class="upcoming-sessions-card" style="width:375px;height:108px">Session</div>'.repeat(12)}
            </div>
          </div>`;
        const reset = document.createElement('style');
        reset.textContent = 'html, body { margin: 0; padding: 0; }';
        document.head.append(reset);
        document.body.append(wrapper);

        try {
          const track = wrapper.querySelector('.upcoming-sessions-track');
          const controls = wrapper.querySelector('.upcoming-sessions-controls');
          const marqueeText = wrapper.querySelector('.event-marquee-text');
          const bounds = track.getBoundingClientRect();
          expect(bounds.left).to.be.closeTo(marqueeText.getBoundingClientRect().left, 1);
          expect(bounds.right).to.be.closeTo(document.documentElement.clientWidth, 1);
          expect(getComputedStyle(controls).marginRight).to.equal(`${margin}px`);
          expect(controls.getBoundingClientRect().right).to.be.closeTo(width - margin, 1);
          expect(track.scrollWidth).to.be.greaterThan(track.clientWidth);
          expect(document.documentElement.scrollWidth).to.equal(document.documentElement.clientWidth);
        } finally {
          reset.remove();
        }
      });
    });
  });

  describe('state timers', () => {
    const maxDelay = 2_147_483_647;
    let clock;
    let timeoutSpy;

    beforeEach(() => {
      clock = sinon.useFakeTimers({
        now: Date.now(),
        toFake: ['Date', 'setTimeout', 'clearTimeout'],
      });
      timeoutSpy = sinon.spy(window, 'setTimeout');
    });

    afterEach(() => {
      document.querySelectorAll('.upcoming-sessions').forEach((el) => {
        el._upcomingSessionsCleanup?.();
      });
      sinon.restore();
      clock.restore();
    });

    function buildTimedBlock(delay) {
      const startTimeMillis = Date.now() + delay;
      return buildBlock([session({
        sessionTime: {
          startTimeMillis,
          endTimeMillis: startTimeMillis + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      })]);
    }

    [maxDelay - 1, maxDelay, maxDelay + 1].forEach((delay) => {
      it(`removes a session only at its start with a ${delay} ms wait at the timer boundary`, async () => {
        const el = buildTimedBlock(delay);
        await init(el);

        expect(timeoutSpy.lastCall.args[1]).to.equal(Math.min(delay, maxDelay));
        expect(clock.countTimers()).to.equal(1);
        clock.tick(delay - 1);

        const card = el.querySelector('.upcoming-sessions-card');
        expect(card).to.exist;
        expect(card.classList.contains('upcoming-sessions-card--rotating-out')).to.equal(false);
        expect(clock.countTimers()).to.equal(1);
        if (delay > maxDelay) expect(timeoutSpy.lastCall.args[1]).to.equal(1);

        clock.tick(1);
        expect(card.classList.contains('upcoming-sessions-card--rotating-out')).to.equal(true);
        clock.tick(350);
        expect(el.querySelector('.upcoming-sessions-card')).to.not.exist;
        expect(clock.countTimers()).to.equal(0);
      });
    });

    [40, 62].forEach((days) => {
      it(`keeps a session ${days} days away visible through capped waits until its start`, async () => {
        const delay = days * 86_400_000;
        const startTimeMillis = Date.now() + delay;
        const el = buildBlock([session({
          sessionTime: {
            startTimeMillis,
            endTimeMillis: startTimeMillis + 3_600_000,
            timezone: 'America/Los_Angeles',
          },
        })]);
        await init(el);

        expect(timeoutSpy.lastCall.args[1]).to.equal(maxDelay);
        clock.tick(maxDelay);
        expect(el.querySelector('.upcoming-sessions-card')).to.exist;
        expect(timeoutSpy.lastCall.args[1]).to.equal(Math.min(delay - maxDelay, maxDelay));

        clock.tick(delay - maxDelay - 1);
        expect(el.querySelector('.upcoming-sessions-card')).to.exist;
        clock.tick(351);
        expect(el.querySelector('.upcoming-sessions-card')).to.not.exist;
        expect(clock.countTimers()).to.equal(0);
      });
    });

    it('uses the actual remaining wait for a session starting within the timer limit', async () => {
      const el = buildBlock([session()]);
      await init(el);

      expect(timeoutSpy.lastCall.args[1]).to.equal(60_000);
      clock.tick(59_999);
      expect(el.querySelector('.upcoming-sessions-card')).to.exist;
      clock.tick(351);
      expect(el.querySelector('.upcoming-sessions-card')).to.not.exist;
    });

    it('recalculates the remaining wait from the current clock when a capped callback runs late', async () => {
      const delay = 40 * 86_400_000;
      const lateness = 2 * 86_400_000;
      const el = buildTimedBlock(delay);
      await init(el);

      clock.setSystemTime(Date.now() + lateness);
      clock.tick(maxDelay);

      expect(timeoutSpy.lastCall.args[1]).to.equal(delay - maxDelay - lateness);
      expect(clock.countTimers()).to.equal(1);
      const card = el.querySelector('.upcoming-sessions-card');
      expect(card.classList.contains('upcoming-sessions-card--rotating-out')).to.equal(false);

      clock.tick(delay - maxDelay - lateness);
      expect(card.classList.contains('upcoming-sessions-card--rotating-out')).to.equal(true);
      clock.tick(350);
      expect(el.querySelector('.upcoming-sessions-card')).to.not.exist;
      expect(clock.countTimers()).to.equal(0);
    });

    it('drops a session rather than rescheduling when a capped callback runs after its start', async () => {
      const delay = 40 * 86_400_000;
      const el = buildTimedBlock(delay);
      await init(el);

      clock.setSystemTime(Date.now() + delay);
      clock.tick(maxDelay);

      expect(el.querySelector('.upcoming-sessions-card')
        .classList.contains('upcoming-sessions-card--rotating-out')).to.equal(true);
      clock.tick(350);
      expect(el.querySelector('.upcoming-sessions-card')).to.not.exist;
      expect(clock.countTimers()).to.equal(0);
    });

    it('removes only the session that starts while keeping a far-future session scheduled', async () => {
      const startTimeMillis = Date.now() + 40 * 86_400_000;
      const el = buildBlock([
        session({ sessionId: 'near-session' }),
        session({
          sessionId: 'far-session',
          sessionTime: {
            startTimeMillis,
            endTimeMillis: startTimeMillis + 3_600_000,
            timezone: 'America/Los_Angeles',
          },
        }),
      ]);
      await init(el);
      expect(clock.countTimers()).to.equal(2);

      clock.tick(60_700);

      expect(el.querySelector('[data-session-id="near-session"]')).to.not.exist;
      expect(el.querySelector('[data-session-id="far-session"]')).to.exist;
      expect(clock.countTimers()).to.equal(1);
      favorited.value = new Set(['far-session']);
      expect(el.querySelector('[data-session-id="near-session"]')).to.not.exist;
      expect(el.querySelector('[data-session-id="far-session"]')).to.exist;
    });

    it('cancels the replacement timer during re-decoration without creating duplicate timers', async () => {
      const delay = 40 * 86_400_000;
      const el = buildTimedBlock(delay);
      await init(el);
      clock.tick(maxDelay);
      const replacementTimer = timeoutSpy.lastCall.returnValue;
      const clearSpy = sinon.spy(window, 'clearTimeout');

      await init(el);

      expect(clearSpy.calledWith(replacementTimer)).to.equal(true);
      expect(timeoutSpy.lastCall.args[1]).to.equal(delay - maxDelay);
      expect(clock.countTimers()).to.equal(1);
      clock.tick(delay - maxDelay + 350);
      expect(el.querySelector('.upcoming-sessions-card')).to.not.exist;
      expect(clock.countTimers()).to.equal(0);
    });

    it('cancels the rescheduled timer during cleanup', async () => {
      const startTimeMillis = Date.now() + 40 * 86_400_000;
      const el = buildBlock([session({
        sessionTime: {
          startTimeMillis,
          endTimeMillis: startTimeMillis + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      })]);
      await init(el);
      clock.tick(maxDelay);
      expect(clock.countTimers()).to.equal(1);

      el._upcomingSessionsCleanup();

      expect(clock.countTimers()).to.equal(0);
      clock.tick(40 * 86_400_000);
      expect(el.querySelector('.upcoming-sessions-card')).to.exist;
    });

    it('rechecks elapsed time and clears the capped timer when the tab becomes visible', async () => {
      const startTimeMillis = Date.now() + 40 * 86_400_000;
      const el = buildBlock([session({
        sessionTime: {
          startTimeMillis,
          endTimeMillis: startTimeMillis + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      })]);
      await init(el);
      sinon.stub(document, 'visibilityState').get(() => 'visible');

      clock.setSystemTime(startTimeMillis);
      document.dispatchEvent(new Event('visibilitychange'));

      expect(el.querySelector('.upcoming-sessions-card')).to.not.exist;
      clock.tick(350);
      expect(clock.countTimers()).to.equal(0);
    });
  });

  describe('init(el)', () => {
    it('renders a card per session in the config', async () => {
      const el = buildBlock([session()]);
      await init(el);
      const cards = el.querySelectorAll('.upcoming-sessions-card');
      expect(cards.length).to.equal(1);
      expect(cards[0].textContent).to.contain('Intro to Adobe Express');
    });

    it('renders the authored heading as an accessible label', async () => {
      const el = buildBlock([session()], 'Upcoming');
      await init(el);
      expect(el.getAttribute('aria-label')).to.equal('Upcoming');
      expect(el.querySelector('.upcoming-sessions-heading').textContent).to.equal('Upcoming');
    });

    it('falls back to a default heading when none is authored', async () => {
      const el = buildBlock([session()], '');
      await init(el);
      expect(el.getAttribute('aria-label')).to.equal('Upcoming Sessions');
      expect(el.querySelector('.upcoming-sessions-heading').textContent).to.equal('Upcoming Sessions');
    });

    it('marks data-few-sessions=true (arrows hidden) with 3 or fewer sessions', async () => {
      const el = buildBlock([
        session(),
        session({ sessionId: 'session-2' }),
        session({ sessionId: 'session-3' }),
      ]);
      await init(el);
      expect(el.dataset.fewSessions).to.equal('true');
    });

    it('marks data-few-sessions=false (arrows shown) with more than 3 sessions', async () => {
      const el = buildBlock([
        session(),
        session({ sessionId: 'session-2' }),
        session({ sessionId: 'session-3' }),
        session({ sessionId: 'session-4' }),
      ]);
      await init(el);
      expect(el.dataset.fewSessions).to.equal('false');
    });

    it('flips data-few-sessions to true once a dropped session brings the visible count to 3', async () => {
      const started = session({
        sessionId: 'session-1',
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      const el = buildBlock([
        started,
        session({ sessionId: 'session-2' }),
        session({ sessionId: 'session-3' }),
        session({ sessionId: 'session-4' }),
      ]);

      // The already-started session is dropped synchronously during init(), before this
      // resolves, bringing the visible count from 4 down to 3.
      await init(el);

      expect(el.dataset.fewSessions).to.equal('true');
    });

    it('never renders a session whose start time has already passed', async () => {
      const past = session({
        sessionId: 'past-session',
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 60_000,
          timezone: 'America/Los_Angeles',
        },
      });
      const upcoming = session({ sessionId: 'upcoming-session' });
      const el = buildBlock([past, upcoming]);
      await init(el);
      expect(el.querySelector('[data-session-id="past-session"]')).to.not.exist;
      expect(el.querySelector('[data-session-id="upcoming-session"]')).to.exist;
    });

    it('drops a mobile-rider session as soon as its start time passes, same as any other session', async () => {
      const started = session({
        sessionId: 'mr-session',
        mrStreamId: 'stream-1',
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      const el = buildBlock([started]);

      await init(el);

      expect(el.querySelector('[data-session-id="mr-session"]')).to.not.exist;
    });

    it('keeps the heading rendered when the entries array is empty (removal is manual/operational)', async () => {
      const el = buildBlock([]);
      await init(el);
      expect(el.isConnected).to.equal(true);
      expect(el.querySelector('.upcoming-sessions-heading')).to.exist;
    });

    it('keeps the heading rendered when there is no config data attribute at all', async () => {
      const el = document.createElement('div');
      el.className = 'upcoming-sessions carousel clip-end';
      document.body.append(el);

      await init(el);
      expect(el.isConnected).to.equal(true);
      expect(el.querySelector('.upcoming-sessions-heading')).to.exist;
    });

    it('removes itself entirely when the config payload fails to parse', async () => {
      const el = document.createElement('div');
      el.className = 'upcoming-sessions carousel clip-end';
      el.dataset.upcomingSessionsConfig = 'not json';
      document.body.append(el);

      await init(el);
      expect(el.isConnected).to.equal(false);
    });

    it('applies the .attach-upcoming overlay class when the preceding sibling opts in', async () => {
      const section = document.createElement('div');
      section.className = 'section';
      const hero = document.createElement('div');
      hero.className = 'hero attach-upcoming';
      const block = document.createElement('div');
      block.className = 'upcoming-sessions carousel clip-end';
      block.dataset.upcomingSessionsConfig = JSON.stringify({ heading: 'Upcoming', entries: [session()] });
      section.append(hero, block);
      document.body.append(section);

      await init(block);

      expect(block.classList.contains('upcoming-sessions--attached')).to.equal(true);
      expect(hero.classList.contains('attach-upcoming--has-overlay')).to.equal(true);
    });

    it('routes an upcoming-session card click to the session-guide deep link', async () => {
      const el = buildBlock([session()]);
      await init(el);

      el.querySelector('.upcoming-sessions-card').click();

      expect(sessionGuideRequest.value).to.deep.equal({ sessionId: 'session-1' });
    });

    it('tears down the previous instance\'s cleanup when the block is re-decorated', async () => {
      const el = buildBlock([session()]);
      await init(el);

      const firstCleanup = el._upcomingSessionsCleanup;
      expect(firstCleanup).to.be.a('function');
      let called = false;
      el._upcomingSessionsCleanup = () => {
        called = true;
        firstCleanup();
      };

      await init(el);

      expect(called).to.equal(true);
      expect(el._upcomingSessionsCleanup).to.not.equal(firstCleanup);
    });

    it('drops an already-started session\'s card and slides the remaining card into place, leaving no lingering inline style', async () => {
      const started = session({
        sessionId: 'session-1',
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      const upcoming = session({ sessionId: 'session-2' });
      const el = buildBlock([started, upcoming]);
      await init(el);

      // scheduleStateTimers drops an already-started session immediately, then
      // removeCard fades it out (ROTATE_OUT_MS) before sliding the remaining
      // card into place (SLIDE_MS) — wait past both.
      await new Promise((resolve) => setTimeout(resolve, 800));

      expect(el.querySelector('[data-session-id="session-1"]')).to.equal(null);
      const remaining = el.querySelector('[data-session-id="session-2"]');
      expect(remaining).to.not.equal(null);
      expect(remaining.style.transform).to.equal('');
      expect(remaining.style.transition).to.equal('');
    });
  });

  describe('buildCard', () => {
    it('uses the sessions-guide sg-card classes and shows the session title', () => {
      const card = buildCard(session());
      expect(card.classList.contains('sg-card')).to.equal(true);
      expect(card.querySelector('.sg-card__title').textContent).to.equal('Intro to Adobe Express');
    });

    it('renders the time in the viewer\'s local timezone with an abbreviation, not the authored sessionTime.timezone, with a lowercase am/pm joined by an en dash and no space before am/pm', () => {
      const startMillis = Date.parse('2026-08-12T17:00:00.000Z');
      const card = buildCard(session({
        sessionTime: {
          startTimeMillis: startMillis,
          endTimeMillis: startMillis + 60 * 60_000,
          timezone: 'America/Los_Angeles',
        },
      }));
      const endMillis = startMillis + 60 * 60_000;
      const partsFor = (millis, withTimeZone) => new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        ...(withTimeZone ? { timeZoneName: 'short' } : {}),
      }).formatToParts(new Date(millis));
      const join = (parts) => parts.reduce((out, part, i) => {
        if (part.type === 'literal' && part.value.trim() === '' && parts[i + 1]?.type === 'dayPeriod') return out;
        return out + (part.type === 'dayPeriod' ? part.value.toLowerCase() : part.value);
      }, '');
      const start = join(partsFor(startMillis, false));
      const end = join(partsFor(endMillis, true));
      expect(card.querySelector('.sg-card__time').textContent).to.equal(`${start}–${end}`);
      expect(card.querySelector('.sg-card__time').textContent).to.match(/(am|pm)\b/);
      expect(card.querySelector('.sg-card__time').textContent).to.not.match(/\b(AM|PM)\b/);
      expect(card.querySelector('.sg-card__time').textContent).to.not.match(/ (am|pm)\b/);
      expect(card.querySelector('.sg-card__time').textContent).to.not.match(/\d [-–] \d/);
    });

    it('always renders the upcoming state, never a live badge — cards are dropped on start instead of switching to live', () => {
      const started = session({
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      const card = buildCard(started);
      expect(card.querySelector('.sg-card__time').textContent).to.not.equal('Live Now');
      expect(card.querySelector('.sg-card__btn--schedule')).to.not.equal(null);
    });

    it('shows the schedule button for an upcoming session', () => {
      const card = buildCard(session());
      expect(card.querySelector('.sg-card__btn--schedule')).to.not.equal(null);
    });

    it('routes a card click to the session-guide deep link regardless of session start time', () => {
      const started = session({
        watchUrl: 'https://example.com/watch/s-001',
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      document.body.append(buildCard(started));

      document.querySelector('.sg-card').click();

      expect(sessionGuideRequest.value).to.deep.equal({ sessionId: 'session-1' });
    });

    it('renders a resolved category badge in the badge-row and repeats it in the footer, alongside the plain track label and time', () => {
      const card = buildCard(session());

      const topBadge = card.querySelector('.sg-card__badge-row .sg-category-badge');
      expect(topBadge).to.not.equal(null);
      expect(topBadge.querySelector('.sg-category-badge__label').textContent).to.equal('Video');

      const footer = card.querySelector('.sg-card__footer');
      expect(footer.querySelector('.sg-card__track--footer').textContent).to.equal('Video');
      expect(footer.querySelector('.sg-card__footer-badge .sg-category-badge__label').textContent).to.equal('Video');
      expect(footer.querySelector('.sg-card__time')).to.not.equal(null);
    });

    it('renders the title before the badge-row so Tablet/Mobile shows title, then track, then time/icons', () => {
      const card = buildCard(session());
      const body = card.querySelector('.sg-card__body');
      const children = [...body.children];
      const titleIndex = children.findIndex((n) => n.classList.contains('sg-card__title'));
      const badgeRowIndex = children.findIndex((n) => n.classList.contains('sg-card__badge-row'));
      expect(titleIndex).to.be.greaterThan(-1);
      expect(badgeRowIndex).to.be.greaterThan(titleIndex);
    });

    it('renders no badge (not a mainstage fallback) when the track has no icon config match', () => {
      // No built-in defaults, and 'mainstage' isn't specially guaranteed to exist either
      // (see tier-1-event-config.js/upcoming-sessions.js) — no config, no badge.
      const card = buildCard(session({ track: 'Not A Real Track' }));
      expect(card.querySelector('.sg-category-badge')).to.equal(null);
      expect(card.querySelector('.sg-card__track--footer').textContent).to.equal('Not A Real Track');
    });

    it('omits the badge entirely when there is no track at all', () => {
      const card = buildCard(session({ track: '' }));
      expect(card.querySelector('.sg-category-badge')).to.equal(null);
    });

    it('renders a description paragraph when the payload supplies one', () => {
      const card = buildCard(session({ description: 'Learn the fundamentals of Adobe Express.' }));
      const description = card.querySelector('.sg-card__description');
      expect(description).to.not.equal(null);
      expect(description.textContent).to.equal('Learn the fundamentals of Adobe Express.');
    });

    it('omits the description paragraph entirely when the payload does not supply one (TEC homepage payload may not carry it yet)', () => {
      const card = buildCard(session());
      expect(card.querySelector('.sg-card__description')).to.equal(null);
    });

    it('renders a "+N" count on both the badge-row and footer badges when additionalTracks is present', () => {
      const card = buildCard(session({ additionalTracks: ['3D & Immersive'] }));
      const topCount = card.querySelector('.sg-card__badge-row .sg-category-badge__count');
      const footerCount = card.querySelector('.sg-card__footer-badge .sg-category-badge__count');
      expect(topCount.textContent).to.equal('+1');
      expect(footerCount.textContent).to.equal('+1');
    });

    it('caps the additional-track count at 1 even if the payload sends more than one extra track', () => {
      const card = buildCard(session({ additionalTracks: ['3D & Immersive', 'AI'] }));
      expect(card.querySelector('.sg-category-badge__count').textContent).to.equal('+1');
    });

    it('omits the count entirely when there are no additional tracks', () => {
      const card = buildCard(session());
      expect(card.querySelector('.sg-category-badge__count')).to.equal(null);
    });

    it('renders the schedule and favorite buttons unconditionally, not only on hover/scheduled/favorited', () => {
      const card = buildCard(session());
      expect(card.querySelector('.sg-card__btn--schedule')).to.not.equal(null);
      expect(card.querySelector('.sg-card__btn--favorite')).to.not.equal(null);
    });

    it('tags the schedule and favorite buttons as add actions when the session is not yet scheduled/favorited', () => {
      const card = buildCard(session());
      const scheduleBtn = card.querySelector('.sg-card__btn--schedule');
      const favoriteBtn = card.querySelector('.sg-card__btn--favorite');
      expect(scheduleBtn.getAttribute('aria-pressed')).to.equal('false');
      expect(scheduleBtn.getAttribute('daa-ll')).to.equal('Add-to-Schedule');
      expect(favoriteBtn.getAttribute('aria-pressed')).to.equal('false');
      expect(favoriteBtn.getAttribute('daa-ll')).to.equal('Add-to-Favorites');
    });

    it('tags the schedule and favorite buttons as remove actions when the session is already scheduled/favorited', () => {
      scheduled.value = new Set(['session-1']);
      favorited.value = new Set(['session-1']);
      const card = buildCard(session());
      const scheduleBtn = card.querySelector('.sg-card__btn--schedule');
      const favoriteBtn = card.querySelector('.sg-card__btn--favorite');
      expect(scheduleBtn.getAttribute('aria-pressed')).to.equal('true');
      expect(scheduleBtn.getAttribute('daa-ll')).to.equal('Remove-from-Schedule');
      expect(favoriteBtn.getAttribute('aria-pressed')).to.equal('true');
      expect(favoriteBtn.getAttribute('daa-ll')).to.equal('Remove-from-Favorites');
    });

    it('tags the card itself for open-session-detail tracking', () => {
      const card = buildCard(session());
      expect(card.getAttribute('daa-ll')).to.equal('Session-Card-Open');
    });
  });

  describe('theme', () => {
    it('does not add dark-card in a section with no dark style metadata', async () => {
      const el = buildBlock([session()]);
      await init(el);

      expect(el.classList.contains('dark-card')).to.equal(false);
    });

    it('adds dark-card automatically from the containing section, mirroring event-card/event-carousel', async () => {
      const el = buildBlock([session()], 'Upcoming', { dark: true });
      await init(el);

      expect(el.classList.contains('dark-card')).to.equal(true);
    });

    it('leaves an already-present dark-card class alone even outside a dark section', async () => {
      const el = buildBlock([session()]);
      el.classList.add('dark-card');
      await init(el);

      expect(el.classList.contains('dark-card')).to.equal(true);
    });
  });

  describe('resolveClickAction', () => {
    it('resolves an upcoming session to a session-guide click action', () => {
      expect(resolveClickAction(session())).to.deep.equal({ type: 'session-guide', sessionId: 'session-1' });
    });

    it('resolves to session-guide regardless of session start time or url — cards are dropped on start rather than switching to a live/watch action', () => {
      const started = session({
        url: 'https://example.com/watch/s-001',
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      expect(resolveClickAction(started)).to.deep.equal({ type: 'session-guide', sessionId: 'session-1' });
    });
  });
});
