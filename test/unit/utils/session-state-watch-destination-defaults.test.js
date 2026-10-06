import { expect } from '@esm-bundle/chai';
import { getWatchDestination } from '../../../event-libs/v1/utils/session-state.js';

// No tier-1-event-config metadata at all, so nothing authored the event's pages — MAX's
// paths stand in, keeping "Watch now" working on configs that predate those fields.
function session(overrides = {}) {
  return {
    id: 's1',
    startTimeUtc: '2026-01-01T10:00:00.000Z',
    endTimeUtc: '2026-01-01T11:00:00.000Z',
    ...overrides,
  };
}

describe('getWatchDestination — unauthored event pages', () => {
  it('falls back to MAX\'s homepage for a live livestreamed session', () => {
    expect(getWatchDestination(session({ isLivestreamed: true }), 'live')).to.equal('/max');
  });

  it('falls back to MAX\'s broadcast page for a live online-only session, carrying ?watch=<id>', () => {
    expect(getWatchDestination(session({ isOnline: true }), 'live')).to.equal('/max/2026/broadcast?watch=s1');
  });

  // event-session-details builds its "session" from page metadata alone — no catalog id
  // exists to send, so it keeps landing on the bare broadcast path.
  it('omits ?watch= for a session with no id (e.g. a metadata-scraped pseudo-session)', () => {
    expect(getWatchDestination(session({ isOnline: true, id: undefined }), 'live')).to.equal('/max/2026/broadcast');
  });

  it('still returns empty for a live session that is neither livestreamed nor online', () => {
    expect(getWatchDestination(session(), 'live')).to.equal('');
  });
});

// adobe.com serves pages at `.html`; aem.page/aem.live 404 on it. The fallbacks follow
// whichever form the current page was served with.
describe('getWatchDestination — .html follows the current page', () => {
  const original = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  afterEach(() => window.history.replaceState(null, '', original));

  it('appends .html when the current page is served with it (adobe.com)', () => {
    window.history.replaceState(null, '', '/max/2026/sessions/some-session.html');
    expect(getWatchDestination(session({ isLivestreamed: true }), 'live')).to.equal('/max.html');
    expect(getWatchDestination(session({ isOnline: true }), 'live')).to.equal('/max/2026/broadcast.html?watch=s1');
  });

  it('stays extensionless when the current page is (aem.page / aem.live)', () => {
    window.history.replaceState(null, '', '/max/2026/sessions/some-session');
    expect(getWatchDestination(session({ isLivestreamed: true }), 'live')).to.equal('/max');
    expect(getWatchDestination(session({ isOnline: true }), 'live')).to.equal('/max/2026/broadcast?watch=s1');
  });

  it('carries serverTime on .html fallback destinations', () => {
    window.history.replaceState(null, '', '/max-new.html?serverTime=1794339000000&sessions=');
    expect(getWatchDestination(session({ isLivestreamed: true }), 'live'))
      .to.equal('/max.html?serverTime=1794339000000');
    expect(getWatchDestination(session({ isOnline: true }), 'live'))
      .to.equal('/max/2026/broadcast.html?watch=s1&serverTime=1794339000000');
  });

  it('carries serverTime without adding a watch param for metadata-only sessions', () => {
    window.history.replaceState(null, '', '/max/2026/sessions/some-session?serverTime=1794339000000');
    expect(getWatchDestination(session({ isOnline: true, id: undefined }), 'live'))
      .to.equal('/max/2026/broadcast?serverTime=1794339000000');
  });
});
