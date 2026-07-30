/**
 * Logs a hydration message. Hydration runs inside decorateEvent, which consumers call
 * before Milo's loadLana defines window.lana — so buffer until load rather than drop it.
 * @param {string} message
 */
export default function logHydration(message) {
  if (window.lana?.log) {
    window.lana.log(message);
    return;
  }
  window.addEventListener('load', () => window.lana?.log(message), { once: true });
}
