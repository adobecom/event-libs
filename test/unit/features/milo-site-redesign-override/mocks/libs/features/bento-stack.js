// Local stand-in for Milo's libs/features/bento-stack.js, served from a same-origin
// mock path (see icon-resolver.test.js for the same miloLibs-override pattern) so
// index.js's dynamic import doesn't need a real network call. Only implements enough
// of Milo's real behavior (set --slides/--card-idx, mark the section ready) to verify
// this feature's own wiring -- Milo's own test suite covers the real stacking math.
export default function initBentoStack(section) {
  const cards = [...section.querySelectorAll(':scope > .explore-card')];
  // Guard against re-entry: index.js's MutationObserver watches class attribute changes
  // on the whole subtree, so classList.add() below would otherwise re-trigger this.
  if (!cards.length || section.classList.contains('bento-stack-ready')) return;
  section.style.setProperty('--slides', cards.length);
  cards.forEach((card, i) => card.style.setProperty('--card-idx', i));
  section.classList.add('bento-stack-ready');
}
