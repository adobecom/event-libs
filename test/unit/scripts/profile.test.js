import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { getProfile, lazyCaptureProfile } from '../../../event-libs/v1/utils/profile.js';
import { setEventConfig } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

describe('Profile Functions', () => {
  let clock;
  let metaEventId;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
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

  it('lazyCapture starts with the polling system', async () => {
    window.feds = {
      services: {
        universalnav: { interface: { adobeProfile: { getUserProfile: () => Promise.resolve({ name: 'John Doe' }) } } },
        profile: { interface: { adobeProfile: { getUserProfile: () => Promise.resolve({ name: 'John Doe' }) } } },
      },
    };
    window.adobeProfile = { getUserProfile: () => Promise.resolve({ name: 'Jane Doe' }) };
    window.fedsConfig = { universalNav: true };
    window.adobeIMS = { getProfile: () => Promise.resolve({ name: 'IMS User' }) };

    lazyCaptureProfile();

    clock.tick(8000);

    expect(BlockMediator.get('rsvpData')).to.be.undefined;
  });

  it('should stop polling after 10 retries', async () => {
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
});
