// Loads and parses ./assets/track-icons.svg into per-icon { viewBox, innerHTML }
// entries, fetched and cached once. Chrome doesn't support cross-document
// <use href="external.svg#id"> (only Firefox does), so icons are resolved
// to inline markup instead — same reason icon-resolver.js does its own
// fetch+parse (see default-track-icons.js for why that real utility isn't
// imported directly here).
const SPRITE_URL = new URL('./assets/track-icons.svg', import.meta.url).href;

let spritePromise;

function parseSymbols(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const icons = {};
  doc.querySelectorAll('symbol').forEach((symbol) => {
    icons[symbol.id] = {
      viewBox: symbol.getAttribute('viewBox') || '0 0 24 24',
      innerHTML: symbol.innerHTML,
    };
  });
  return icons;
}

export function loadTrackIconSprite() {
  if (!spritePromise) {
    spritePromise = fetch(SPRITE_URL)
      .then((resp) => (resp.ok ? resp.text() : ''))
      .then(parseSymbols)
      .catch((error) => {
        window.lana?.log(`Failed to load track icon sprite: ${error}`);
        return {};
      });
  }
  return spritePromise;
}
