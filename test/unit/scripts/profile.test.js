import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { getProfile, lazyCaptureProfile } from '../../../event-libs/v1/utils/profile.js';
import { setEventConfig, resetAdobeIMSWatcher } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

describe('Profile Functions', () => {
  let clock;
  let metaEventId;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    resetAdobeIMSWatcher();
    window.feds = null;
    window.adobeProfile = null;
    window.fedsConfig = null;
    window.adobeIMS = null;
    setEventConfig({}, {
      miloLibs: '/libs',
      env: { name: 'local' },
      origin: window.location.origin,
      pathname: window.location.pathname,
    });

    // Clear BlockMediator state
    BlockMediator.set('imsProfile', undefined);
    BlockMediator.set('rsvpData', undefined);

    // Create meta tag for event-id to enable lazyCaptureProfile
    metaEventId = document.createElement('meta');
    metaEventId.setAttribute('name', 'event-id');
    metaEventId.content = 'test-event-id';
    document.head.appendChild(metaEventId);
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();

    // Clean up meta tag
    if (metaEventId && metaEventId.parentNode) {
      document.head.removeChild(metaEventId);
    }

    // Clear BlockMediator state
    BlockMediator.set('imsProfile', undefined);
    BlockMediator.set('rsvpData', undefined);
  });

  it('should get the user profile', async () => {
    window.feds = {
      services: {
        universalnav: { interface: { adobeProfile: { getUserProfile: () => Promise.resolve({ name: 'John Doe' }) } } },
        profile: { interface: { adobeProfile: { getUserProfile: () => Promise.resolve({ name: 'John Doe' }) } } },
      },
    };
    window.adobeProfile = { getUserProfile: () => Promise.resolve({ name: 'Jane Doe' }) };
    window.fedsConfig = { universalNav: true };
    window.adobeIMS = { getProfile: () => Promise.resolve({ name: 'IMS User' }) };

    const profile = await getProfile();

    expect(profile).to.deep.equal({ name: 'John Doe' });
  });

  it('lazyCapture resolves synchronously when adobeIMS is already available', async () => {
    window.feds = {
      services: {
        universalnav: { interface: { adobeProfile: { getUserProfile: () => Promise.resolve({ name: 'John Doe' }) } } },
        profile: { interface: { adobeProfile: { getUserProfile: () => Promise.resolve({ name: 'John Doe' }) } } },
      },
    };
    window.adobeProfile = { getUserProfile: () => Promise.resolve({ name: 'Jane Doe' }) };
    window.fedsConfig = { universalNav: true };
    window.adobeIMS = { getProfile: () => Promise.resolve({ name: 'IMS User' }) };
    sinon.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

    lazyCaptureProfile();

    clock.tick(8000);

    expect(BlockMediator.get('rsvpData')).to.be.undefined;
  });

  it('should fire captureProfile once adobeIMS is assigned after waiting', async () => {
    lazyCaptureProfile();

    await clock.tick(8000);
    window.adobeIMS = { getProfile: () => Promise.resolve(null) };

    await clock.tick(3000);
    const profile = await getProfile();
    expect(profile).to.equal(null);
    expect(BlockMediator.get('rsvpData')).to.equal(null);
    expect(BlockMediator.get('imsProfile')).to.deep.equal({ noProfile: true });
  });

  it('should return early when there is no event-id', async () => {
    // Remove the event-id meta tag to simulate non-event page
    document.head.removeChild(metaEventId);
    metaEventId = null;

    // Call lazyCaptureProfile - it should return early without doing anything
    lazyCaptureProfile();

    // Even if we set adobeIMS after calling lazyCaptureProfile, nothing should happen
    // because the function already returned early
    window.adobeIMS = { getProfile: () => Promise.resolve({ name: 'IMS User' }) };
    
    // Advance time to ensure no polling or async operations were started
    await clock.tick(1000);

    // Verify that no profile capture was initiated
    expect(BlockMediator.get('imsProfile')).to.be.undefined;
    expect(BlockMediator.get('rsvpData')).to.be.undefined;
  });

  it('should set rsvpData to null when profile capture fails', async () => {
    window.adobeIMS = {
      getProfile: () => Promise.reject(new Error('failed profile lookup')),
    };

    lazyCaptureProfile();
    await clock.tickAsync(50);
    await Promise.resolve();

    expect(BlockMediator.get('rsvpData')).to.equal(null);
  });

  describe('RSVP token bypass', () => {
    beforeEach(() => {
      // A prior test may have left an accessor (get/set) descriptor on window.adobeIMS
      // via lazyCaptureProfile's polling fallback; delete it so our plain assignment
      // below creates a fresh data property instead of re-triggering a stale closure.
      delete window.adobeIMS;
      // captureProfile's guest branch triggers a real, unstubbed dynamic import
      // (constructRequestOptions -> getUuid.js) that 404s in this test env — genuine
      // network I/O the outer fake clock can't accelerate. Use real timers here so
      // waitForImsProfile below can reliably poll for the real async work to settle.
      clock.restore();
    });

    afterEach(() => {
      window.history.replaceState({}, '', window.location.pathname);
    });

    async function waitForImsProfile({ timeout = 3000, interval = 20 } = {}) {
      const start = Date.now();
      while (BlockMediator.get('imsProfile') === undefined) {
        if (Date.now() - start > timeout) throw new Error('Timed out waiting for imsProfile to be set');
        await new Promise((resolve) => { setTimeout(resolve, interval); });
      }
    }

    it('should bypass Adobe ID and set a synthetic guest profile for a valid RSVP token', async () => {
      const token = 'valid-rsvp-token-1234567890';
      window.history.replaceState({}, '', `${window.location.pathname}?rsvpToken=${token}`);
      // A real IMS profile must never be consulted once an RSVP token is present.
      window.adobeIMS = { getProfile: () => Promise.resolve({ name: 'Should not be used' }), getAccessToken: () => null };
      sinon.stub(window, 'fetch').resolves({ json: () => ({ eventId: 'test-event-id', campaignId: 'camp-1' }), ok: true });

      lazyCaptureProfile();
      await waitForImsProfile();

      expect(BlockMediator.get('imsProfile')).to.deep.equal({
        account_type: 'guest',
        rsvpToken: token,
        rsvpTokenEventId: 'test-event-id',
      });
      expect(BlockMediator.get('rsvpData')).to.equal(null);
      expect(window.fetch.calledOnce).to.be.true;
      const [url, options] = window.fetch.firstCall.args;
      expect(url).to.include('/v1/events/test-event-id/rsvpTokenRegistrations');
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal(token);
    });

    it('should mark the profile rsvpTokenInvalid when the token does not validate for this event (404)', async () => {
      // The validate call is event-scoped, so a token minted for a different event
      // (e.g. a copy-pasted/reused URL) 404s server-side rather than needing a
      // client-side eventId comparison.
      const token = 'wrong-event-rsvp-token-12345';
      window.history.replaceState({}, '', `${window.location.pathname}?rsvpToken=${token}`);
      window.adobeIMS = { getProfile: () => Promise.resolve({ name: 'Should not be used' }), getAccessToken: () => null };
      sinon.stub(window, 'fetch').resolves({ json: () => ({ message: 'Not found' }), ok: false, status: 404 });

      lazyCaptureProfile();
      await waitForImsProfile();

      expect(BlockMediator.get('imsProfile')).to.deep.equal({
        account_type: 'guest',
        rsvpToken: token,
        rsvpTokenInvalid: true,
      });
      expect(BlockMediator.get('rsvpData')).to.equal(null);
    });

    it('should mark the profile rsvpTokenInvalid when the token cannot be validated (used/expired/revoked)', async () => {
      const token = 'consumed-rsvp-token-987654321';
      window.history.replaceState({}, '', `${window.location.pathname}?rsvpToken=${token}`);
      window.adobeIMS = { getProfile: () => Promise.resolve({ name: 'Should not be used' }), getAccessToken: () => null };
      sinon.stub(window, 'fetch').resolves({ json: () => ({ message: 'Gone' }), ok: false, status: 410 });

      lazyCaptureProfile();
      await waitForImsProfile();

      expect(BlockMediator.get('imsProfile')).to.deep.equal({
        account_type: 'guest',
        rsvpToken: token,
        rsvpTokenInvalid: true,
      });
      expect(BlockMediator.get('rsvpData')).to.equal(null);
    });

    it('should ignore a malformed rsvpToken and fall through to the normal profile flow', async () => {
      window.history.replaceState({}, '', `${window.location.pathname}?rsvpToken=too-short`);
      window.adobeIMS = { getProfile: () => Promise.resolve({ name: 'IMS User', account_type: 'type1' }), getAccessToken: () => null };
      sinon.stub(window, 'fetch').resolves({ text: () => 'not found', ok: false });

      lazyCaptureProfile();
      await waitForImsProfile();

      expect(BlockMediator.get('imsProfile')).to.deep.equal({ name: 'IMS User', account_type: 'type1' });
    });
  });
});
