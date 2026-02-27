/**
 * Meta Pixel tracking integration for RSVP flows.
 *
 * Loaded during the delayed phase to avoid blocking LCP.
 * Gated on the `meta-pixel` metadata value which controls two modes:
 *
 *   "martech"  – Adobe Launch manages the pixel script; we only attach
 *                the RSVP event triggers (ViewContent, Lead, CompleteRegistration).
 *   <pixel-id> – We bootstrap the pixel ourselves with the given ID and
 *                attach the RSVP triggers.
 *
 * Tracking events:
 *   PageView             – fired when the pixel initialises (self-hosted mode only)
 *   ViewContent          – fired when an RSVP button scrolls into the viewport
 *   Lead                 – fired when an RSVP button is clicked
 *   CompleteRegistration – fired on successful RSVP registration
 */

import { getMetadata } from '../v1/utils/utils.js';
import BlockMediator from '../v1/deps/block-mediator.min.js';

const FBEVENTS_URL = 'https://connect.facebook.net/en_US/fbevents.js';

/**
 * Guards against firing CompleteRegistration on initial page-load hydration.
 * Set to `true` only after the user actively clicks an RSVP button.
 */
let rsvpFormInteracted = false;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Safely invoke `window.fbq`.
 * No-ops gracefully if the pixel script failed to load or has not yet initialised.
 */
function safeFbq(...args) {
  try {
    if (typeof window.fbq === 'function') {
      window.fbq(...args);
    }
  } catch (e) {
    window.lana?.log(`Meta Pixel fbq call failed: ${e.message}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Pixel bootstrap                                                   */
/* ------------------------------------------------------------------ */

/**
 * Inject the Meta Pixel base code and initialise it with the given Pixel ID.
 * Mirrors the official Meta Pixel snippet in a readable form.
 *
 * @param {string} pixelId – The Pixel / client ID from metadata.
 */
function loadPixelScript(pixelId) {
  if (window.fbq) return;

  // Set up the lightweight fbq command queue that buffers calls
  // until the full fbevents.js library loads and takes over.
  const n = function fbqStub(...args) {
    if (n.callMethod) {
      n.callMethod.apply(n, args);
    } else {
      n.queue.push(args);
    }
  };

  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];

  // Asynchronously load the full Meta Pixel library
  const script = document.createElement('script');
  script.async = true;
  script.src = FBEVENTS_URL;
  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }

  safeFbq('init', pixelId);
  safeFbq('track', 'PageView');
}

/* ------------------------------------------------------------------ */
/*  RSVP tracking hooks                                               */
/* ------------------------------------------------------------------ */

/**
 * Fire `ViewContent` once the first RSVP button scrolls into the viewport.
 * Uses IntersectionObserver and disconnects after the first observation.
 */
function attachViewContentTracking() {
  const rsvpBtns = document.querySelectorAll('.rsvp-btn');
  if (!rsvpBtns.length) return;

  let tracked = false;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && !tracked) {
        tracked = true;
        safeFbq('track', 'ViewContent');
        observer.disconnect();
        break;
      }
    }
  }, { threshold: 0.5 });

  rsvpBtns.forEach((btn) => observer.observe(btn));
}

/**
 * Fire `Lead` whenever an RSVP button is clicked.
 * Uses event delegation so dynamically added buttons are covered.
 */
function attachLeadTracking() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.rsvp-btn')) {
      rsvpFormInteracted = true;
      safeFbq('track', 'Lead');
    }
  }, { capture: true });
}

/**
 * Fire `CompleteRegistration` when an RSVP submission succeeds.
 *
 * Only fires after the user has actively clicked an RSVP button (so
 * `rsvpFormInteracted` is `true`), preventing false positives when
 * `rsvpData` is hydrated on initial page load for returning attendees.
 */
function attachCompleteRegistrationTracking() {
  const VALID_STATUSES = ['registered', 'waitlisted'];

  BlockMediator.subscribe('rsvpData', ({ newValue }) => {
    if (
      rsvpFormInteracted
      && newValue
      && VALID_STATUSES.includes(newValue.registrationStatus)
    ) {
      safeFbq('track', 'CompleteRegistration');
      rsvpFormInteracted = false;
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Main entry point – called from eventsDelayedActions() in libs.js.
 * No-ops when the `meta-pixel` metadata tag is absent.
 *
 * Two modes:
 *   "martech"  – skip pixel bootstrap (Adobe Launch owns it), attach triggers only.
 *   <pixel-id> – bootstrap the pixel with the given ID, then attach triggers.
 */
export default function init() {
  const metaPixel = getMetadata('meta-pixel');
  if (!metaPixel) return;

  const isMartech = metaPixel.toLowerCase() === 'martech';

  if (!isMartech) {
    loadPixelScript(metaPixel);
  }

  attachViewContentTracking();
  attachLeadTracking();
  attachCompleteRegistrationTracking();
}
