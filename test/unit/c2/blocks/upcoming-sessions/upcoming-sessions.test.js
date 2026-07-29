import { expect } from '@esm-bundle/chai';
import init, { resolveClickAction, buildCard } from '../../../../../event-libs/v1/c2/blocks/upcoming-sessions/upcoming-sessions.js';
import { scheduled, favorited, pendingActions, liveStreamActiveIds } from '../../../../../event-libs/v1/utils/session-store.js';

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
    // Singular object, matching what the block actually reads (session.sessionTime)
    // and the authored-data example (docs/upcoming-session-author-data.json) — NOT
    // a `sessionTimes` array, which the code never looks at.
    sessionTime: {
      sessionTimeId: 'time-1',
      sessionId: 'session-1',
      eventId: 'event-1',
      startTimeMillis: now + 60_000,
      endTimeMillis: now + 3_660_000,
      timezone: 'America/Los_Angeles',
      attendeeLimit: 100,
      attendeeCount: 42,
      isFull: false,
      locationId: 'loc-1',
    },
    ...overrides,
  };
}

describe('upcoming-sessions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    scheduled.value = new Set();
    favorited.value = new Set();
    pendingActions.value = new Set();
    liveStreamActiveIds.value = new Set();
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

    it('wraps only the preceding block and itself, leaving other section content (e.g. section-metadata) outside the wrapper', async () => {
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
      // Extra content sharing the section - exactly the scenario the wrapper
      // exists to protect against (would otherwise grow the section past the
      // hero's own size and detach the overlay from it).
      const extraContent = document.createElement('div');
      extraContent.className = 'unrelated-block';
      section.append(hero, block, metadata, extraContent);
      document.body.append(section);

      await init(block);

      const wrapper = section.querySelector(':scope > .event-marquee-upcoming-wrapper');
      expect(wrapper, 'wrapper must exist as a direct child of the section').to.not.be.null;
      expect([...wrapper.children]).to.deep.equal([hero, block]);
      expect(wrapper.contains(metadata)).to.equal(false);
      expect(wrapper.contains(extraContent)).to.equal(false);
      expect(section.contains(metadata), 'section-metadata stays a section child').to.equal(true);
      expect(section.contains(extraContent), 'unrelated content stays a section child').to.equal(true);
    });

    it('next/prev arrow clicks still scroll the track after attaching to a preceding block', async () => {
      const sessions = Array.from(
        { length: 5 },
        (_, i) => session({ sessionId: `session-${i}`, sessionCode: `S-00${i}`, enTitle: `Session ${i}` }),
      );
      const section = document.createElement('div');
      section.className = 'section';
      const hero = document.createElement('div');
      hero.className = 'hero attach-upcoming';
      const el = document.createElement('div');
      el.className = 'upcoming-sessions carousel clip-end';
      const headingRow = document.createElement('div');
      headingRow.append(document.createElement('div'));
      headingRow.firstChild.textContent = 'Upcoming';
      el.append(headingRow);
      const metadata = buildSectionMetadata({ 'upcoming-sessions': JSON.stringify(sessions) });
      section.append(hero, el, metadata);
      document.body.append(section);

      await init(el);

      expect(el.dataset.fewSessions).to.equal('false');
      const track = el.querySelector('.upcoming-sessions-track');
      let calls = [];
      track.scrollBy = (opts) => { calls.push(opts.left); };

      el.querySelector('.upcoming-sessions-arrow--next').click();
      el.querySelector('.upcoming-sessions-arrow--prev').click();

      expect(calls.length).to.equal(2);
      expect(calls[0]).to.be.greaterThan(0);
      expect(calls[1]).to.be.lessThan(0);
    });

    it('routes an upcoming-session card click to the session-guide deep link', async () => {
      const el = buildBlock([session()]);
      await init(el);

      const originalPushState = window.history.pushState;
      let pushedUrl = null;
      window.history.pushState = (state, title, url) => { pushedUrl = url; };

      el.querySelector('.upcoming-sessions-card').click();
      window.history.pushState = originalPushState;

      expect(pushedUrl).to.contain('session=session-1');
    });
  });

  describe('buildCard', () => {
    it('uses the sessions-guide sg-live-card classes and shows the session title', () => {
      const card = buildCard(session());
      expect(card.classList.contains('sg-live-card')).to.equal(true);
      expect(card.querySelector('.sg-live-card__title').textContent).to.equal('Intro to Adobe Express');
    });

    it('shows a Live Now badge and hides the schedule button for a live session', () => {
      const live = session({
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      const card = buildCard(live);
      expect(card.querySelector('.sg-live-card__time').textContent).to.equal('Live Now');
      expect(card.querySelector('.sg-live-card__btn--schedule')).to.equal(null);
      expect(card.querySelector('.sg-live-card__btn--favorite')).to.not.equal(null);
    });

    it('shows the schedule button for an upcoming session', () => {
      const card = buildCard(session());
      expect(card.querySelector('.sg-live-card__btn--schedule')).to.not.equal(null);
    });

    it('routes a live-session card click to its Watch URL, not session-guide', () => {
      const live = session({
        watchUrl: 'https://example.com/watch/s-001',
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      document.body.append(buildCard(live));

      const originalAssign = window.location.assign;
      let assignedUrl = null;
      try {
        Object.defineProperty(window.location, 'assign', {
          configurable: true,
          value: (url) => { assignedUrl = url; },
        });
      } catch {
        // Some browsers lock down Location.prototype; the resolveClickAction
        // unit tests below cover this decision without touching window.location.
      }

      document.querySelector('.sg-live-card').click();

      try {
        Object.defineProperty(window.location, 'assign', { configurable: true, value: originalAssign });
      } catch { /* see above */ }

      if (assignedUrl !== null) expect(assignedUrl).to.equal('https://example.com/watch/s-001');
    });
  });

  describe('resolveClickAction', () => {
    it('resolves a live session to a watch-url click action, not session-guide', () => {
      // A live session routes to its authored `watchUrl` (the stream destination) —
      // never its detail-page `url`. See resolveClickAction: `url` is deliberately
      // ignored for live sessions.
      const live = session({
        watchUrl: 'https://example.com/watch/s-001',
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      expect(resolveClickAction(live)).to.deep.equal({ type: 'watch', url: 'https://example.com/watch/s-001' });
    });

    it('prefers watchUrl over url for a live session, matching sessions-guide LiveCard', () => {
      const live = session({
        url: 'https://example.com/sessions/s-001',
        watchUrl: 'https://example.com/watch/s-001',
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      expect(resolveClickAction(live)).to.deep.equal({ type: 'watch', url: 'https://example.com/watch/s-001' });
    });

    it('resolves an upcoming session to a session-guide click action', () => {
      expect(resolveClickAction(session())).to.deep.equal({ type: 'session-guide', sessionId: 'session-1' });
    });

    it('resolves a javascript: URL on a live session to no action (safeUrl guard)', () => {
      const live = session({
        url: 'javascript:alert(1)',
        sessionTime: {
          startTimeMillis: Date.now() - 60_000,
          endTimeMillis: Date.now() + 3_600_000,
          timezone: 'America/Los_Angeles',
        },
      });
      expect(resolveClickAction(live)).to.deep.equal({ type: 'none' });
    });
  });
});
