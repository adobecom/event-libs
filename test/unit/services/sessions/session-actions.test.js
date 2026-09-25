import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

import {
  assertAuthorized, toggleScheduleAction, SessionActionError,
} from '../../../../event-libs/v1/services/sessions/session-actions.js';
import {
  auth, sessions, sessionsStatus, liveStreamActiveIds, scheduled, pendingActions, initSessionState,
} from '../../../../event-libs/v1/utils/session-store.js';
import { setMetadata } from '../../../../event-libs/v1/utils/utils.js';

describe('services/sessions/session-actions', () => {
  beforeEach(() => {
    auth.value = { isLoggedIn: null, isRegistered: undefined, userFirstName: null };
    sessions.value = [];
    liveStreamActiveIds.value = new Set();
    scheduled.value = new Set();
    pendingActions.value = new Set();
  });

  describe('assertAuthorized', () => {
    it('throws auth-required when not logged in', () => {
      auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
      expect(() => assertAuthorized()).to.throw(SessionActionError)
        .with.property('reason', 'auth-required');
    });

    it('throws registration-required when logged in but not registered, pre/during event', () => {
      auth.value = { isLoggedIn: true, isRegistered: false, userFirstName: null };
      sessions.value = [
        { id: 's-1', startTimeUtc: '2099-01-01T00:00:00Z', endTimeUtc: '2099-01-01T01:00:00Z' },
      ];
      expect(() => assertAuthorized()).to.throw(SessionActionError)
        .with.property('reason', 'registration-required');
    });

    it('does not throw when logged in and registered', () => {
      auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: null };
      expect(() => assertAuthorized()).to.not.throw();
    });

    it('does not throw when logged in but unregistered, once every session has ended (post-event)', () => {
      auth.value = { isLoggedIn: true, isRegistered: false, userFirstName: null };
      sessions.value = [
        { id: 's-1', startTimeUtc: '2020-01-01T00:00:00Z', endTimeUtc: '2020-01-01T01:00:00Z' },
      ];
      expect(() => assertAuthorized()).to.not.throw();
    });

    it('still throws auth-required post-event when logged out entirely', () => {
      auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
      sessions.value = [
        { id: 's-1', startTimeUtc: '2020-01-01T00:00:00Z', endTimeUtc: '2020-01-01T01:00:00Z' },
      ];
      expect(() => assertAuthorized()).to.throw(SessionActionError)
        .with.property('reason', 'auth-required');
    });
  });

  describe('toggleScheduleAction — RF responseCode 27 (MWPW-207006)', () => {
    let sandbox;

    beforeEach(async () => {
      sandbox = sinon.createSandbox();
      setMetadata('tier-1-event-config', JSON.stringify({ eventId: 'test-event' }));
      sandbox.stub(window, 'fetch').callsFake(async (url) => {
        const href = String(url);
        if (href.includes('session-catalog')) {
          return { ok: true, json: async () => ({ sessions: [], sessionTimes: [], speakers: [], locations: [] }) };
        }
        if (href.includes('addSession')) {
          return { ok: true, json: async () => ({ responseCode: '27', responseMessage: 'not registered' }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      initSessionState();
      await new Promise((resolve) => {
        const check = () => (sessionsStatus.value === 'ready' ? resolve() : setTimeout(check));
        check();
      });
    });

    afterEach(() => {
      sandbox.restore();
      setMetadata('tier-1-event-config', '');
    });

    it('maps a responseCode-27 rejection to registration-required, not a generic network error', async () => {
      auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: null };
      const session = {
        id: 's-1', rfCode: 'rf-1', startTimeUtc: '2099-01-01T00:00:00Z', endTimeUtc: '2099-01-01T01:00:00Z',
      };
      sessions.value = [session];

      let error;
      try {
        await toggleScheduleAction(session);
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an.instanceOf(SessionActionError);
      expect(error.reason).to.equal('registration-required');
    });
  });
});
