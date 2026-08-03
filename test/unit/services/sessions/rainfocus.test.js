import { expect } from '@esm-bundle/chai';
import {
  fetchScheduled, fetchFavorited, addSession, removeSession, toggleSessionInterest,
  DEFAULT_RF_API_URL,
} from '../../../../event-libs/v1/services/sessions/rainfocus.js';

describe('services/sessions/rainfocus', () => {
  let originalFetch;
  let lastRequest;

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

  describe('fetchScheduled', () => {
    it('builds the mySchedule request with all params and returns the array', async () => {
      stubFetch({ mySchedule: ['session-1', 'session-3'] });
      const result = await fetchScheduled('auth-token', 'client-1', 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal(['session-1', 'session-3']);
      const url = new URL(lastRequest);
      expect(url.origin + url.pathname).to.equal('https://example.com/rf/mySchedule');
      expect(url.searchParams.get('rfApiProfileId')).to.equal('profile-1');
      expect(url.searchParams.get('rfAuthToken')).to.equal('auth-token');
      expect(url.searchParams.get('clientId')).to.equal('client-1');
    });

    it('falls back to DEFAULT_RF_API_URL when no rfApiUrl is provided', async () => {
      stubFetch({ mySchedule: [] });
      await fetchScheduled(null, null, 'profile-1', undefined);
      expect(lastRequest.startsWith(DEFAULT_RF_API_URL)).to.be.true;
    });

    it('appends endpoint to rfApiUrl even when it is missing a trailing slash', async () => {
      stubFetch({ mySchedule: [] });
      await fetchScheduled(null, null, 'profile-1', 'https://example.com/rf');
      const url = new URL(lastRequest);
      expect(url.origin + url.pathname).to.equal('https://example.com/rf/mySchedule');
    });

    it('returns an empty array when mySchedule is missing from the response', async () => {
      stubFetch({});
      const result = await fetchScheduled(null, null, 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal([]);
    });
  });

  describe('fetchFavorited', () => {
    it('builds the myInterests request and returns the array', async () => {
      stubFetch({ myInterests: ['session-2'] });
      const result = await fetchFavorited('auth-token', 'client-1', 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal(['session-2']);
      expect(lastRequest).to.include('/rf/myInterests');
    });
  });

  describe('write actions', () => {
    it('addSession posts to addSession with sessionTimeId and resolves on responseCode 0', async () => {
      stubFetch({ responseCode: '0' });
      const result = await addSession('st-1', 'auth-token', 'client-1', 'profile-1', 'https://example.com/rf/');
      expect(result).to.deep.equal({ responseCode: '0' });
      const url = new URL(lastRequest);
      expect(url.pathname).to.include('addSession');
      expect(url.searchParams.get('sessionTimeId')).to.equal('st-1');
    });

    it('removeSession hits removeSession with sessionTimeId', async () => {
      stubFetch({ responseCode: '0' });
      await removeSession('st-2', null, null, 'profile-1', 'https://example.com/rf/');
      expect(lastRequest).to.include('removeSession');
      expect(lastRequest).to.include('sessionTimeId=st-2');
    });

    it('toggleSessionInterest hits toggleSessionInterest with both sessionTimeId and sessionId', async () => {
      stubFetch({ responseCode: '0' });
      await toggleSessionInterest('st-3', 'sess-3', null, null, 'profile-1', 'https://example.com/rf/');
      const url = new URL(lastRequest);
      expect(url.pathname).to.include('toggleSessionInterest');
      expect(url.searchParams.get('sessionTimeId')).to.equal('st-3');
      expect(url.searchParams.get('sessionId')).to.equal('sess-3');
    });

    it('rejects on a schedule-conflict responseCode', async () => {
      stubFetch({ responseCode: '13' });
      let error;
      try {
        await addSession('st-1', null, null, 'profile-1', 'https://example.com/rf/');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
    });

    it('rejects on insufficient-access responseCode', async () => {
      stubFetch({ responseCode: '27' });
      let error;
      try {
        await addSession('st-1', null, null, 'profile-1', 'https://example.com/rf/');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
    });

    it('rejects when the HTTP request itself fails', async () => {
      stubFetch({}, { ok: false, status: 500 });
      let error;
      try {
        await addSession('st-1', null, null, 'profile-1', 'https://example.com/rf/');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
    });
  });
});
