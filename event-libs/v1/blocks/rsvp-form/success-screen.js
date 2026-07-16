import { createTag, getMetadata } from '../../utils/utils.js';
import BlockMediator from '../../deps/block-mediator.min.js';
import { deleteAttendeeFromEvent } from '../../utils/esp-controller.js';

/**
 * Decorates a success/waitlist screen row: two authored sub-screens
 * (confirmation, then post-cancel), wiring `#cancel` (unregister) and `#ok`
 * (close modal) CTAs. Ported from events-form.js's decorateSuccessScreen.
 * @param {HTMLElement} screen
 * @param {{ closeModal: Function, buildErrorMsg: Function }} deps - Milo's
 *   closeModal + submit.js's buildErrorMsg, injected to avoid this module
 *   depending on either directly.
 */
export function decorateSuccessScreen(screen, { closeModal, buildErrorMsg } = {}) {
  if (!screen) return;

  screen.classList.add('form-success-msg');
  const subScreens = [...screen.querySelectorAll(':scope > div')];
  const [firstScreen, secondScreen] = subScreens;

  subScreens.forEach((ss, i) => {
    ss.classList.add('hidden');
    const hgroup = createTag('hgroup');
    const eyebrow = ss.querySelector('p:first-child');
    ss.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => hgroup.append(h));
    if (eyebrow) {
      eyebrow.classList.add('eyebrow');
      hgroup.prepend(eyebrow);
    }
    ss.prepend(hgroup);

    ss.querySelectorAll('a').forEach((cta) => {
      const ctaUrl = new URL(cta.href);
      if (i === 0 && ctaUrl.hash.startsWith('#cancel')) {
        cta.parentElement.classList.add('post-rsvp-button-wrapper');
        cta.classList.add('con-button', 'outline', 'button-l', 'cancel-button');
        cta.addEventListener('click', async (e) => {
          e.preventDefault();
          cta.classList.add('loading');

          const profile = BlockMediator.get('imsProfile');
          const rsvpData = BlockMediator.get('rsvpData');
          const rsvpResp = profile?.account_type === 'guest'
            ? await deleteAttendeeFromEvent(getMetadata('event-id'), rsvpData?.attendeeId)
            : await deleteAttendeeFromEvent(getMetadata('event-id'));

          cta.classList.remove('loading');

          if (!rsvpResp.ok) {
            buildErrorMsg?.(screen, rsvpResp.status);
            return;
          }
          const result = rsvpResp.data?.espProvider || rsvpResp.data;
          if (!result) {
            buildErrorMsg?.(screen, 500);
            return;
          }
          if (result.status && result.status !== 204) {
            buildErrorMsg?.(screen, result.status);
            return;
          }

          BlockMediator.set('rsvpData', null);
          firstScreen.classList.add('hidden');
          secondScreen?.classList.remove('hidden');
        });
      } else if (ctaUrl.hash.startsWith('#ok')) {
        cta.classList.add('con-button', 'black', 'button-l');
        if (i === 0) cta.classList.add('ok-button');
        cta.addEventListener('click', async (e) => {
          e.preventDefault();
          const modal = screen.closest('.dialog-modal');
          if (modal) await closeModal?.(modal);
        });
      }
    });

    ss.classList.add(i === 0 ? 'first-screen' : 'second-screen');
  });

  screen.classList.add('hidden');
}

/**
 * Toggles the registered/waitlisted success screen based on the current
 * `rsvpData`. Ported from events-form.js's showSuccessMsgFirstScreen.
 * @returns {boolean} whether a valid registration status was found
 */
export function showSuccessMsgFirstScreen({
  formEl, eventHero, rsvpSuccessScreen, waitlistSuccessScreen,
}) {
  const rsvpData = BlockMediator.get('rsvpData');
  if (!rsvpData) return false;

  formEl?.classList.add('hidden');
  eventHero?.classList.add('hidden');

  const { registrationStatus } = rsvpData;
  if (registrationStatus === 'waitlisted') {
    waitlistSuccessScreen?.classList.remove('hidden');
    waitlistSuccessScreen?.querySelector('.first-screen')?.classList.remove('hidden');
  }
  if (registrationStatus === 'registered') {
    rsvpSuccessScreen?.classList.remove('hidden');
    rsvpSuccessScreen?.querySelector('.first-screen')?.classList.remove('hidden');
  }
  return true;
}
