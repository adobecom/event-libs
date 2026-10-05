import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  fetchAuthToken, fetchMyData, fetchScheduled, fetchFavorited,
  addSession, removeSession, dropAndSwapSession, toggleSessionInterest, fetchAttendeeAccess,
  DEFAULT_RF_API_URL, DEFAULT_RF_PROFILE_ID, RF_PROFILE_IDS, RF_WIDGET_ID, RfAccessError,
} from '../../../../event-libs/v1/services/sessions/rainfocus.js';

describe('services/sessions/rainfocus', () => {
  let originalFetch;
  let lastRequest;

  it('defaults to the current MAX26 profile id', () => {
    expect(RF_PROFILE_IDS.max25).to.equal('MAX25ggj84gt2s0u73vzzzSESSIONHUB');
    expect(RF_PROFILE_IDS.max26).to.equal('MAX26sss1mIiY19qLgszzzSESSIONHUB');
    expect(DEFAULT_RF_PROFILE_ID).to.equal(RF_PROFILE_IDS.max26);
  });

  const stubFetch = (body, { ok = true, status = 200 } = {}) => {
    window.fetch = async (url) => {
      lastRequest = url;
      return {
        ok,
        status,
        json: async () => body,
      };
    };
  };

  beforeEach(() => {
    originalFetch = window.fetch;
    lastRequest = null;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  describe('fetchAuthToken', () => {
    it('builds the jwt request with clientId (the only endpoint that sends it)', async () => {
      stubFetch({ token: 'abc' });
      await fetchAuthToken('client-1', 'profile-1', 'https://example.com/rf/');
      const url = new URL(lastRequest);
      expect(url.pathname).to.equal('/rf/jwt');
      expect(url.searchParams.get('rfApiProfileId')).to.equal('profile-1');
      expect(url.searchParams.get('clientId')).to.equal('client-1');
    });
  });

  describe('fetchScheduled / fetchFavorited', () => {
    it('fetchScheduled hits mySchedule and returns the array', async () => {
      stubFetch({ mySchedule: ['session-1'] });
      const result = await fetchScheduled('auth-token', 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal(['session-1']);
      expect(lastRequest).to.include('/rf/mySchedule');
    });

    it('fetchFavorited hits myInterests and returns the array', async () => {
      stubFetch({ myInterests: ['session-2'] });
      const result = await fetchFavorited('auth-token', 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal(['session-2']);
      expect(lastRequest).to.include('/rf/myInterests');
    });
  });

  describe('fetchAttendeeAccess', () => {
    it('hits attendeeAccess with sessionTimeId', async () => {
      stubFetch({ access: true });
      const result = await fetchAttendeeAccess('st-1', 'auth-token', 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal({ access: true });
      const url = new URL(lastRequest);
      expect(url.pathname).to.equal('/rf/attendeeAccess');
      expect(url.searchParams.get('sessionTimeId')).to.equal('st-1');
    });
  });

  describe('dropAndSwapSession', () => {
    it('hits dropSwapSession with sessionTimeId and dropSessionItems', async () => {
      stubFetch({ responseCode: '0' });
      await dropAndSwapSession('st-new', 'st-old-1;st-old-2', 'auth-token', 'profile-1', 'https://example.com/rf/');
      const url = new URL(lastRequest);
      expect(url.pathname).to.equal('/rf/dropSwapSession');
      expect(url.searchParams.get('sessionTimeId')).to.equal('st-new');
      expect(url.searchParams.get('dropSessionItems')).to.equal('st-old-1;st-old-2');
    });
  });

  describe('fetchMyData', () => {
    it('builds the myData request with rfWidgetId and returns scheduled/favorited/loggedInUser', async () => {
      stubFetch({
        mySchedule: ['session-1', 'session-3'], sessionInterests: ['session-2'], loggedInUser: { firstName: 'Test' },
      });
      const result = await fetchMyData('auth-token', 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal({
        scheduled: ['session-1', 'session-3'], favorited: ['session-2'], loggedInUser: { firstName: 'Test' },
      });
      const url = new URL(lastRequest);
      expect(url.origin + url.pathname).to.equal('https://example.com/rf/myData');
      expect(url.searchParams.get('rfApiProfileId')).to.equal('profile-1');
      expect(url.searchParams.get('rfAuthToken')).to.equal('auth-token');
      expect(url.searchParams.get('rfWidgetId')).to.equal(RF_WIDGET_ID);
      expect(url.searchParams.has('clientId')).to.be.false;
    });

    it('falls back to DEFAULT_RF_API_URL when no rfApiUrl is provided', async () => {
      stubFetch({});
      await fetchMyData(null, 'profile-1', undefined);
      expect(lastRequest.startsWith(DEFAULT_RF_API_URL)).to.be.true;
    });

    it('appends endpoint to rfApiUrl even when it is missing a trailing slash', async () => {
      stubFetch({});
      await fetchMyData(null, 'profile-1', 'https://example.com/rf');
      const url = new URL(lastRequest);
      expect(url.origin + url.pathname).to.equal('https://example.com/rf/myData');
    });

    it('defaults scheduled/favorited/loggedInUser when missing from the response', async () => {
      stubFetch({});
      const result = await fetchMyData(null, 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal({ scheduled: [], favorited: [], loggedInUser: null });
    });
  });

  describe('write actions', () => {
    it('addSession posts to addSession with sessionTimeId and resolves on responseCode 0', async () => {
      stubFetch({ responseCode: '0' });
      const result = await addSession('st-1', 'auth-token', 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal({ responseCode: '0' });
      const url = new URL(lastRequest);
      expect(url.pathname).to.include('addSession');
      expect(url.searchParams.get('sessionTimeId')).to.equal('st-1');
      expect(url.searchParams.has('clientId')).to.be.false;
    });

    it('addSession always sends virtual=true — MAX is a hybrid event, matches northstar', async () => {
      // Otherwise RF defaults to in-person-only and rejects with responseCode 27.
      stubFetch({ responseCode: '0' });
      await addSession('st-1', 'auth-token', 'profile-1', 'https://example.com/rf/');
      const url = new URL(lastRequest);
      expect(url.searchParams.get('virtual')).to.equal('true');
    });

    it('removeSession hits removeSession with sessionTimeId', async () => {
      stubFetch({ responseCode: '0' });
      await removeSession('st-2', null, 'profile-1', 'https://example.com/rf/');
      expect(lastRequest).to.include('removeSession');
      expect(lastRequest).to.include('sessionTimeId=st-2');
    });

    it('toggleSessionInterest hits toggleSessionInterest with both sessionTimeId and sessionId', async () => {
      stubFetch({ responseCode: '0' });
      await toggleSessionInterest('st-3', 'sess-3', null, 'profile-1', 'https://example.com/rf/');
      const url = new URL(lastRequest);
      expect(url.pathname).to.include('toggleSessionInterest');
      expect(url.searchParams.get('sessionTimeId')).to.equal('st-3');
      expect(url.searchParams.get('sessionId')).to.equal('sess-3');
    });

    it('rejects on a schedule-conflict responseCode', async () => {
      stubFetch({ responseCode: '13' });
      let error;
      try {
        await addSession('st-1', null, 'profile-1', 'https://example.com/rf/');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
    });

    it('rejects with RfAccessError on insufficient-access responseCode', async () => {
      stubFetch({ responseCode: '27', responseMessage: 'You must be registered...' });
      let error;
      try {
        await addSession('st-1', null, 'profile-1', 'https://example.com/rf/');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an.instanceOf(RfAccessError);
      expect(error.message).to.equal('You must be registered...');
    });

    it('RfAccessError falls back to a default message when RF sends none', async () => {
      stubFetch({ responseCode: '27' });
      let error;
      try {
        await addSession('st-1', null, 'profile-1', 'https://example.com/rf/');
      } catch (err) {
        error = err;
      }
      expect(error.message).to.equal('Insufficient access to schedule this session');
    });

    it('rejects when the HTTP request itself fails', async () => {
      stubFetch({}, { ok: false, status: 500 });
      let error;
      try {
        await addSession('st-1', null, 'profile-1', 'https://example.com/rf/');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
    });
  });

  describe('rawFetch failures are reported to lana', () => {
    let lanaLogStub;

    beforeEach(() => {
      lanaLogStub = sinon.stub(window.lana, 'log');
    });

    afterEach(() => {
      lanaLogStub.restore();
    });

    it('logs a non-ok response before throwing', async () => {
      stubFetch({}, { ok: false, status: 503 });
      let error;
      try {
        await fetchMyData('auth-token', 'profile-1', 'https://example.com/rf/');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(lanaLogStub.calledOnce).to.equal(true);
      expect(lanaLogStub.firstCall.args[0]).to.include('[rainfocus]');
      expect(lanaLogStub.firstCall.args[0]).to.include('myData');
      expect(lanaLogStub.firstCall.args[0]).to.include('503');
    });

    it('logs a network error before rethrowing', async () => {
      window.fetch = async () => { throw new Error('offline'); };
      let error;
      try {
        await fetchMyData('auth-token', 'profile-1', 'https://example.com/rf/');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(lanaLogStub.calledOnce).to.equal(true);
      expect(lanaLogStub.firstCall.args[0]).to.include('[rainfocus] network error calling myData');
      expect(lanaLogStub.firstCall.args[0]).to.include('offline');
    });
  });

  describe('schedule mutation severity', () => {
    let lanaLogStub;

    const operations = [
      { name: 'addSession', run: () => addSession('st-1', 'auth-token', 'profile-1', 'https://example.com/rf/') },
      { name: 'removeSession', run: () => removeSession('st-1', 'auth-token', 'profile-1', 'https://example.com/rf/') },
      { name: 'dropSwapSession', run: () => dropAndSwapSession('st-1', 'st-old', 'auth-token', 'profile-1', 'https://example.com/rf/') },
    ];

    beforeEach(() => {
      lanaLogStub = sinon.stub(window.lana, 'log');
    });

    afterEach(() => {
      lanaLogStub.restore();
    });

    const failureOf = async (run) => {
      let error;
      try {
        await run();
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
      return error;
    };

    operations.forEach(({ name, run }) => {
      describe(name, () => {
        [408, 429, 500, 503].forEach((status) => {
          it(`reports HTTP ${status} once as critical without logging the auth-bearing URL`, async () => {
            const response = new Response('Unavailable', { status });
            Object.defineProperty(response, 'url', { value: `https://example.com/rf/${name}?rfAuthToken=auth-token` });
            window.fetch = async () => response;

            const error = await failureOf(run);

            expect(error.message).to.include(`${status}`);
            expect(lanaLogStub.calledOnce).to.be.true;
            expect(lanaLogStub.firstCall.args[1]).to.deep.equal({ severity: 'critical', sampleRate: 100 });
            expect(lanaLogStub.firstCall.args[0]).to.include(name);
            expect(lanaLogStub.firstCall.args[0]).to.include('st-1');
            expect(lanaLogStub.firstCall.args[0]).to.include(`${status}`);
            expect(lanaLogStub.firstCall.args[0]).to.not.include('auth-token');
            expect(lanaLogStub.firstCall.args[0]).to.not.include('rfAuthToken');
            expect(lanaLogStub.firstCall.args[0]).to.not.include('Unavailable');
          });
        });

        [400, 401, 403, 404, 409, 422].forEach((status) => {
          it(`does not report HTTP ${status} as critical`, async () => {
            stubFetch({}, { ok: false, status });

            await failureOf(run);

            expect(lanaLogStub.calledOnce).to.be.true;
            expect(lanaLogStub.firstCall.args[1]).to.deep.equal({ severity: 'warning' });
          });
        });

        it('reports network failure once as critical and rethrows the original error', async () => {
          const originalError = new Error('offline');
          window.fetch = async () => { throw originalError; };

          const error = await failureOf(run);

          expect(error).to.equal(originalError);
          expect(lanaLogStub.calledOnce).to.be.true;
          expect(lanaLogStub.firstCall.args[1]).to.deep.equal({ severity: 'critical', sampleRate: 100 });
        });

        it('reports an unreadable successful response once as critical', async () => {
          window.fetch = async () => new Response('Private attendee details');

          await failureOf(run);

          expect(lanaLogStub.calledOnce).to.be.true;
          expect(lanaLogStub.firstCall.args[1]).to.deep.equal({ severity: 'critical', sampleRate: 100 });
          expect(lanaLogStub.firstCall.args[0]).to.not.include('Private attendee details');
          expect(lanaLogStub.firstCall.args[0]).to.include('SyntaxError');
        });

        it('does not include the auth-bearing request URL from a thrown network error in its log', async () => {
          window.fetch = async (url) => { throw new Error(`Failed to fetch ${url}`); };

          await failureOf(run);

          expect(lanaLogStub.calledOnce).to.be.true;
          expect(lanaLogStub.firstCall.args[0]).to.not.include('auth-token');
          expect(lanaLogStub.firstCall.args[0]).to.not.include('rfAuthToken');
          expect(lanaLogStub.firstCall.args[0]).to.include('st-1');
          expect(lanaLogStub.firstCall.args[1]).to.deep.equal({ severity: 'critical', sampleRate: 100 });
        });

        ['13', '27'].forEach((responseCode) => {
          it(`keeps expected business rejection ${responseCode} non-critical without logging the response message`, async () => {
            stubFetch({ responseCode, responseMessage: 'Private attendee details' });

            const error = await failureOf(run);

            if (responseCode === '27') expect(error).to.be.an.instanceOf(RfAccessError);
            expect(lanaLogStub.calledOnce).to.be.true;
            expect(lanaLogStub.firstCall.args[1]).to.deep.equal({ severity: 'warning' });
            expect(lanaLogStub.firstCall.args[0]).to.not.include('Private attendee details');
          });
        });

        [{ responseCode: '99' }, {}, null].forEach((body) => {
          it(`reports an unexpected business response ${JSON.stringify(body)} once as critical`, async () => {
            stubFetch(body);

            await failureOf(run);

            expect(lanaLogStub.calledOnce).to.be.true;
            expect(lanaLogStub.firstCall.args[1]).to.deep.equal({ severity: 'critical', sampleRate: 100 });
          });
        });

        ['0', '15'].forEach((responseCode) => {
          it(`does not report success or already-scheduled response ${responseCode} as a failure`, async () => {
            stubFetch({ responseCode });

            expect(await run()).to.deep.equal({ responseCode });
            expect(lanaLogStub.called).to.be.false;
          });
        });
      });
    });

    const nonSchedulingOperations = [
      { name: 'myData', run: () => fetchMyData('auth-token', 'profile-1', 'https://example.com/rf/') },
      { name: 'favorite', run: () => toggleSessionInterest('st-1', 's-1', 'auth-token', 'profile-1', 'https://example.com/rf/') },
    ];
    nonSchedulingOperations.forEach(({ name, run }) => {
      it(`keeps ${name} network failures non-critical`, async () => {
        window.fetch = async () => { throw new Error('offline'); };

        await failureOf(run);

        expect(lanaLogStub.calledOnce).to.be.true;
        expect(lanaLogStub.firstCall.args[1]).to.deep.equal({ severity: 'error', sampleRate: 10 });
      });

      it(`keeps ${name} HTTP failures non-critical`, async () => {
        stubFetch({}, { ok: false, status: 503 });

        await failureOf(run);

        expect(lanaLogStub.calledOnce).to.be.true;
        expect(lanaLogStub.firstCall.args[1]).to.deep.equal({ severity: 'warning' });
      });
    });

    it('keeps an unexpected favorites business response non-critical', async () => {
      stubFetch({ responseCode: '99' });

      await failureOf(nonSchedulingOperations[1].run);

      expect(lanaLogStub.calledOnce).to.be.true;
      expect(lanaLogStub.firstCall.args[1]).to.deep.equal({ severity: 'error', sampleRate: 10 });
    });
  });
});
