import BlockMediator from '../deps/block-mediator.min.js';
import { getEventAttendee, validateRsvpToken } from './esp-controller.js';
import { getMetadata, getRsvpToken, waitForImsInstance } from './utils.js';

/**
 * Resolves the visitor's profile from IMS. Always resolves to an object so `imsProfile`
 * consumers can keep treating `undefined` as "not resolved yet":
 * - signed-in user: the full IMS profile
 * - guest IMS token: `{ account_type: 'guest' }`
 * - no IMS credential: `{ noProfile: true }`
 */
export async function getProfile() {
  // Wait for imslib's own `onImsLibInstance` ready signal — window.adobeIMS can be assigned before
  // the instance finishes authenticating, so isSignedInUser() would otherwise read false for a
  // signed-in user on first load.
  if (!window.adobeIMS?.isSignedInUser?.()) await waitForImsInstance().catch(() => {});
  const { adobeIMS } = window;
  if (!adobeIMS) return { noProfile: true };
  if (adobeIMS.isSignedInUser?.()) return (await adobeIMS.getProfile()) || { noProfile: true };
  // imslib's getProfile() rejects for guest tokens, so derive the guest type from the token.
  if (adobeIMS.getAccessToken?.()?.isGuestToken) return { account_type: 'guest' };
  return { noProfile: true };
}

export async function lazyCaptureProfile() {
  const isEventPage = getMetadata('event-id');
  if (!isEventPage) return;

  if (window.adobeIMS) {
    captureProfile();
    return;
  }

  await waitForImsInstance().catch(() => {});
  if (window.adobeIMS) captureProfile();

  async function captureProfile() {
    // An RSVP token always bypasses Adobe ID login, regardless of whether the
    // browser happens to have a signed-in IMS session (e.g. an assistant using their
    // own account to RSVP on a VIP's behalf). Validate the token itself server-side
    // and short-circuit the normal profile/attendee lookup.
    const rsvpToken = getRsvpToken();
    if (rsvpToken) {
      const eventId = getMetadata('event-id');
      const validateResp = await validateRsvpToken(eventId, rsvpToken);
      // The validate call is event-scoped, so the backend already 404s a token
      // minted for a different event (e.g. a copy-pasted/reused URL) — a plain
      // ok/not-ok check is enough; 401/404/409/410 all mean "not usable here".
      BlockMediator.set('rsvpData', null);
      BlockMediator.set('imsProfile', validateResp.ok
        ? { account_type: 'guest', rsvpToken, rsvpTokenEventId: validateResp.data?.eventId ?? eventId }
        : { account_type: 'guest', rsvpToken, rsvpTokenInvalid: true });
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
}
