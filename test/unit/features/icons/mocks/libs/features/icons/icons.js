// Local stand-in for Milo's libs/features/icons/icons.js, served from a same-origin
// mock path (see event-map.test.js for the same miloLibs-override pattern) so
// icon-resolver.js's dynamic import doesn't need a real network call.
export function fetchIcons() {
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('id', 'chevron-right');
  chevron.classList.add('icon-milo', 'icon-milo-chevron-right');

  // Not present in the federal mock — used to prove the Milo tier is still reached
  // when federal doesn't have an icon.
  const search = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  search.setAttribute('id', 'search');
  search.classList.add('icon-milo', 'icon-milo-search');

  return Promise.resolve({ 'chevron-right': chevron, search });
}
