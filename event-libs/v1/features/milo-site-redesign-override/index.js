import { loadStyle } from '../../utils/utils.js';

const SELECTOR = '.section.bento.stack-mobile';

let bentoStackPromise;
let observer;

function loadBentoStack() {
  if (!bentoStackPromise) {
    const bentoStackCssUrl = new URL('./bento-stack.css', import.meta.url).href;
    bentoStackPromise = Promise.all([
      import('./bento-stack.js'),
      new Promise((resolve) => { loadStyle(bentoStackCssUrl, resolve); }),
    ]).then(([{ default: initBentoStack }]) => initBentoStack);
  }
  return bentoStackPromise;
}

async function handleSection(section) {
  try {
    const initBentoStack = await loadBentoStack();
    initBentoStack(section);
  } catch (e) {
    window.lana?.log(`milo-site-redesign-override failed: ${e}`, { tags: 'bento-stack', severity: 'info' });
  }
}

function handleMatches(root) {
  const matches = [];
  if (root.matches?.(SELECTOR)) matches.push(root);
  if (root.querySelectorAll) matches.push(...root.querySelectorAll(SELECTOR));
  return Promise.all(matches.map(handleSection));
}

// base-card.js itself already ships unchanged on Milo main and is loaded by Milo's own
// C2 block loader -- only its CSS has diverged (a handful of --s2a-color-content-* token
// swaps not yet on main). Since it's pure CSS with no measurement dependency, it just
// needs to be present on the page; unlike bento-stack there's no per-section init to run.
function loadBaseCardOverride() {
  const baseCardCssUrl = new URL('./base-card.css', import.meta.url).href;
  return new Promise((resolve) => { loadStyle(baseCardCssUrl, resolve); });
}

// Called from processAutoBlockLinks(), which runs before Milo's own block decoration —
// section-metadata hasn't added the bento/stack-mobile classes yet at call time, so an
// upfront scan alone would miss everything. The observer catches them whenever
// section-metadata's own init() actually applies them.
export default function initMiloSiteRedesignOverride() {
  if (document.body.dataset.bentoStackOverrideStarted) return Promise.resolve();
  document.body.dataset.bentoStackOverrideStarted = 'true';
  // Marks the page for base-card.css: Milo's own base-card.css loads later (during its
  // block loader's normal decoration, after this hook) and would otherwise win the
  // cascade on shared selectors. Scoping our override under this body class gives it
  // higher specificity than Milo's, independent of stylesheet load order.
  document.body.classList.add('milo-site-redesign-override');

  observer?.disconnect();
  const initialScan = handleMatches(document.body);

  observer = new MutationObserver((mutations) => {
    mutations.forEach(({ type, target, addedNodes }) => {
      if (type === 'attributes') handleMatches(target);
      else addedNodes.forEach((node) => { if (node.nodeType === 1) handleMatches(node); });
    });
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });

  return Promise.all([initialScan, loadBaseCardOverride()]);
}
