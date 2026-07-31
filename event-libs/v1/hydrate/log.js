export default function logHydration(message) {
  if (window.lana?.log) {
    window.lana.log(message);
    return;
  }
  window.addEventListener('load', () => window.lana?.log(message), { once: true });
}
