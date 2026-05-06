import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/blocks/sessions-hub/sessions-hub.js';
import BlockMediator from '../../../../event-libs/v1/deps/block-mediator.min.js';
import { DictionaryManager, dictionaryManager } from '../../../../event-libs/v1/utils/dictionary-manager.js';

const body = await readFile({ path: './mocks/default.html' });

const INVITE_FALLBACK = 'Registration is only available through a valid invitation link.';

function makeSession(overrides = {}) {
  return {
    sessionId: 'session-1',
    title: 'My Session',
    description: 'Short description.',
    tags: '',
    sessionTimes: [
      {
        sessionTimeId: 'time-1',
        startTimeMillis: 1722960000000,
        endTimeMillis: 1722970800000,
        timezone: 'America/Los_Angeles',
        locationId: 'loc-1',
      },
    ],
    speakers: [],
    ...overrides,
  };
}

function makeEventData(overrides = {}) {
  return {
    eventId: 'event-123',
    title: 'Adobe Summit 2024',
    seriesId: 'series-abc',
    venueId: 'venue-xyz',
    ...overrides,
  };
}

const mockTagsData = {
  namespaces: {},
};

describe('sessions-hub invite-only RSVP gate', () => {
  let originalFetch;
  let pushStateSpy;

  function stubFetch(handlers) {
    window.fetch = async (url) => {
      const u = typeof url === 'string' ? url : url.url || '';
      for (const [pattern, handler] of handlers) {
        if (u.includes(pattern)) {
          return { ok: true, status: 200, json: async () => handler(u) };
        }
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
  }

  function stubDefaultFetch(eventOverrides = {}) {
    stubFetch([
      ['/v1/events/', () => makeEventData(eventOverrides)],
      ['/v1/series/', () => ({ speakers: [] })],
      ['/v1/venues/', () => ({ name: 'Main Hall', locationId: 'loc-1' })],
      ['/v1/attendees/me/events/', () => ({ sessionIds: [] })],
      ['chimera-api/tags', () => mockTagsData],
      ['dictionary.json', () => ({
        data: { total: 0, offset: 0, limit: 0, data: [] },
        ':names': ['data'],
        ':version': 3,
        ':type': 'multi-sheet',
      })],
    ]);
  }

  function setSessionsMeta(sessions) {
    const meta = document.createElement('meta');
    meta.name = 'sessions';
    meta.content = JSON.stringify(sessions);
    document.head.appendChild(meta);
  }

  beforeEach(() => {
    document.body.innerHTML = body;
    document.head.innerHTML = '<meta name="event-id" content="event-123">';
    originalFetch = window.fetch;
    DictionaryManager._clearCache();
    dictionaryManager.resetLoadedSheetsForTests();

    BlockMediator.set('imsProfile', { userId: 'test-user', account_type: 'type1' });
    BlockMediator.set('eventData', makeEventData());
    BlockMediator.set('rsvpData', null);

    pushStateSpy = sinon.spy(window.history, 'pushState');
  });

  afterEach(() => {
    window.fetch = originalFetch;
    pushStateSpy.restore();
    BlockMediator.set('imsProfile', undefined);
    BlockMediator.set('eventData', undefined);
    BlockMediator.set('rsvpData', undefined);
    sessionStorage.removeItem('sessions-hub:pendingEventRsvp');
    sessionStorage.removeItem('sessions-hub:pendingSessionId');
    window.history.replaceState({}, '', `${window.location.pathname}`);
  });

  it('shows invite-only message on banner and disabled "blocked" CTA on cards when event is invite-only and URL has no campaign', async () => {
    stubDefaultFetch({ inviteOnly: true });
    setSessionsMeta([makeSession()]);
    const el = document.querySelector('.sessions-hub');
    await init(el);

    const banner = document.querySelector('.sh-event-banner');
    expect(banner.querySelector('.sh-btn-event-register')).to.be.null;
    const bannerMsg = banner.querySelector('.sh-banner-invite-only-msg');
    expect(bannerMsg).to.not.be.null;
    expect(bannerMsg.textContent).to.equal(INVITE_FALLBACK);

    // Cards now share the unified blocked state with event-waitlisted/event-closed:
    // a disabled `.sh-btn-blocked` button labeled "Registration unavailable".
    const blockedBtn = el.querySelector('.sh-card .sh-btn-blocked');
    expect(blockedBtn).to.not.be.null;
    expect(blockedBtn.disabled).to.be.true;
    expect(el.querySelector('.sh-card .sh-btn-register-event')).to.be.null;
    expect(el.querySelector('.sh-card .sh-btn-register-session')).to.be.null;
  });

  it('shows Register UI when event is invite-only but URL has a valid campaign param', async () => {
    stubDefaultFetch({ inviteOnly: true });
    setSessionsMeta([makeSession()]);
    window.history.replaceState({}, '', `${window.location.pathname}?campaign=valid-camp-1`);

    const el = document.querySelector('.sessions-hub');
    await init(el);

    const banner = document.querySelector('.sh-event-banner');
    expect(banner.querySelector('.sh-btn-event-register')).to.not.be.null;
    expect(banner.querySelector('.sh-banner-invite-only-msg')).to.be.null;
    expect(el.querySelector('.sh-btn-register-event')).to.not.be.null;
    expect(el.querySelector('.sh-invite-only-msg')).to.be.null;
  });

  it('does not auto-open RSVP modal from pendingEventRsvp when invite-only blocked', async () => {
    stubDefaultFetch({ inviteOnly: true });
    setSessionsMeta([makeSession()]);
    sessionStorage.setItem('sessions-hub:pendingEventRsvp', '1');

    const el = document.querySelector('.sessions-hub');
    await init(el);

    const rsvpPushes = pushStateSpy.getCalls().filter((c) => String(c.args[2] || '').includes('rsvp-form'));
    expect(rsvpPushes.length).to.equal(0);
  });
});
