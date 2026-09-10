import { expect } from '@esm-bundle/chai';
import {
  cacheKey,
  readCache,
  writeCache,
  authCacheKey,
  readAuthCache,
  writeAuthCache,
  fetchRegistrationStatus,
  preloadRegistrationStatus,
  exposeRegistrationStatus,
  setEventOriginCookie,
} from '../../../event-libs/v1/utils/registration-cache.js';
import { setEventConfig } from '../../../event-libs/v1/utils/utils.js';

// The RF-auth URL's stage/prod host is chosen from Milo's page env (getEventConfig().miloConfig
// .env.name), so stub that via setEventConfig rather than the ESP service env.
const setMiloEnv = (name) => setEventConfig({}, { env: { name } });

const EVENT_CODE = 'max2025';
const USER_ID = 'user-123';

const setCookie = (str) => { document.cookie = str; };
const clearCookie = (name) => { document.cookie = `${name}=; Max-Age=0; path=/;`; };
// Macrotask flush: lets a fire-and-forget promise chain (fetch → json → write) settle without
// guessing tick counts.
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// A ready, signed-in IMS stub. Set BEFORE calling into the module so waitForAdobeIMS() resolves
// immediately (window.adobeIMS is already present) — no timeout wait, tests stay fast.
function signedInIms({ token = 'access-tok' } = {}) {
  return {
    isSignedInUser: () => true,
    getProfile: async () => ({ userId: USER_ID }),
    getAccessToken: () => (token ? { token } : null),
  };
}

describe('registration-cache', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete window.adobeIMS;
    delete window.events;
    setMiloEnv('stage');
  });

  afterEach(() => {
    clearCookie(`feds_${EVENT_CODE}_registeredByRedirect`);
    delete window.fetch;
  });

  describe('status cache (localStorage: isRegistered/inPersonAttendee)', () => {
    it('keys the cache by event code and user id', () => {
      expect(cacheKey(EVENT_CODE, USER_ID)).to.equal(`mep-event:${EVENT_CODE}:${USER_ID}`);
    });

    it('round-trips a registered result', () => {
      writeCache(EVENT_CODE, USER_ID, { isRegistered: true, inPersonAttendee: true });
      expect(readCache(EVENT_CODE, USER_ID)).to.deep.equal({
        isRegistered: true,
        inPersonAttendee: true,
      });
    });

    it('returns null when nothing is cached', () => {
      expect(readCache(EVENT_CODE, USER_ID)).to.equal(null);
    });

    it('returns null once the cached entry has expired', () => {
      localStorage.setItem(cacheKey(EVENT_CODE, USER_ID), JSON.stringify({
        isRegistered: true, inPersonAttendee: false, exp: Date.now() - 1000,
      }));
      expect(readCache(EVENT_CODE, USER_ID)).to.equal(null);
    });

    it('leaves inPersonAttendee unset rather than defaulting it to false when unknown', () => {
      writeCache(EVENT_CODE, USER_ID, { isRegistered: true });
      expect(readCache(EVENT_CODE, USER_ID).inPersonAttendee).to.equal(undefined);
    });
  });

  describe('auth cache (sessionStorage: authToken/userKey)', () => {
    it('keys the auth cache separately from the status cache', () => {
      expect(authCacheKey(EVENT_CODE, USER_ID)).to.equal(`mep-event-auth:${EVENT_CODE}:${USER_ID}`);
    });

    it('round-trips authToken/userKey via sessionStorage, not localStorage', () => {
      writeAuthCache(EVENT_CODE, USER_ID, { authToken: 'tok-1', userKey: 'key-1' });
      expect(readAuthCache(EVENT_CODE, USER_ID)).to.deep.equal({ authToken: 'tok-1', userKey: 'key-1' });
      expect(localStorage.getItem(authCacheKey(EVENT_CODE, USER_ID))).to.equal(null);
    });

    it('returns null once the auth cache entry has expired', () => {
      sessionStorage.setItem(authCacheKey(EVENT_CODE, USER_ID), JSON.stringify({
        authToken: 'tok', userKey: 'key', exp: Date.now() - 1000,
      }));
      expect(readAuthCache(EVENT_CODE, USER_ID)).to.equal(null);
    });
  });

  describe('setEventOriginCookie', () => {
    // domain=.adobe.com + secure means the browser silently refuses to persist this cookie from
    // the localhost this test runs on, so spy on the document.cookie setter rather than reading the
    // real cookie jar (same approach as the da-events original).
    it('writes a URL-encoded, .adobe.com-scoped, secure event-origin cookie for the current URL', () => {
      const writes = [];
      const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        set(value) { writes.push(value); },
        get() { return descriptor.get.call(document); },
      });

      try {
        setEventOriginCookie();
      } finally {
        delete document.cookie;
      }

      expect(writes.length).to.equal(1);
      expect(writes[0]).to.include(`event-origin=${encodeURIComponent(window.location.href)}`);
      expect(writes[0]).to.include('domain=.adobe.com');
      expect(writes[0]).to.include('path=/');
      expect(writes[0]).to.include('secure');
      expect(writes[0]).to.match(/expires=/);
    });
  });

  describe('fetchRegistrationStatus', () => {
    it('returns not-registered without calling the API when the user is not signed in', async () => {
      // getAccessToken present (even if unused) so waitForAdobeIMS() sees IMS as "ready" and
      // resolves immediately — isSignedInUser:false is what makes this bail before any fetch.
      window.adobeIMS = { isSignedInUser: () => false, getAccessToken: () => null };
      window.fetch = () => { throw new Error('fetch should not be called'); };

      const result = await fetchRegistrationStatus(EVENT_CODE);
      expect(result).to.deep.equal({ isRegistered: false });
    });

    it('returns not-registered without calling the API when there is no access token', async () => {
      window.adobeIMS = signedInIms({ token: null });
      window.fetch = () => { throw new Error('fetch should not be called'); };

      const result = await fetchRegistrationStatus(EVENT_CODE);
      expect(result).to.deep.equal({ isRegistered: false });
    });

    it('trusts the redirect cookie without calling the status API, and caches it', async () => {
      // getAccessToken:null so IMS reads as "ready" (waitForAdobeIMS resolves) but the background
      // auth-warming call bails before fetch — proving the redirect fast path skips the status API.
      window.adobeIMS = {
        isSignedInUser: () => true,
        getProfile: async () => ({ userId: USER_ID }),
        getAccessToken: () => null,
      };
      setCookie(`feds_${EVENT_CODE}_registeredByRedirect=true`);
      window.fetch = () => { throw new Error('fetch should not be called'); };

      const result = await fetchRegistrationStatus(EVENT_CODE);
      expect(result.isRegistered).to.equal(true);
      expect(readCache(EVENT_CODE, USER_ID).isRegistered).to.equal(true);
      // never guesses inPersonAttendee on this fast path
      expect(readCache(EVENT_CODE, USER_ID).inPersonAttendee).to.equal(undefined);
    });

    it('short-circuits to the cached status + auth without fetching when both are cached', async () => {
      window.adobeIMS = signedInIms();
      writeCache(EVENT_CODE, USER_ID, { isRegistered: true, inPersonAttendee: false });
      writeAuthCache(EVENT_CODE, USER_ID, { authToken: 'tok-c', userKey: 'key-c' });
      window.fetch = () => { throw new Error('fetch should not be called'); };

      const result = await fetchRegistrationStatus(EVENT_CODE);
      expect(result).to.deep.equal({
        isRegistered: true, inPersonAttendee: false, authToken: 'tok-c', userKey: 'key-c',
      });
    });

    it('fetches from RF, then caches status (localStorage) and auth (sessionStorage)', async () => {
      window.adobeIMS = signedInIms();
      window.fetch = async () => ({
        ok: true,
        json: async () => ({
          isRegistered: true, inPersonAttendee: true, authToken: 'tok-9', userKey: 'key-9',
        }),
      });

      const result = await fetchRegistrationStatus(EVENT_CODE);
      expect(result).to.deep.equal({
        isRegistered: true, inPersonAttendee: true, authToken: 'tok-9', userKey: 'key-9',
      });
      expect(readCache(EVENT_CODE, USER_ID)).to.deep.equal({ isRegistered: true, inPersonAttendee: true });
      expect(readAuthCache(EVENT_CODE, USER_ID)).to.deep.equal({ authToken: 'tok-9', userKey: 'key-9' });
    });

    it('treats an empty RF response ({}) as not registered', async () => {
      window.adobeIMS = signedInIms();
      window.fetch = async () => ({ ok: true, json: async () => ({}) });

      const result = await fetchRegistrationStatus(EVENT_CODE);
      expect(result.isRegistered).to.equal(false);
    });

    it('builds a .stage RF URL off Milo page env when not prod', async () => {
      setMiloEnv('stage');
      window.adobeIMS = signedInIms();
      let calledUrl = '';
      window.fetch = async (url) => {
        calledUrl = url;
        return { ok: true, json: async () => ({ isRegistered: false }) };
      };

      await fetchRegistrationStatus(EVENT_CODE);
      expect(calledUrl).to.include('https://www.stage.adobe.com/events/api/rf-auth-seq-generic/');
    });

    it('builds a prod RF URL (no .stage) when Milo page env is prod', async () => {
      setMiloEnv('prod');
      window.adobeIMS = signedInIms();
      let calledUrl = '';
      window.fetch = async (url) => {
        calledUrl = url;
        return { ok: true, json: async () => ({ isRegistered: false }) };
      };

      await fetchRegistrationStatus(EVENT_CODE);
      expect(calledUrl).to.include('https://www.adobe.com/events/api/rf-auth-seq-generic/');
      expect(calledUrl).to.not.include('.stage.adobe.com');
    });
  });

  describe('preloadRegistrationStatus', () => {
    it('broadcasts registration:resolved with only the gating flags, excluding authToken/userKey', async () => {
      window.adobeIMS = signedInIms();
      window.fetch = async () => ({
        ok: true,
        json: async () => ({
          isRegistered: true, inPersonAttendee: true, authToken: 'tok-b', userKey: 'key-b',
        }),
      });

      let detail = null;
      const onResolved = (e) => { detail = e.detail; };
      window.addEventListener('registration:resolved', onResolved, { once: true });

      await preloadRegistrationStatus(EVENT_CODE);
      expect(detail).to.deep.equal({ isRegistered: true, inPersonAttendee: true });
    });
  });

  describe('exposeRegistrationStatus', () => {
    it('exposes getRegistrationStatus (gating flags only) and getRegistrationDetails (with auth)', async () => {
      window.adobeIMS = signedInIms();
      window.fetch = async () => ({
        ok: true,
        json: async () => ({
          isRegistered: true, inPersonAttendee: false, authToken: 'tok-d', userKey: 'key-d',
        }),
      });

      exposeRegistrationStatus(EVENT_CODE);
      expect(await window.events.getRegistrationStatus())
        .to.deep.equal({ isRegistered: true, inPersonAttendee: false });
      expect(await window.events.getRegistrationDetails())
        .to.deep.equal({
          isRegistered: true, inPersonAttendee: false, authToken: 'tok-d', userKey: 'key-d',
        });
    });

    it('memoizes to a single RF call shared by both getters and late callers', async () => {
      window.adobeIMS = signedInIms();
      let fetchCount = 0;
      window.fetch = async () => {
        fetchCount += 1;
        return { ok: true, json: async () => ({ isRegistered: true }) };
      };

      exposeRegistrationStatus(EVENT_CODE);
      await window.events.getRegistrationStatus();
      await window.events.getRegistrationDetails();
      await window.events.getRegistrationStatus(); // late caller
      await flush();
      expect(fetchCount).to.equal(1);
    });
  });
});
