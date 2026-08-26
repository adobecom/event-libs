import { loadStyle } from '../../utils/utils.js';

export default async function initMiloSiteRedesignOverride() {
  const sections = document.querySelectorAll('.section.bento.stack-mobile');
  if (!sections.length) return;

  const bentoStackCssUrl = new URL('./bento-stack.css', import.meta.url).href;
  const [{ default: initBentoStack }] = await Promise.all([
    import('./bento-stack.js'),
    new Promise((resolve) => { loadStyle(bentoStackCssUrl, resolve); }),
  ]);

  sections.forEach(initBentoStack);
}
