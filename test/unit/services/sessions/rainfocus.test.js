import { expect } from '@esm-bundle/chai';
import {
  fetchMyData, addSession, removeSession, toggleSessionInterest,
  DEFAULT_RF_API_URL, DEFAULT_RF_PROFILE_ID, RF_PROFILE_IDS, RF_WIDGET_ID,
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

  describe('fetchMyData', () => {
    it('builds the myData request with rfWidgetId and returns scheduled/favorited', async () => {
      stubFetch({ mySchedule: ['session-1', 'session-3'], sessionInterests: ['session-2'] });
      const result = await fetchMyData('auth-token', 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal({ scheduled: ['session-1', 'session-3'], favorited: ['session-2'] });
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

    it('defaults scheduled/favorited to empty arrays when missing from the response', async () => {
      stubFetch({});
      const result = await fetchMyData(null, 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal({ scheduled: [], favorited: [] });
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

    it('rejects on insufficient-access responseCode', async () => {
      stubFetch({ responseCode: '27' });
      let error;
      try {
        await addSession('st-1', null, 'profile-1', 'https://example.com/rf/');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
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
});
