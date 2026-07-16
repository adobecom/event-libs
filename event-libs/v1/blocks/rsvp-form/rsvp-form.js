import {
  createTag, getMetadata, getSusiOptions, getValidCampaignIdFromUrl,
} from '../../utils/utils.js';
import BlockMediator from '../../deps/block-mediator.min.js';
import { signIn, decorateEvent } from '../../utils/decorate.js';
import { dictionaryManager, getInviteOnlyNoCampaignMessage } from '../../utils/dictionary-manager.js';
import { getEvent, getAttendee } from '../../utils/esp-controller.js';
import { getMiloConfig, closeModal, sendAnalytics, decorateDefaultLinkAnalytics } from './milo-bridge.js';
import { resolveRsvpConfig } from './config.js';
import { createThemeHost, loadSwc } from './spectrum.js';
import { buildField } from './fields.js';
import { addConsentSuite } from './consent.js';
import { applyRules } from './rules.js';
import { personalizeForm, autoSelectConsentCountry } from './prefill.js';
import { wireSubmitClear, buildErrorMsg, VALID_REGISTRATION_STATUS } from './submit.js';
import { decorateSuccessScreen, showSuccessMsgFirstScreen } from './success-screen.js';

// Class-named authored rows replace events-form.js's `div:nth-of-type(1..5)`
// positional contract. `classifyRows` falls back to author order for pages
// that haven't adopted the class names yet — there is no legacy form-link
// row, since the field list always comes from `rsvp-config` metadata.
const ROW_SELECTORS = {
  hero: '.rsvp-form-hero',
  terms: '.rsvp-form-terms',
  success: '.rsvp-form-success',
  waitlist: '.rsvp-form-waitlist-success',
};

function classifyRows(block) {
  const named = {};
  Object.entries(ROW_SELECTORS).forEach(([key, selector]) => {
    named[key] = block.querySelector(`:scope > ${selector}`);
  });
  if (Object.values(named).some(Boolean)) return named;

  const [hero, terms, success, waitlist] = [...block.querySelectorAll(':scope > div')];
  return { hero, terms, success, waitlist };
}

async function eventFormSendAnalytics(bp, view) {
  const modal = bp.block.closest('.dialog-modal');
  if (!modal) return;
  const title = getMetadata('event-title');
  const name = title ? ` | ${title}` : '';
  const modalId = modal.id ? ` | ${modal.id}` : '';
  await sendAnalytics(new Event(`${view}${name}${modalId}`));
}

/** Moves the block's authored `.rsvp-form-terms` row into the form, before the submit button. */
function appendEventTerms(themeHost, termsRow) {
  if (!termsRow || !termsRow.textContent.trim()) return;
  const submitWrapper = themeHost.querySelector('[data-action="submit"]')?.closest('[data-field-id]');
  const wrapper = createTag('div', { class: 'field-wrapper rsvp-form-full-width rsvp-form-event-terms' });
  wrapper.append(...termsRow.querySelectorAll('p, ul'));
  if (submitWrapper) submitWrapper.before(wrapper);
  else themeHost.append(wrapper);
  termsRow.remove();
}

/**
 * Builds the `<sp-theme>` form from the resolved `rsvp-config` metadata:
 * fields, conditional rules, consent suite, and event terms. Returns `null`
 * when no config is present (nothing to render).
 */
async function buildForm(bp) {
  const config = resolveRsvpConfig();
  if (!config) return null;

  await Promise.all([
    loadSwc(config.fields.map((f) => f.type)),
    dictionaryManager.initialize(),
  ]);

  const themeHost = createThemeHost({ class: 'rsvp-form-fields' });
  const rules = [];

  config.fields.forEach((fd) => {
    if (fd.rules?.length) {
      try {
        rules.push({ fieldId: fd.field, rule: JSON.parse(fd.rules) });
      } catch (e) {
        window.lana?.log(`rsvp-form: invalid rule ${fd.rules}: ${e}`);
      }
    }
    themeHost.append(buildField(fd));
  });

  appendEventTerms(themeHost, bp.terms);

  const submitButton = themeHost.querySelector('[data-action="submit"]');
  const profile = BlockMediator.get('imsProfile');
  const showConsentForGuest = getMetadata('allow-guest-registration') === 'true' && profile?.account_type === 'guest';
  const forceConsent = getMetadata('force-consent-collection') === 'true';
  if ((showConsentForGuest || forceConsent) && submitButton) {
    await addConsentSuite(themeHost, submitButton);
  }

  themeHost.addEventListener('input', () => applyRules(themeHost, rules));
  themeHost.addEventListener('change', () => applyRules(themeHost, rules));
  applyRules(themeHost, rules);

  decorateEvent(themeHost);

  return themeHost;
}

/** Prefills/syncs the form once it's built, mirroring events-form.js's initFormBasedOnRSVPData. */
async function initFormState(bp) {
  const { block, formEl, eventHero, successScreen, waitlistScreen } = bp;
  const profile = BlockMediator.get('imsProfile');
  let confirmationViewTracked = false;

  const syncUIWithRSVPStatus = (rsvpData = BlockMediator.get('rsvpData')) => {
    if (!VALID_REGISTRATION_STATUS.includes(rsvpData?.registrationStatus)) return false;
    showSuccessMsgFirstScreen({
      formEl, eventHero, rsvpSuccessScreen: successScreen, waitlistSuccessScreen: waitlistScreen,
    });
    if (!confirmationViewTracked) {
      eventFormSendAnalytics(bp, 'Confirmation Modal View');
      confirmationViewTracked = true;
    }
    return true;
  };

  BlockMediator.subscribe('rsvpData', ({ newValue }) => syncUIWithRSVPStatus(newValue));
  if (syncUIWithRSVPStatus()) return;

  if (profile?.account_type !== 'guest') {
    let existingAttendeeData = {};
    const attendeeResp = await getAttendee();
    if (attendeeResp.ok) existingAttendeeData = attendeeResp.data;
    if (syncUIWithRSVPStatus()) return;
    personalizeForm(formEl, { profile, existingAttendeeData });
  }

  autoSelectConsentCountry(formEl, profile);

  if (block.querySelector('.form-success-msg.hidden')) {
    eventFormSendAnalytics(bp, 'Form View');
  }
}

/** Gates the form behind sign-in (for guest-disallowed pages) and invite-only/campaign checks. */
async function onProfile(bp) {
  const { block, eventHero } = bp;
  const profile = BlockMediator.get('imsProfile');
  const allowGuestReg = getMetadata('allow-guest-registration') === 'true';
  let handled = false;

  const handleProfile = async (resolvedProfile) => {
    if (!resolvedProfile || handled) return;
    handled = true;

    if ((resolvedProfile.noProfile || resolvedProfile.account_type === 'guest')
      && /#rsvp-form.*/.test(window.location.hash)
      && !allowGuestReg) {
      signIn(getSusiOptions(await getMiloConfig()));
      return;
    }

    eventHero?.classList.remove('loading');
    eventHero?.classList.add('rsvp-form-hero-decorated');

    try {
      let eventData = BlockMediator.get('eventData');
      if (!eventData) {
        const eventResp = await getEvent(getMetadata('event-id'));
        if (eventResp.ok) BlockMediator.set('eventData', eventResp.data);
        eventData = BlockMediator.get('eventData');
      }

      if (eventData?.inviteOnly && !getValidCampaignIdFromUrl()) {
        await dictionaryManager.initialize();
        bp.formContainer.append(createTag('p', { class: 'error' }, getInviteOnlyNoCampaignMessage(dictionaryManager)));
      } else {
        const formEl = await buildForm(bp);
        if (formEl) {
          bp.formContainer.append(formEl);
          [bp.successScreen, bp.waitlistScreen].forEach((screen) => {
            decorateSuccessScreen(screen, { closeModal, buildErrorMsg });
          });
          wireSubmitClear(formEl, { onSuccess: () => eventFormSendAnalytics(bp, 'Form Submit') });
          await initFormState({ ...bp, formEl });
        }
      }
    } finally {
      await decorateDefaultLinkAnalytics(block);
      block.classList.remove('loading');
    }
  };

  if (profile) {
    handleProfile(profile);
  } else {
    const unsubscribe = BlockMediator.subscribe('imsProfile', ({ newValue }) => {
      handleProfile(newValue);
      if (handled) unsubscribe();
    });
  }
}

export default async function init(el) {
  el.classList.add('loading');
  const { hero, terms, success, waitlist } = classifyRows(el);

  const formContainer = createTag('div', { class: 'rsvp-form-container' });
  if (hero) hero.after(formContainer);
  else el.prepend(formContainer);

  await onProfile({
    block: el,
    eventHero: hero,
    formContainer,
    terms,
    successScreen: success,
    waitlistScreen: waitlist,
  });
}
