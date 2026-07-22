export function decorateButtons(el) {
  el.querySelectorAll('em > strong > a').forEach((a) => a.classList.add('con-button', 'fill'));
  el.querySelectorAll('em > a').forEach((a) => a.classList.add('con-button', 'outline'));
}
