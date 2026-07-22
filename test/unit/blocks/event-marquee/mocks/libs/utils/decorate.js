export function decorateButtons(el) {
  el.querySelectorAll('em > strong > a').forEach((a) => a.classList.add('con-button', 'fill'));
  el.querySelectorAll('em > a').forEach((a) => a.classList.add('con-button', 'outline'));
}

// Simplified stand-in for Milo's real decorateBlockBg — just enough for tests to
// verify event-marquee.js calls it and applies the given className.
export async function decorateBlockBg(block, node, { className = 'background' } = {}) {
  if (node.querySelector('img, video, a[href*=".mp4"]') || node.childElementCount > 1) {
    node.classList.add(className);
    return;
  }
  block.style.background = node.textContent;
  node.remove();
}
