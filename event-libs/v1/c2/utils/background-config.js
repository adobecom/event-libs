export function readBackgroundConfig(el) {
  const row = [...el.children].find(
    (r) => r.children[0]?.textContent.trim().toLowerCase() === 'background',
  );
  return row?.children[1]?.textContent.trim() || null;
}
