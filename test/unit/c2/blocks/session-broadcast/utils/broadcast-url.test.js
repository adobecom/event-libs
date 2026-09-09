import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  readWatchParam,
  stripWatchParam,
  pushSessionState,
  getHistorySessionId,
  persistActiveSession,
  getPersistedSessionId,
  clearPersistedSession,
} from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/utils/broadcast-url.js';

describe('broadcast-url', () => {
  const basePath = window.location.pathname;

  afterEach(() => {
    sinon.restore();
    // Reset so URL/history state never leaks between tests or into other spec files.
    history.replaceState(null, '', basePath);
    clearPersistedSession();
  });

  describe('readWatchParam', () => {
    it('reads the watch param from the current URL', () => {
      history.replaceState(null, '', `${basePath}?watch=abc-123`);
      expect(readWatchParam()).to.equal('abc-123');
    });

    it('returns null when there is no watch param', () => {
      history.replaceState(null, '', basePath);
      expect(readWatchParam()).to.equal(null);
    });

    it('ignores a session param — that key belongs to sessions-guide, not Broadcast', () => {
      history.replaceState(null, '', `${basePath}?session=some-slug`);
      expect(readWatchParam()).to.equal(null);
    });
  });

  describe('stripWatchParam', () => {
    it('removes the watch param from the visible URL', () => {
      history.replaceState(null, '', `${basePath}?watch=abc-123`);
      stripWatchParam('abc-123');
      expect(window.location.search).to.not.include('watch=');
    });

    it('preserves unrelated query params', () => {
      history.replaceState(null, '', `${basePath}?serverTime=1000&watch=abc-123`);
      stripWatchParam('abc-123');
      expect(window.location.search).to.include('serverTime=1000');
      expect(window.location.search).to.not.include('watch=');
    });

    it('leaves a sessions-guide session param untouched', () => {
      history.replaceState(null, '', `${basePath}?watch=abc-123&session=some-slug`);
      stripWatchParam('abc-123');
      expect(window.location.search).to.include('session=some-slug');
      expect(window.location.search).to.not.include('watch=');
    });

    it('seeds history.state with the session id', () => {
      history.replaceState(null, '', `${basePath}?watch=abc-123`);
      stripWatchParam('abc-123');
      expect(history.state).to.deep.equal({ session: 'abc-123' });
    });

    // Asserts which history method actually ran, not history.length — the full suite shares
    // one browser session across ~140+ spec files, and history.length hits a hard cap well
    // before this file's turn (confirmed: it sticks at a fixed value and pushState can no
    // longer increase it), which made a length-based assertion deterministically fail in CI.
    it('does not add a new history entry (uses replaceState)', () => {
      const replaceStateSpy = sinon.spy(history, 'replaceState');
      const pushStateSpy = sinon.spy(history, 'pushState');
      stripWatchParam(null);
      expect(replaceStateSpy.calledOnce).to.equal(true);
      expect(pushStateSpy.called).to.equal(false);
    });
  });

  describe('pushSessionState', () => {
    it('never adds a watch param to the visible URL', () => {
      pushSessionState('xyz-789');
      expect(window.location.search).to.not.include('watch=');
    });

    it('carries the session id in history.state', () => {
      pushSessionState('xyz-789');
      expect(getHistorySessionId()).to.equal('xyz-789');
    });

    // See the note on the replaceState test above for why this asserts the method called
    // rather than history.length.
    it('adds a new history entry (uses pushState, not replaceState)', () => {
      const pushStateSpy = sinon.spy(history, 'pushState');
      const replaceStateSpy = sinon.spy(history, 'replaceState');
      pushSessionState('xyz-789');
      expect(pushStateSpy.calledOnce).to.equal(true);
      expect(replaceStateSpy.called).to.equal(false);
    });
  });

  describe('getHistorySessionId', () => {
    it('returns null when history.state carries no session', () => {
      history.replaceState({}, '', basePath);
      expect(getHistorySessionId()).to.equal(null);
    });
  });

  describe('persistActiveSession / getPersistedSessionId / clearPersistedSession', () => {
    it('round-trips a session id through sessionStorage', () => {
      persistActiveSession('abc-123');
      expect(getPersistedSessionId()).to.equal('abc-123');
    });

    it('returns null when nothing has been persisted', () => {
      expect(getPersistedSessionId()).to.equal(null);
    });

    it('overwrites a previously persisted id', () => {
      persistActiveSession('abc-123');
      persistActiveSession('xyz-789');
      expect(getPersistedSessionId()).to.equal('xyz-789');
    });

    // The exact scenario clearPersistedSession() exists for: persistActiveSession() only ever
    // writes on a truthy id, so it can't remove a stale value on its own — a stale ?watch= link
    // needs the dedicated clear, not just "don't persist a new one."
    it('clears a persisted id so it cannot be restored on a later refresh', () => {
      persistActiveSession('abc-123');
      clearPersistedSession();
      expect(getPersistedSessionId()).to.equal(null);
    });
  });
});
