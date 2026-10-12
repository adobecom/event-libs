import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
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

  describe('attached carousel layout', () => {
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

    afterEach(async () => {
      await setViewport(originalViewport);
    });

    [375, 1024].forEach((width) => {
      it(`balances the heading text at ${width}px without changing its content`, async () => {
        await setViewport({ width, height: 900 });
        const text = 'Catch these upcoming sessions.';
        const el = buildBlock([], text);
        await init(el);
        const heading = el.querySelector('.upcoming-sessions-heading');
        expect(getComputedStyle(heading).textWrap).to.equal('balance');
        expect(heading.textContent).to.equal(text);
        expect(el.getAttribute('aria-label')).to.equal(text);
        expect(heading.children.length).to.equal(0);
      });
    });

    [375, 1024, 1440, 1920, 2300, 2560, 3200].forEach((width) => {
      it(`bleeds only to the right viewport edge at ${width}px`, async () => {
        await setViewport({ width, height: 900 });
        const wrapper = document.createElement('div');
        wrapper.className = 'event-marquee-upcoming-wrapper';
        wrapper.style.width = '100%';
        wrapper.innerHTML = `
          <div class="event-marquee attach-upcoming attach-upcoming--has-overlay">
            <div class="event-marquee-foreground"><div class="event-marquee-text">Heading</div></div>
          </div>
          <div class="upcoming-sessions upcoming-sessions--attached">
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
          const marqueeText = wrapper.querySelector('.event-marquee-text');
          const bounds = track.getBoundingClientRect();
          expect(bounds.left).to.be.closeTo(marqueeText.getBoundingClientRect().left, 1);
          expect(bounds.right).to.be.closeTo(document.documentElement.clientWidth, 1);
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

  describe('schedule/favorite state updates', () => {
    it('patches the existing card in place, keeping focus, instead of rebuilding the track', async () => {
      const el = buildBlock([session(), session({ sessionId: 'session-2' })]);
      await init(el);
      const card = el.querySelector('[data-session-id="session-1"]');
      const scheduleBtn = card.querySelector('.sg-card__btn--schedule');
      scheduleBtn.focus();

      pendingActions.value = new Set(['session-1']);
      expect(scheduleBtn.disabled).to.equal(true);
      expect(card.classList.contains('is-pending')).to.equal(true);

      scheduled.value = new Set(['session-1']);
      pendingActions.value = new Set();

      expect(el.querySelector('[data-session-id="session-1"]')).to.equal(card);
      expect(document.activeElement).to.equal(scheduleBtn);
      expect(card.classList.contains('is-scheduled')).to.equal(true);
      expect(card.classList.contains('is-pending')).to.equal(false);
      expect(scheduleBtn.disabled).to.equal(false);
      expect(scheduleBtn.getAttribute('aria-pressed')).to.equal('true');
      expect(scheduleBtn.getAttribute('aria-label')).to.equal('Remove from schedule');
      expect(scheduleBtn.getAttribute('daa-ll')).to.equal('Remove-from-Schedule');
      expect(el.querySelector('[data-session-id="session-2"]').classList.contains('is-scheduled')).to.equal(false);

      favorited.value = new Set(['session-1']);
      const favoriteBtn = card.querySelector('.sg-card__btn--favorite');
      expect(card.classList.contains('is-favorited')).to.equal(true);
      expect(favoriteBtn.getAttribute('aria-pressed')).to.equal('true');
      expect(favoriteBtn.getAttribute('daa-ll')).to.equal('Remove-from-Favorites');

      scheduled.value = new Set();
      expect(card.classList.contains('is-scheduled')).to.equal(false);
      expect(scheduleBtn.getAttribute('aria-pressed')).to.equal('false');
      expect(scheduleBtn.getAttribute('daa-ll')).to.equal('Add-to-Schedule');
    });
  });

  describe('mobile and tablet card layout', () => {
    let styles;
    let originalViewport;

    before(async () => {
      originalViewport = { width: window.innerWidth, height: window.innerHeight };
      styles = await Promise.all(['upcoming-sessions', 'sessions-guide'].map(async (name) => {
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

    afterEach(async () => {
      await setViewport(originalViewport);
    });

    [375, 768, 1024, 1279].forEach((width) => {
      [false, true].forEach((dark) => {
        it(`keeps exactly 16px between tracks and icons at ${width}px in ${dark ? 'dark' : 'light'} cards`, async () => {
          await setViewport({ width, height: 900 });
          const el = buildBlock([
            session({ enTitle: 'Short title' }),
            session({
              sessionId: 'session-2',
              enTitle: 'A session title long enough to wrap onto a second line in the card',
              description: 'Hidden on mobile and tablet',
              additionalTracks: ['Design'],
            }),
          ], 'Upcoming', { dark });
          await init(el);

          for (const state of ['rest', 'focus', 'scheduled', 'favorited']) {
            if (state === 'scheduled') scheduled.value = new Set(['session-1', 'session-2']);
            if (state === 'favorited') favorited.value = new Set(['session-1', 'session-2']);
            el.querySelectorAll('.upcoming-sessions-card').forEach((card) => {
              if (state === 'focus') card.querySelector('.sg-card__btn--schedule').focus();
              const badge = card.querySelector('.sg-card__badge-row .sg-category-badge');
              const badgeBottom = badge.getBoundingClientRect().bottom;
              const bodyBottom = card.querySelector('.sg-card__body').getBoundingClientRect().bottom;
              expect(bodyBottom, state).to.be.closeTo(badgeBottom, 0.5);
              card.querySelectorAll('.sg-icon-btn').forEach((button) => {
                expect(button.getBoundingClientRect().top - badgeBottom, state).to.be.closeTo(16, 0.5);
              });
              expect(card.getBoundingClientRect().height).to.be.at.least(168);
              card.querySelector('.sg-card__btn--schedule').blur();
            });
          }
        });
      });
    });
  });

  describe('desktop card layout', () => {
    let styles;
    let originalViewport;
    let noMotion;

    before(async () => {
      originalViewport = { width: window.innerWidth, height: window.innerHeight };
      await setViewport({ width: 1440, height: 900 });
      // sessions-guide.css loads after this block's stylesheet on pages with the Session Guide
      // widget; its unscoped .sg-card rules must not change this card's geometry.
      styles = await Promise.all([
        '/event-libs/v1/c2/blocks/upcoming-sessions/upcoming-sessions.css',
        '/event-libs/v1/c2/blocks/sessions-guide/sessions-guide.css',
      ].map(async (href) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        await new Promise((resolve, reject) => {
          link.onload = resolve;
          link.onerror = () => reject(new Error(`Failed to load ${href}`));
          document.head.append(link);
        });
        return link;
      }));
      noMotion = document.createElement('style');
      noMotion.textContent = '.upcoming-sessions *, .upcoming-sessions *::after { transition: none !important; }';
      document.head.append(noMotion);
    });

    after(async () => {
      styles.forEach((link) => link.remove());
      noMotion.remove();
      await setViewport(originalViewport);
    });

    const PADDING = 24;
    const BORDER = 1;

    function expectUniformPadding(card) {
      const cardRect = card.getBoundingClientRect();
      const body = card.querySelector('.sg-card__body').getBoundingClientRect();
      const actions = card.querySelector('.sg-card__actions');
      expect(body.left - cardRect.left).to.be.closeTo(PADDING + BORDER, 0.5);
      expect(body.top - cardRect.top).to.be.closeTo(PADDING + BORDER, 0.5);
      if (getComputedStyle(actions).opacity === '1') {
        const buttons = [...actions.querySelectorAll('.sg-icon-btn')].filter((btn) => btn.offsetParent);
        buttons.forEach((btn) => {
          const rect = btn.getBoundingClientRect();
          expect(cardRect.right - rect.right).to.be.closeTo(PADDING + BORDER, 0.5);
          expect(rect.left - body.right).to.be.closeTo(PADDING, 0.5);
        });
        expect(buttons[0].getBoundingClientRect().top - cardRect.top).to.be.closeTo(PADDING + BORDER, 0.5);
      } else {
        expect(cardRect.right - body.right).to.be.closeTo(PADDING + BORDER, 0.5);
      }
    }

    async function buildDesktopBlock() {
      const el = buildBlock([
        session({ enTitle: 'A session title long enough to wrap onto a second line in the card' }),
        session({ sessionId: 'session-2', enTitle: 'Short title', description: 'A short description' }),
        session({ sessionId: 'session-3' }),
        session({ sessionId: 'session-4' }),
      ], 'Upcoming', { dark: true });
      await init(el);
      return el;
    }

    it('keeps a uniform 24px inset at rest, when focused, and when scheduled or favorited', async () => {
      const el = await buildDesktopBlock();
      const [first, second, third] = el.querySelectorAll('.upcoming-sessions-card');

      expectUniformPadding(first);

      scheduled.value = new Set(['session-1']);
      favorited.value = new Set(['session-3']);
      expect(first.getBoundingClientRect().width).to.be.closeTo(431, 0.5);
      expectUniformPadding(first);
      expectUniformPadding(third);

      second.focus();
      expect(second.getBoundingClientRect().width).to.be.closeTo(431, 0.5);
      expectUniformPadding(second);
    });

    it('keeps the body width constant so titles never rewrap as the card expands', async () => {
      const el = await buildDesktopBlock();
      const card = el.querySelector('.upcoming-sessions-card');
      const title = card.querySelector('.sg-card__title');
      const restingWidth = title.getBoundingClientRect().width;
      const restingHeight = title.getBoundingClientRect().height;

      card.focus();
      expect(title.getBoundingClientRect().width).to.be.closeTo(restingWidth, 0.5);
      expect(title.getBoundingClientRect().height).to.equal(restingHeight);

      card.blur();
      scheduled.value = new Set(['session-1']);
      expect(title.getBoundingClientRect().width).to.be.closeTo(restingWidth, 0.5);
    });

    it('does not move the heading, arrows, or track when a card expands', async () => {
      const el = await buildDesktopBlock();
      el.style.position = 'absolute';
      el.style.bottom = '0';
      el.style.left = '0';
      el.style.right = '0';
      const header = el.querySelector('.upcoming-sessions-header');
      const track = el.querySelector('.upcoming-sessions-track');
      const before = { header: header.getBoundingClientRect().top, track: track.offsetHeight };

      const card = el.querySelector('[data-session-id="session-2"]');
      card.focus({ preventScroll: true });
      expect(card.getBoundingClientRect().height).to.be.greaterThan(128);
      expect(header.getBoundingClientRect().top).to.equal(before.header);
      expect(track.offsetHeight).to.equal(before.track);
      expect(track.scrollHeight).to.equal(track.clientHeight);
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

    describe('late section styling', () => {
      let styles;
      let originalViewport;
      let noMotion;

      before(async () => {
        originalViewport = { width: window.innerWidth, height: window.innerHeight };
        styles = await Promise.all(['upcoming-sessions', 'sessions-guide'].map(async (name) => {
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
        noMotion = document.createElement('style');
        noMotion.textContent = '.upcoming-sessions *, .upcoming-sessions *::after { transition: none !important; }';
        document.head.append(noMotion);
      });

      after(() => {
        styles.forEach((link) => link.remove());
        noMotion.remove();
      });

      afterEach(async () => {
        await setViewport(originalViewport);
      });

      function themeStyles(el) {
        const selectors = [
          '.upcoming-sessions-heading', '.upcoming-sessions-arrow', '.sg-card',
          '.sg-card__title', '.sg-card__track', '.sg-card__time', '.sg-card__description',
          '.sg-category-badge', '.sg-category-badge__icon-color',
        ];
        const properties = ['color', 'backgroundColor', 'borderTopColor', 'outlineColor', 'backdropFilter', 'gap'];
        return [
          ...selectors.map((selector) => getComputedStyle(el.querySelector(selector))),
          getComputedStyle(el.querySelector('.sg-card__actions'), '::after'),
        ].map((style) => properties.map((property) => style[property]));
      }

      [375, 1024, 1440].forEach((width) => {
        it(`matches explicit dark-card styling when the section becomes dark after rendering at ${width}px`, async () => {
          await setViewport({ width, height: 900 });
          const el = buildBlock([session({ description: 'Session description' })]);
          const section = el.closest('.section');
          const wrapper = document.createElement('div');
          wrapper.className = 'event-marquee-upcoming-wrapper';
          section.prepend(wrapper);
          wrapper.append(el);
          await init(el);

          const lightStyles = themeStyles(el);
          el.classList.add('dark-card');
          const darkStyles = themeStyles(el);
          expect(darkStyles).not.to.deep.equal(lightStyles);

          el.classList.remove('dark-card');
          section.classList.add('dark');
          expect(el.classList.contains('dark-card')).to.equal(false);
          expect(themeStyles(el)).to.deep.equal(darkStyles);

          const card = el.querySelector('.sg-card');
          const scheduleButton = el.querySelector('.sg-card__btn--schedule');
          for (const state of ['focus', 'scheduled', 'favorited']) {
            if (state === 'focus') scheduleButton.focus();
            if (state === 'scheduled') scheduled.value = new Set(['session-1']);
            if (state === 'favorited') favorited.value = new Set(['session-1']);
            const inheritedStyles = themeStyles(el);
            section.classList.remove('dark');
            el.classList.add('dark-card');
            expect(themeStyles(el), state).to.deep.equal(inheritedStyles);
            el.classList.remove('dark-card');
            section.classList.add('dark');
            scheduleButton.blur();
          }

          card.focus();
          const focusedStyles = themeStyles(el);
          section.classList.remove('dark');
          el.classList.add('dark-card');
          expect(themeStyles(el)).to.deep.equal(focusedStyles);
          el.classList.remove('dark-card');
          card.blur();
          scheduled.value = new Set();
          favorited.value = new Set();
          expect(themeStyles(el)).to.deep.equal(lightStyles);
        });
      });
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
