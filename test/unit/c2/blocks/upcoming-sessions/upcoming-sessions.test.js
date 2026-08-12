import { expect } from '@esm-bundle/chai';
import init, { resolveClickAction, buildCard } from '../../../../../event-libs/v1/c2/blocks/upcoming-sessions/upcoming-sessions.js';
import {
  scheduled, favorited, pendingActions, liveStreamActiveIds, sessionGuideRequest,
} from '../../../../../event-libs/v1/utils/session-store.js';
import { setEventConfig } from '../../../../../event-libs/v1/utils/utils.js';

function buildSectionMetadata(entries) {
  const el = document.createElement('div');
  el.className = 'section-metadata';
  Object.entries(entries).forEach(([key, value]) => {
    const row = document.createElement('div');
    const keyCell = document.createElement('div');
    keyCell.textContent = key;
    const valueCell = document.createElement('div');
    valueCell.textContent = value;
    row.append(keyCell, valueCell);
    el.append(row);
  });
  return el;
}

// Mirrors the real authored shape: the block itself only has the heading row;
// the session array lives in a sibling .section-metadata block, both inside
// the same .section wrapper.
function buildBlock(sessions, heading = 'Upcoming') {
  const section = document.createElement('div');
  section.className = 'section';

  const el = document.createElement('div');
  el.className = 'upcoming-sessions carousel clip-end';
  const headingRow = document.createElement('div');
  headingRow.append(document.createElement('div'));
  headingRow.firstChild.textContent = heading;
  el.append(headingRow);

  const metadata = buildSectionMetadata({ 'upcoming-sessions': JSON.stringify(sessions) });

  section.append(el, metadata);
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
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    scheduled.value = new Set();
    favorited.value = new Set();
    pendingActions.value = new Set();
    liveStreamActiveIds.value = new Set();
    sessionGuideRequest.value = null;
  });

  describe('init(el)', () => {
    it('renders a card per authored session', async () => {
      const el = buildBlock([session()]);
      await init(el);
      const cards = el.querySelectorAll('.upcoming-sessions-card');
      expect(cards.length).to.equal(1);
      expect(cards[0].textContent).to.contain('Intro to Adobe Express');
    });

    it('renders the heading as an accessible label', async () => {
      const el = buildBlock([session()], 'Upcoming');
      await init(el);
      expect(el.getAttribute('aria-label')).to.equal('Upcoming');
      expect(el.querySelector('.upcoming-sessions-heading').textContent).to.equal('Upcoming');
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

    it('removes itself entirely when the authored array is empty', async () => {
      const el = buildBlock([]);
      await init(el);
      expect(el.isConnected).to.equal(false);
    });

    it('removes itself entirely when there is no sibling section-metadata block', async () => {
      const el = document.createElement('div');
      el.className = 'upcoming-sessions carousel clip-end';
      const headingRow = document.createElement('div');
      headingRow.append(document.createElement('div'));
      headingRow.firstChild.textContent = 'Upcoming';
      el.append(headingRow);
      document.body.append(el);

      await init(el);
      expect(el.isConnected).to.equal(false);
    });

    it('removes itself entirely when the section-metadata payload fails to parse', async () => {
      const section = document.createElement('div');
      section.className = 'section';
      const el = document.createElement('div');
      el.className = 'upcoming-sessions carousel clip-end';
      const headingRow = document.createElement('div');
      headingRow.append(document.createElement('div'));
      el.append(headingRow);
      const metadata = buildSectionMetadata({ 'upcoming-sessions': 'not json' });
      section.append(el, metadata);
      document.body.append(section);

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
      const headingRow = document.createElement('div');
      headingRow.append(document.createElement('div'));
      headingRow.firstChild.textContent = 'Upcoming';
      block.append(headingRow);
      const metadata = buildSectionMetadata({ 'upcoming-sessions': JSON.stringify([session()]) });
      section.append(hero, block, metadata);
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

    it('renders the time in the viewer\'s local timezone with an abbreviation, not the authored sessionTime.timezone', () => {
      const startMillis = Date.parse('2026-08-12T17:00:00.000Z');
      const card = buildCard(session({
        sessionTime: {
          startTimeMillis: startMillis,
          endTimeMillis: startMillis + 60 * 60_000,
          timezone: 'America/Los_Angeles',
        },
      }));
      const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
      const endMillis = startMillis + 60 * 60_000;
      const start = new Date(startMillis).toLocaleTimeString('en-US', timeOptions);
      const end = new Date(endMillis).toLocaleTimeString('en-US', { ...timeOptions, timeZoneName: 'short' });
      expect(card.querySelector('.sg-card__time').textContent).to.equal(`${start} - ${end}`);
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

    it('falls back to the mainstage badge (not no badge) when the track has no icon config match', () => {
      const card = buildCard(session({ track: 'Not A Real Track' }));
      const badge = card.querySelector('.sg-category-badge');
      expect(badge).to.not.equal(null);
      // The label is the raw track string itself, not a curated one.
      expect(badge.querySelector('.sg-category-badge__label').textContent).to.equal('Not A Real Track');
      expect(card.querySelector('.sg-card__track--footer').textContent).to.equal('Not A Real Track');
    });

    it('omits the badge entirely when there is no track at all', () => {
      const card = buildCard(session({ track: '' }));
      expect(card.querySelector('.sg-category-badge')).to.equal(null);
    });

    it('renders the schedule and favorite buttons unconditionally, not only on hover/scheduled/favorited', () => {
      const card = buildCard(session());
      expect(card.querySelector('.sg-card__btn--schedule')).to.not.equal(null);
      expect(card.querySelector('.sg-card__btn--favorite')).to.not.equal(null);
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
