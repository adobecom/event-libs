import BlockMediator from '../deps/block-mediator.min.js';
import { getEventAttendee } from './esp-controller.js';
import { getMetadata } from './utils.js';

export async function getProfile() {
  const { feds, adobeProfile, fedsConfig, adobeIMS } = window;

  const getUserProfile = () => {
    if (fedsConfig?.universalNav) {
      return feds?.services?.universalnav?.interface?.adobeProfile?.getUserProfile()
          || adobeProfile?.getUserProfile();
    }

    return (
      feds?.services?.profile?.interface?.adobeProfile?.getUserProfile()
      || adobeProfile?.getUserProfile()
      || adobeIMS?.getProfile()
    );
  };

  const profile = await getUserProfile();

  return profile;
}

export function lazyCaptureProfile() {
  const isEventPage = getMetadata('event-id');
  if (!isEventPage) return;

  if (window.adobeIMS) {
    captureProfile();
    return;
  }

  try {
    let adobeIMSValue;
    Object.defineProperty(window, 'adobeIMS', {
      get() {
        return adobeIMSValue;
      },
      set(value) {
        adobeIMSValue = value;
        if (value) {
          captureProfile();
        }
      },
      configurable: true,
    });
  } catch (e) {
    pollForAdobeIMS();
  }

  async function captureProfile() {
    try {
      const profile = await getProfile();
      BlockMediator.set('imsProfile', profile);

      if (!profile.noProfile && profile.account_type !== 'guest') {
        const resp = await getEventAttendee(getMetadata('event-id'));
        BlockMediator.set('rsvpData', resp.data);
      }
    } catch {
      if (window.adobeIMS) {
        BlockMediator.set('imsProfile', { noProfile: true });
      }
    }
  }

  function pollForAdobeIMS() {
    let counter = 0;
    const maxAttempts = 100;
    const interval = setInterval(() => {
      if (window.adobeIMS) {
        clearInterval(interval);
        captureProfile();
      } else if (counter >= maxAttempts) {
        clearInterval(interval);
      }
      counter += 1;
    }, 100);
  }
}
