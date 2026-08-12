// Local stand-in for Milo's libs/features/icons/icons.js, served from a same-origin
// mock path (see event-map.test.js for the same miloLibs-override pattern) so
// icon-resolver.js's dynamic import doesn't need a real network call.
export function fetchIcons() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'chevron-right');
  svg.classList.add('icon-milo', 'icon-milo-chevron-right');
  return Promise.resolve({ 'chevron-right': svg });
}
