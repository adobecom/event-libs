// Fetches+parses track-icons.svg into per-icon { viewBox, innerHTML }, cached
// once. Chrome doesn't support cross-document <use href="external.svg#id">,
// so icons are inlined instead of referenced.
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
