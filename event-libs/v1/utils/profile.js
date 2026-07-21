import BlockMediator from '../deps/block-mediator.min.js';
import { getEventAttendee, getGuestRsvpLink } from './esp-controller.js';
import { getMetadata, getGuestRsvpToken } from './utils.js';

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
    // A guest RSVP link always bypasses Adobe ID login, regardless of whether the
    // browser happens to have a signed-in IMS session (e.g. an assistant using their
    // own account to RSVP on a VIP's behalf). Resolve the link itself server-side and
    // short-circuit the normal profile/attendee lookup.
    const guestRsvpToken = getGuestRsvpToken();
    if (guestRsvpToken) {
      const linkResp = await getGuestRsvpLink(guestRsvpToken);
      // A link minted for a different event must never register against this page's
      // event (e.g. a copy-pasted/reused URL) — treat that the same as an invalid link.
      // Also honor an explicit non-'unused' status if the backend reports one on an
      // otherwise-ok response, rather than relying solely on the HTTP status code.
      const isForThisEvent = linkResp.ok
        && linkResp.data?.eventId === getMetadata('event-id')
        && (linkResp.data?.status == null || linkResp.data.status === 'unused');
      BlockMediator.set('rsvpData', null);
      BlockMediator.set('imsProfile', isForThisEvent
        ? { account_type: 'guest', guestRsvpToken, guestRsvpEventId: linkResp.data.eventId }
        : { account_type: 'guest', guestRsvpToken, guestLinkInvalid: true });
      return;
    }

    try {
      const profile = await getProfile();
      BlockMediator.set('imsProfile', profile);

      if (!profile.noProfile && profile.account_type !== 'guest') {
        const resp = await getEventAttendee(getMetadata('event-id'));
        BlockMediator.set('rsvpData', resp.ok ? resp.data : null);
      }
    } catch {
      BlockMediator.set('rsvpData', null);
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
