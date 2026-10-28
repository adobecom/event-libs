export function decorateButtons(el) {
  el.querySelectorAll('em > strong > a').forEach((a) => a.classList.add('con-button', 'fill'));
  el.querySelectorAll('em > a').forEach((a) => a.classList.add('con-button', 'outline'));
}

// Simplified stand-in for Milo's real decorateBlockBg — just enough for tests to
// verify event-marquee.js calls it and applies the given className.
export async function decorateBlockBg(block, node, { className = 'background' } = {}) {
  if (node.querySelector('img, video, a[href*=".mp4"]') || node.childElementCount > 1) {
    node.classList.add(className);
    const viewports = node.childElementCount === 2
      ? [['mobile-only'], ['tablet-only', 'desktop-only']]
      : [['mobile-only'], ['tablet-only'], ['desktop-only']];
    [...node.children].forEach((child, i) => {
      if (node.childElementCount > 1 && i < viewports.length) {
        child.classList.add(...viewports[i]);
      }
    });
    return;
  }
  block.style.background = node.textContent;
  node.remove();
}
