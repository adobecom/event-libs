const LANA_POLL_INTERVAL_MS = 100;
const LANA_POLL_ATTEMPTS = 5;

export default function logHydration(message) {
  if (window.lana?.log) {
    window.lana.log(message);
    return;
  }

  let logged = false;
  const tryLog = () => {
    if (logged || !window.lana?.log) return false;
    window.lana.log(message);
    logged = true;
    return true;
  };

  // `load` fires at most once per document. It hasn't fired yet in the common case
  // (hydration runs before consumers call loadLana), so this is the primary path.
  window.addEventListener('load', tryLog, { once: true });

  if (document.readyState === 'complete') {
    // ...but if `load` already fired (e.g. a later fragment/personalization pass long
    // after initial page load), the listener above will never run natively, so also
    // poll briefly for a still-initializing lana instead of silently dropping the message.
    let attemptsLeft = LANA_POLL_ATTEMPTS;
    const poll = () => {
      if (tryLog() || attemptsLeft <= 0) return;
      attemptsLeft -= 1;
      setTimeout(poll, LANA_POLL_INTERVAL_MS);
    };
    poll();
  }
}
