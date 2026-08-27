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

// Called from processAutoBlockLinks(), which runs before Milo's own block decoration —
// section-metadata hasn't added the bento/stack-mobile classes yet at call time, so an
// upfront scan alone would miss everything. The observer catches them whenever
// section-metadata's own init() actually applies them.
export default function initMiloSiteRedesignOverride() {
  if (document.body.dataset.bentoStackOverrideStarted) return Promise.resolve();
  document.body.dataset.bentoStackOverrideStarted = 'true';

  observer?.disconnect();
  const initialScan = handleMatches(document.body);

  observer = new MutationObserver((mutations) => {
    mutations.forEach(({ type, target, addedNodes }) => {
      if (type === 'attributes') handleMatches(target);
      else addedNodes.forEach((node) => { if (node.nodeType === 1) handleMatches(node); });
    });
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });

  return initialScan;
}
